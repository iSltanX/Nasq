// نقل خام إلى المزود (OpenAI-compatible) — طبقة لا تعرف عقدًا ولا prompt:
// تستلم رسائل جاهزة وحرارة وسقف توكنات وتعيد نص الاستجابة كما ورد.
// قرار التكلفة الوحيد هنا بنيوي لا سلوكي: تعطيل تفكير Gemini في كل محاولة
// (انظر build_request_body). (نُقل من main.rs حرفيًا في تحصين v4.1)
use serde_json::{json, Value};

use super::settings::Settings;

/// يستخرج JSON من ناتج النموذج بحذر: يزيل أسوار الكود ثم يبحث عن أول كائن JSON.
pub(crate) fn extract_json(content: &str) -> Option<Value> {
    let trimmed = content.trim();

    if let Ok(v) = serde_json::from_str::<Value>(trimmed) {
        return Some(v);
    }

    // إزالة أسوار الكود ```json ... ```
    let unfenced = trimmed
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    if let Ok(v) = serde_json::from_str::<Value>(unfenced) {
        return Some(v);
    }

    // البحث عن أول كائن { ... } داخل النص
    let start = trimmed.find('{')?;
    let end = trimmed.rfind('}')?;
    if end > start {
        if let Ok(v) = serde_json::from_str::<Value>(&trimmed[start..=end]) {
            return Some(v);
        }
    }
    None
}

/// يبني جسم طلب Chat Completions.
/// المحاولة الأولى تضيف response_format، وإذا رُفض الطلب تُعاد المحاولة
/// بجسم خالٍ منه. أما تعطيل «التفكير» لمزود Gemini حصرًا — بصيغة
/// OpenAI-compatible الموثقة من Google:
/// extra_body.google.thinking_config.thinking_budget = 0
/// فقرار تكلفة غير قابل للإسقاط: يُرسل في كل محاولة بلا استثناء، حتى لا
/// تشغّل إعادةُ المحاولة التفكيرَ الديناميكي بصمت (أبطأ وأغلى بأضعاف).
/// إن رفض المزود هذا الحقل يومًا فليفشل الطلب بخطأ ظاهر، لا أن يمرّ غاليًا.
pub(crate) fn build_request_body(
    model: &str,
    messages: &Value,
    max_tokens: u64,
    temperature: f64,
    include_response_format: bool,
    is_gemini: bool,
) -> Value {
    let mut body = json!({
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens
    });
    if include_response_format {
        body["response_format"] = json!({ "type": "json_object" });
    }
    if is_gemini {
        body["extra_body"] =
            json!({ "google": { "thinking_config": { "thinking_budget": 0 } } });
    }
    body
}

pub(crate) async fn call_api(
    client: &reqwest::Client,
    url: &str,
    api_key: &str,
    body: &Value,
) -> Result<reqwest::Response, String> {
    client
        .post(url)
        .bearer_auth(api_key)
        .json(body)
        .send()
        .await
        .map_err(|e| {
            if e.is_timeout() {
                "انتهت مهلة الاتصال — حاول مرة أخرى.".to_string()
            } else {
                "فشل الاتصال بالخدمة — تحقق من الإنترنت ومن Base URL.".to_string()
            }
        })
}

/// يرسل الرسائل إلى المزود ويعيد نص المحتوى الخام — مشترك بين «نسّق» و«أسطر أقل/أكثر»
pub(crate) async fn request_completion(
    settings: &Settings,
    messages: &Value,
    max_tokens: u64,
    temperature: f64,
) -> Result<String, String> {
    let api_key = settings.api_key.trim();
    if api_key.is_empty() {
        return Err("لا يوجد مفتاح API — أضفه من لوحة الإعدادات أولًا.".to_string());
    }

    let url = format!(
        "{}/chat/completions",
        settings.base_url.trim().trim_end_matches('/')
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|_| "تعذّر تهيئة الاتصال.".to_string())?;

    // تعطيل «التفكير» يُرسل لمزود Gemini حصرًا حتى لا يكسر Groq أو OpenRouter
    let is_gemini = settings
        .base_url
        .to_lowercase()
        .contains("generativelanguage.googleapis.com");

    let first_body = build_request_body(
        &settings.model,
        messages,
        max_tokens,
        temperature,
        true,
        is_gemini,
    );
    let mut response = call_api(&client, &url, api_key, &first_body).await?;

    // إن رفض المزود response_format (400 أو 422) نعيد المحاولة دونه —
    // تعطيل التفكير يبقى في جسم الإعادة (انظر build_request_body)
    let first_status = response.status().as_u16();
    if first_status == 400 || first_status == 422 {
        let plain_body = build_request_body(
            &settings.model,
            messages,
            max_tokens,
            temperature,
            false,
            is_gemini,
        );
        response = call_api(&client, &url, api_key, &plain_body).await?;
    }

    let status = response.status();
    if !status.is_success() {
        return Err(match status.as_u16() {
            401 | 403 => "المفتاح غير صحيح أو غير مفعّل — راجع لوحة الإعدادات.".to_string(),
            404 => "النموذج غير متاح — تحقق من اسم النموذج في الإعدادات.".to_string(),
            429 => "تجاوزت حد الاستخدام مؤقتًا — انتظر قليلًا ثم أعد المحاولة.".to_string(),
            500..=599 => "الخدمة تواجه خللًا مؤقتًا — أعد المحاولة بعد قليل.".to_string(),
            code => format!("فشل الطلب (رمز {}). تحقق من الإعدادات وأعد المحاولة.", code),
        });
    }

    let payload: Value = response
        .json()
        .await
        .map_err(|_| "تعذّرت قراءة استجابة الخدمة.".to_string())?;

    let content = payload["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();

    if content.is_empty() {
        return Err("أعاد النموذج نتيجة فارغة — أعد المحاولة.".to_string());
    }

    // ناتج مقطوع بسبب بلوغ سقف التوكنات → رسالة واضحة بدل «ناتج غير صالح»
    if payload["choices"][0]["finish_reason"].as_str() == Some("length") {
        return Err("النص أطول من حد المعالجة — قسّمه إلى أجزاء أقصر ونسّق كل جزء على حدة.".to_string());
    }

    Ok(content)
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gemini_first_attempt_disables_thinking() {
        let messages = json!([{ "role": "user", "content": "نص" }]);
        let body = build_request_body("gemini-2.5-flash", &messages, 2000, 0.85, true, true);
        assert_eq!(
            body["extra_body"]["google"]["thinking_config"]["thinking_budget"],
            0
        );
        assert_eq!(body["response_format"]["type"], "json_object");
        assert_eq!(body["max_tokens"], 2000);
        assert_eq!(body["temperature"], 0.85);
    }

    #[test]
    fn other_providers_never_receive_gemini_fields() {
        let messages = json!([]);
        let body = build_request_body("llama-3.3-70b-versatile", &messages, 2000, 0.85, true, false);
        assert!(body.get("extra_body").is_none());
        assert_eq!(body["response_format"]["type"], "json_object");
    }

    #[test]
    fn retry_body_drops_response_format_but_never_thinking_disable() {
        // جسم الإعادة يسقط response_format فقط — تعطيل تفكير Gemini لا يسقط
        // أبدًا، فلا تشغّل إعادةُ المحاولة التفكيرَ الديناميكي بصمت
        let messages = json!([]);
        let body = build_request_body("any-model", &messages, 2000, 0.85, false, true);
        assert!(body.get("response_format").is_none());
        assert_eq!(
            body["extra_body"]["google"]["thinking_config"]["thinking_budget"],
            0
        );
        assert_eq!(body["model"], "any-model");
        assert_eq!(body["max_tokens"], 2000);
        // ولغير Gemini: جسم الإعادة مجرد تمامًا كما كان
        let plain = build_request_body("any-model", &messages, 2000, 0.85, false, false);
        assert!(plain.get("extra_body").is_none());
        assert!(plain.get("response_format").is_none());
    }

    #[test]
    fn gemini_thinking_disabled_on_every_attempt_regardless_of_model() {
        // الضمان الصلب: أي طلب وجهته Gemini يحمل thinking_budget = 0 في كل
        // محاولة وأيًّا كان النموذج المكتوب في الإعدادات — قرار تكلفة لا إعداد
        let messages = json!([{ "role": "user", "content": "نص" }]);
        for model in ["gemini-2.5-flash", "gemini-2.5-pro", "أي-نموذج-مستقبلي"] {
            for include_rf in [true, false] {
                let body = build_request_body(model, &messages, 3000, 0.85, include_rf, true);
                assert_eq!(
                    body["extra_body"]["google"]["thinking_config"]["thinking_budget"],
                    0,
                    "تعطيل التفكير غائب عن {model} (include_rf={include_rf})"
                );
            }
        }
    }


    #[test]
    fn gemini_detection_is_by_base_url() {
        let gemini = "https://generativelanguage.googleapis.com/v1beta/openai/";
        let groq = "https://api.groq.com/openai/v1";
        let openrouter = "https://openrouter.ai/api/v1";
        assert!(gemini.to_lowercase().contains("generativelanguage.googleapis.com"));
        assert!(!groq.to_lowercase().contains("generativelanguage.googleapis.com"));
        assert!(!openrouter.to_lowercase().contains("generativelanguage.googleapis.com"));
    }
}
