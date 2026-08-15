// نقل خام إلى المزود (OpenAI-compatible) — طبقة لا تعرف عقدًا ولا prompt:
// تستلم رسائل جاهزة وحرارة وسقف توكنات وتعيد نص الاستجابة كما ورد.
// قرار التكلفة الوحيد هنا بنيوي لا سلوكي: تعطيل تفكير Gemini في كل محاولة
// (انظر build_request_body). (نُقل من main.rs حرفيًا في تحصين v4.1)
use serde_json::{json, Value};

use super::settings::{Settings, PROVIDER_OLLAMA};

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
/// بجسم خالٍ منه. أما ميزانية «التفكير» فقرار تكلفة يحدده الوضع المنادي
/// (نسق: صفر مقفول — التنسيق شكل لا حُكم؛ شَذْب: ميزانية محدودة — الحُكم
/// وظيفته) ويُرسل في كل محاولة بلا استثناء، حتى لا تشغّل إعادةُ المحاولة
/// التفكيرَ الديناميكي بصمت (أبطأ وأغلى بأضعاف). لكل مزود صيغته:
/// - Gemini المباشر: extra_body.google.thinking_config.thinking_budget
/// - OpenRouter (v4.3): الحقل reasoning — صفر يعني تعطيلًا صريحًا، وما
///   فوقه سقف توكنات تفكير. قبل هذا كان تعطيل التفكير لا يسري عبر
///   OpenRouter فيُدفع ثمن التفكير الديناميكي بصمت على نماذج Gemini.
/// إن رفض المزود حقله يومًا فليفشل الطلب بخطأ ظاهر، لا أن يمرّ غاليًا.
pub(crate) fn build_request_body(
    model: &str,
    messages: &Value,
    max_tokens: u64,
    temperature: f64,
    include_response_format: bool,
    is_gemini: bool,
    is_openrouter: bool,
    thinking_budget: u64,
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
            json!({ "google": { "thinking_config": { "thinking_budget": thinking_budget } } });
    }
    if is_openrouter {
        body["reasoning"] = if thinking_budget == 0 {
            json!({ "enabled": false })
        } else {
            json!({ "max_tokens": thinking_budget })
        };
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

/// يرسل الرسائل إلى المزود ويعيد نص المحتوى الخام — نقل مشترك بين الوضعين،
/// وميزانية التفكير يمررها الوضع المنادي (لا قيمة افتراضية هنا عمدًا)
pub(crate) async fn request_completion(
    settings: &Settings,
    messages: &Value,
    max_tokens: u64,
    temperature: f64,
    thinking_budget: u64,
) -> Result<String, String> {
    // Ollama المحلي: بروتوكول مختلف تمامًا (لا مفتاح) — فرع مبكر ومنفصل، ولا
    // يمسّ المسار السحابي أدناه بشيء. ميزانية التفكير نفسها (لا قيمة جديدة)
    // تُترجم لحقل Ollama الخاص بها، فيتوقف نسق شَذْب على تصميمهما نفسه
    if settings.provider.trim() == PROVIDER_OLLAMA {
        return request_completion_ollama(settings, messages, thinking_budget).await;
    }

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

    // حقل ضبط التفكير يُرسل بصيغة المزود المطابق حصرًا حتى لا يكسر البقية
    let base_lower = settings.base_url.to_lowercase();
    let is_gemini = base_lower.contains("generativelanguage.googleapis.com");
    let is_openrouter = base_lower.contains("openrouter.ai");

    let first_body = build_request_body(
        &settings.model,
        messages,
        max_tokens,
        temperature,
        true,
        is_gemini,
        is_openrouter,
        thinking_budget,
    );
    let mut response = call_api(&client, &url, api_key, &first_body).await?;

    // إن رفض المزود response_format (400 أو 422) نعيد المحاولة دونه —
    // ضبط التفكير يبقى في جسم الإعادة (انظر build_request_body)
    let first_status = response.status().as_u16();
    if first_status == 400 || first_status == 422 {
        let plain_body = build_request_body(
            &settings.model,
            messages,
            max_tokens,
            temperature,
            false,
            is_gemini,
            is_openrouter,
            thinking_budget,
        );
        response = call_api(&client, &url, api_key, &plain_body).await?;
    }

    let status = response.status();
    if !status.is_success() {
        return Err(match status.as_u16() {
            401 | 403 => "المفتاح غير صحيح أو غير مفعّل — راجع لوحة الإعدادات.".to_string(),
            // نفاد الرصيد له اسمه الصريح (الإصلاح ٢-ج) — كان يسقط في الذراع العام
            402 => "نفد رصيد المزوّد — اشحن الحساب ثم أعد المحاولة.".to_string(),
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

/// جسم طلب /api/chat لـ Ollama — دالة صرفة قابلة للاختبار بمعزل عن الشبكة،
/// على غرار build_request_body للمسار السحابي. "format":"json" يُلزم Ollama
/// بمخرج JSON فعليًا (لا الاتكال على نص العقد وحده) — نفس ضمان response_format
/// الذي يحصل عليه المسار السحابي، إذ عقد نسق/شَذْب يطلب JSON من أي مزوّد.
/// "think" ترجمة ميزانية التفكير نفسها لصيغة Ollama: صفر يعني تعطيلًا صريحًا
/// كما في الحقول المقابلة للمزوّدات الأخرى، لا قيمة جديدة ولا قرار تكلفة جديد.
fn build_ollama_chat_body(model: &str, messages: &Value, thinking_budget: u64) -> Value {
    json!({
        "model": model,
        "messages": messages,
        "stream": false,
        "format": "json",
        "think": thinking_budget > 0
    })
}

/// مطابقة اسم النموذج المضبوط بأسماء /api/tags: تطابق حرفي أولًا، وإن فشل
/// فتجريد وسم ":latest" الضمني من الطرفين — فـ"qwen3" يطابق "qwen3:latest"
/// كما يطابقه نداء /api/chat الفعلي (Ollama يحلّه ضمنيًا خلف الكواليس)
fn strip_latest_tag(s: &str) -> &str {
    s.strip_suffix(":latest").unwrap_or(s)
}

fn ollama_model_matches(configured: &str, listed: &str) -> bool {
    if configured.eq_ignore_ascii_case(listed) {
        return true;
    }
    strip_latest_tag(configured).eq_ignore_ascii_case(strip_latest_tag(listed))
}

/// نقل مخصّص لـ Ollama المحلي — واجهته الرسمية مختلفة عن OpenAI-compatible
/// (بلا مفتاح، وجسم/استجابة مختلفا الشكل)، ففرع منفصل داخل نقل shared نفسه
/// لا نظام موازٍ. لا محاولة ثانية ولا streaming ولا تحويل تلقائي لمزوّد آخر
/// عند الفشل — خطأ واضح فقط.
async fn request_completion_ollama(
    settings: &Settings,
    messages: &Value,
    thinking_budget: u64,
) -> Result<String, String> {
    let base = settings.base_url.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("عنوان خادم Ollama غير مضبوط — أضفه من لوحة الإعدادات.".to_string());
    }
    let model = settings.model.trim();
    if model.is_empty() {
        return Err("اسم نموذج Ollama غير مضبوط — أضفه من لوحة الإعدادات.".to_string());
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|_| "تعذّر تهيئة الاتصال.".to_string())?;

    let body = build_ollama_chat_body(model, messages, thinking_budget);
    let url = format!("{}/api/chat", base);

    let response = client.post(&url).json(&body).send().await.map_err(|e| {
        if e.is_timeout() {
            "انتهت مهلة الاتصال — حاول مرة أخرى.".to_string()
        } else if e.is_connect() {
            "Ollama غير مشغّل على هذا الجهاز.".to_string()
        } else {
            "تعذر الاتصال بالعنوان المحلي.".to_string()
        }
    })?;

    let status = response.status();
    if !status.is_success() {
        return Err(match status.as_u16() {
            404 => "النموذج المحدد غير موجود.".to_string(),
            code => format!("فشل الطلب (رمز {}). تحقق من الإعدادات وأعد المحاولة.", code),
        });
    }

    let payload: Value = response
        .json()
        .await
        .map_err(|_| "استجابة Ollama غير صالحة.".to_string())?;

    let content = payload["message"]["content"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();

    if content.is_empty() {
        return Err("أعاد النموذج نتيجة فارغة — أعد المحاولة.".to_string());
    }

    Ok(content)
}

/// اختبار اتصال Ollama من لوحة الإعدادات: GET /api/tags — يتحقق أن الخادم
/// يعمل وأن النموذج المطلوب مُنزَّل. لا يمسّ settings.json ولا يعرف عقدًا؛
/// يستقبل القيم من الحقول مباشرة (قد تكون غير محفوظة بعد).
#[tauri::command]
pub(crate) async fn test_ollama_connection(base_url: String, model: String) -> Result<String, String> {
    let base = base_url.trim().trim_end_matches('/');
    if base.is_empty() {
        return Err("تعذر الاتصال بالعنوان المحلي.".to_string());
    }
    let model = model.trim();

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|_| "تعذّر تهيئة الاتصال.".to_string())?;

    let url = format!("{}/api/tags", base);
    let response = client.get(&url).send().await.map_err(|e| {
        if e.is_connect() {
            "Ollama غير مشغّل على هذا الجهاز.".to_string()
        } else {
            "تعذر الاتصال بالعنوان المحلي.".to_string()
        }
    })?;

    if !response.status().is_success() {
        return Err("استجابة Ollama غير صالحة.".to_string());
    }

    let payload: Value = response
        .json()
        .await
        .map_err(|_| "استجابة Ollama غير صالحة.".to_string())?;

    let models = payload["models"]
        .as_array()
        .ok_or_else(|| "استجابة Ollama غير صالحة.".to_string())?;

    if model.is_empty() {
        return Ok("تم الاتصال بـ Ollama.".to_string());
    }

    let found = models.iter().any(|m| {
        m["name"]
            .as_str()
            .is_some_and(|n| ollama_model_matches(model, n))
            || m["model"]
                .as_str()
                .is_some_and(|n| ollama_model_matches(model, n))
    });

    if found {
        Ok("تم الاتصال بـ Ollama.".to_string())
    } else {
        Err("النموذج المحدد غير موجود.".to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn gemini_first_attempt_carries_thinking_budget() {
        let messages = json!([{ "role": "user", "content": "نص" }]);
        let body = build_request_body("gemini-2.5-flash", &messages, 2000, 0.85, true, true, false, 0);
        assert_eq!(
            body["extra_body"]["google"]["thinking_config"]["thinking_budget"],
            0
        );
        assert_eq!(body["response_format"]["type"], "json_object");
        assert_eq!(body["max_tokens"], 2000);
        assert_eq!(body["temperature"], 0.85);
        // وميزانية غير صفرية تمر كما هي — لوضعٍ يريد حُكمًا لا شكلًا
        let thinking = build_request_body("gemini-2.5-flash", &messages, 2000, 0.3, true, true, false, 1024);
        assert_eq!(
            thinking["extra_body"]["google"]["thinking_config"]["thinking_budget"],
            1024
        );
    }

    #[test]
    fn other_providers_never_receive_thinking_fields() {
        let messages = json!([]);
        let body = build_request_body("llama-3.3-70b-versatile", &messages, 2000, 0.85, true, false, false, 0);
        assert!(body.get("extra_body").is_none());
        assert!(body.get("reasoning").is_none());
        assert_eq!(body["response_format"]["type"], "json_object");
    }

    #[test]
    fn openrouter_gets_reasoning_field_disabled_at_zero_and_capped_above() {
        // فجوة اكتشفتها معايرة v4.3: تعطيل التفكير كان لا يسري عبر OpenRouter
        // فيُدفع ثمن التفكير الديناميكي بصمت — الحقل reasoning يقفلها
        let messages = json!([]);
        let off = build_request_body("google/gemini-2.5-flash", &messages, 2000, 0.85, true, false, true, 0);
        assert_eq!(off["reasoning"]["enabled"], false);
        assert!(off.get("extra_body").is_none());
        let capped = build_request_body("google/gemini-2.5-flash", &messages, 2000, 0.3, true, false, true, 1024);
        assert_eq!(capped["reasoning"]["max_tokens"], 1024);
    }

    #[test]
    fn retry_body_drops_response_format_but_never_thinking_control() {
        // جسم الإعادة يسقط response_format فقط — ضبط التفكير لا يسقط أبدًا،
        // فلا تشغّل إعادةُ المحاولة التفكيرَ الديناميكي بصمت (لدى أي مزود)
        let messages = json!([]);
        let body = build_request_body("any-model", &messages, 2000, 0.85, false, true, false, 0);
        assert!(body.get("response_format").is_none());
        assert_eq!(
            body["extra_body"]["google"]["thinking_config"]["thinking_budget"],
            0
        );
        let or_retry = build_request_body("any-model", &messages, 2000, 0.85, false, false, true, 0);
        assert!(or_retry.get("response_format").is_none());
        assert_eq!(or_retry["reasoning"]["enabled"], false);
        // ولغير الاثنين: جسم الإعادة مجرد تمامًا كما كان
        let plain = build_request_body("any-model", &messages, 2000, 0.85, false, false, false, 0);
        assert!(plain.get("extra_body").is_none());
        assert!(plain.get("reasoning").is_none());
        assert!(plain.get("response_format").is_none());
    }

    #[test]
    fn thinking_budget_flows_untouched_on_every_attempt_regardless_of_model() {
        // الضمان الصلب: الميزانية التي يقررها الوضع تصل جسم الطلب كما هي في
        // كل محاولة وأيًّا كان النموذج — النقل لا يملك رأيًا في التكلفة
        let messages = json!([{ "role": "user", "content": "نص" }]);
        for model in ["gemini-2.5-flash", "gemini-2.5-pro", "أي-نموذج-مستقبلي"] {
            for include_rf in [true, false] {
                for budget in [0u64, 1024] {
                    let body = build_request_body(model, &messages, 3000, 0.85, include_rf, true, false, budget);
                    assert_eq!(
                        body["extra_body"]["google"]["thinking_config"]["thinking_budget"],
                        budget,
                        "الميزانية تاهت عن {model} (include_rf={include_rf})"
                    );
                }
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

    #[test]
    fn ollama_body_has_no_auth_field_and_forces_json_format() {
        // لا مفتاح API إطلاقًا في جسم أو رأس طلب Ollama — الضمان الصلب لهذا المزوّد
        let messages = json!([{ "role": "system", "content": "s" }, { "role": "user", "content": "u" }]);
        let body = build_ollama_chat_body("qwen3:8b", &messages, 0);
        assert_eq!(body["model"], "qwen3:8b");
        assert_eq!(body["messages"], messages);
        assert_eq!(body["stream"], false);
        // عقد نسق/شَذْب يطلب JSON من أي مزوّد — "format" يُلزم Ollama به فعليًا
        // بدل الاتكال على نص العقد وحده، كما يفعل response_format للمسار السحابي
        assert_eq!(body["format"], "json");
        // الشكل مقفول تمامًا: خمسة حقول لا أكثر — لا مفتاح ولا رأس اعتماد بأي اسم
        let mut keys: Vec<&str> = body.as_object().unwrap().keys().map(String::as_str).collect();
        keys.sort_unstable();
        assert_eq!(keys, ["format", "messages", "model", "stream", "think"]);
    }

    #[test]
    fn ollama_think_field_mirrors_thinking_budget_like_other_providers() {
        let messages = json!([]);
        // نسق: ميزانية مقفولة صفرًا — تعطيل صريح كما في Gemini/OpenRouter
        let nasaq_body = build_ollama_chat_body("qwen3:8b", &messages, 0);
        assert_eq!(nasaq_body["think"], false);
        // شَذْب: ميزانية غير صفرية — تفكير مفعَّل
        let shadhb_body = build_ollama_chat_body("qwen3:8b", &messages, 1024);
        assert_eq!(shadhb_body["think"], true);
    }

    #[test]
    fn ollama_model_matches_handles_implicit_latest_tag() {
        // تطابق حرفي مباشر (الحالة الشائعة: وسم صريح كـ qwen3:8b)
        assert!(ollama_model_matches("qwen3:8b", "qwen3:8b"));
        // Ollama يحلّ الاسم غير الموسوم إلى ":latest" ضمنيًا خلف الكواليس عند
        // /api/chat الفعلي — فمطابقة اختبار الاتصال يجب أن تحاكي ذلك لا أن
        // تُبلّغ زورًا بغياب نموذج موجود فعلًا
        assert!(ollama_model_matches("qwen3", "qwen3:latest"));
        assert!(ollama_model_matches("qwen3:latest", "qwen3"));
        // وسوم مختلفة فعلًا ليست تطابقًا
        assert!(!ollama_model_matches("qwen3:8b", "qwen3:14b"));
        assert!(!ollama_model_matches("qwen3", "llama3"));
    }
}
