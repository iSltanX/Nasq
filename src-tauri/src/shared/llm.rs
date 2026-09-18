// نقل خام إلى المزود (OpenAI-compatible، مع فرعين أصليين لـ Ollama وClaude) —
// طبقة لا تعرف عقدًا ولا prompt: تستلم رسائل جاهزة وحرارة وسقف توكنات وتعيد
// نص الاستجابة كما ورد. قرار التكلفة الوحيد هنا بنيوي لا سلوكي: تعطيل تفكير
// Gemini في كل محاولة (انظر build_request_body). (نُقل من main.rs حرفيًا في
// تحصين v4.1)
use reqwest::header::{HeaderMap, HeaderValue, CONTENT_TYPE};
use serde_json::{json, Value};

use super::settings::{Settings, OPENAI_API_HOST, PROVIDER_ANTHROPIC, PROVIDER_OLLAMA};

// رسائل يتقاسمها المساران السحابيان (المتوافق مع OpenAI وClaude) — نص واحد
// لكل حالة حتى لا تنجرف صياغة أحدهما عن الآخر
const ERR_NO_API_KEY: &str = "لا يوجد مفتاح API — أضفه من لوحة الإعدادات أولًا.";
// المفتاح محفوظ لكن سلسلة المفاتيح لم تُقرأ — رسالة غير رسالة من لا مفتاح له،
// فالعلاج مختلف: إذنُ وصول لا إدخالُ مفتاح جديد
const ERR_KEY_LOCKED: &str =
    "تعذّر الوصول إلى المفتاح في سلسلة المفاتيح — اسمح للتطبيق بالوصول، أو أعد إدخاله من الإعدادات.";
const ERR_CLIENT_INIT: &str = "تعذّر تهيئة الاتصال.";
const ERR_TIMEOUT: &str = "انتهت مهلة الاتصال — حاول مرة أخرى.";
const ERR_CONNECT: &str = "فشل الاتصال بالخدمة — تحقق من الإنترنت ومن Base URL.";
const ERR_BAD_KEY: &str = "المفتاح غير صحيح أو غير مفعّل — راجع لوحة الإعدادات.";
const ERR_NO_CREDIT: &str = "نفد رصيد المزوّد — اشحن الحساب ثم أعد المحاولة.";
const ERR_MODEL_UNAVAILABLE: &str = "النموذج غير متاح — تحقق من اسم النموذج في الإعدادات.";
const ERR_RATE_LIMITED: &str = "تجاوزت حد الاستخدام مؤقتًا — انتظر قليلًا ثم أعد المحاولة.";
const ERR_SERVER: &str = "الخدمة تواجه خللًا مؤقتًا — أعد المحاولة بعد قليل.";
const ERR_UNREADABLE: &str = "تعذّرت قراءة استجابة الخدمة.";
const ERR_EMPTY_RESULT: &str = "أعاد النموذج نتيجة فارغة — أعد المحاولة.";
const ERR_TOO_LONG: &str =
    "النص أطول من حد المعالجة — قسّمه إلى أجزاء أقصر ونسّق كل جزء على حدة.";

/// «لا مفتاح» أم «لم أصل إليه» — الفرق يقرّره ما أعادته الإعدادات لا الحقل وحده
fn missing_key_message(settings: &Settings) -> &'static str {
    if settings.key_unavailable {
        ERR_KEY_LOCKED
    } else {
        ERR_NO_API_KEY
    }
}

fn request_failed(code: u16) -> String {
    format!("فشل الطلب (رمز {}). تحقق من الإعدادات وأعد المحاولة.", code)
}

fn transport_error(e: &reqwest::Error) -> String {
    if e.is_timeout() { ERR_TIMEOUT } else { ERR_CONNECT }.to_string()
}

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

// هامش توكنات التفكير: حين يفكر النموذج فعلًا تُحسب توكنات تفكيره من سقف
// المخرج نفسه، فيُضاف إليه هامش بحدّ أعلى صلب — ولا يُنقص سقفَ البرج أبدًا
const THINKING_HEADROOM_TOKENS: u64 = 4096;
const THINKING_HEADROOM_CAP: u64 = 20_000;

fn thinking_headroom(max_tokens: u64) -> u64 {
    let padded = max_tokens
        .saturating_add(THINKING_HEADROOM_TOKENS)
        .min(THINKING_HEADROOM_CAP);
    padded.max(max_tokens)
}

/// أدنى reasoning_effort تقبله عائلة نموذج OpenAI استدلالي، أو None لنموذج غير
/// استدلالي. المرجع وثائق OpenAI الرسمية (developers.openai.com، 2026-09):
/// gpt-5 وgpt-5-mini وgpt-5-nano تبدأ من minimal؛ gpt-5.1 حتى gpt-5.6 تبدأ من
/// none؛ gpt-6-astra تبدأ من low (none يعيد 400)؛ وسلسلة o تبدأ من low. وما بعد
/// gpt-6 غير موثّق بعد فيأخذ low — القيمة التي تقبلها كل عائلة استدلالية
/// موثّقة. أسماء ChatGPT (chat-latest) بلا توكنات استدلال في وثائقها.
fn openai_reasoning_floor(model: &str) -> Option<&'static str> {
    let id = model.trim().to_ascii_lowercase();
    if id.contains("chat") {
        return None;
    }
    if ["o1", "o3", "o4"].iter().any(|prefix| id.starts_with(prefix)) {
        return Some("low");
    }
    let rest = id.strip_prefix("gpt-")?;
    let digits = rest.chars().take_while(char::is_ascii_digit).count();
    let major: u32 = rest[..digits].parse().ok()?;
    match major {
        0..=4 => None,
        5 if rest[digits..].starts_with('.') => Some("none"),
        5 => Some("minimal"),
        _ => Some("low"),
    }
}

/// جسم Chat Completions لـ OpenAI المباشر (api.openai.com) — دالة صرفة كنظيرتها
/// build_request_body التي تبقى لبقية المزوّدات بلا تغيير. max_completion_tokens
/// بدل max_tokens المهمَل (غير المتوافق مع سلسلة o) لكل نموذج. العائلات
/// الاستدلالية لا تُرسل لها temperature (ترفضها gpt-6 وgpt-5 الأصلية وسلسلة o،
/// ولا تقبلها gpt-5.x إلا مع none)، وميزانية التفكير تُترجم إلى reasoning_effort:
/// صفر ← أدنى قيمة تقبلها العائلة، وما فوقه ← low، ومع أي تفكير فعلي هامش في
/// السقف. غير الاستدلالية تأخذ temperature البرج بلا reasoning_effort. وكما في
/// build_request_body لا يُسقط جسم الإعادة إلا response_format — فلا تشغّل
/// إعادة المحاولة تفكير medium الافتراضي بصمت.
pub(crate) fn build_openai_body(
    model: &str,
    messages: &Value,
    max_tokens: u64,
    temperature: f64,
    include_response_format: bool,
    thinking_budget: u64,
) -> Value {
    let mut body = json!({ "model": model, "messages": messages });
    match openai_reasoning_floor(model) {
        Some(floor) => {
            let effort = if thinking_budget == 0 { floor } else { "low" };
            body["reasoning_effort"] = json!(effort);
            body["max_completion_tokens"] = json!(if effort == "none" {
                max_tokens
            } else {
                thinking_headroom(max_tokens)
            });
        }
        None => {
            body["temperature"] = json!(temperature);
            body["max_completion_tokens"] = json!(max_tokens);
        }
    }
    if include_response_format {
        body["response_format"] = json!({ "type": "json_object" });
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
        .map_err(|e| transport_error(&e))
}

/// فشل طلب التوليد بتفصيله: الرسالة العربية التي تُعرض، ونصّ المزوّد نفسه حين
/// ردّ بخطأ. البرجان يأخذان الرسالة وحدها كما كانت؛ والتفصيل لاختبار الاتصال،
/// فهو الموضع الذي يُسأل فيه «لماذا» لا «ماذا أفعل الآن»
pub(crate) struct CompletionFailure {
    pub(crate) message: String,
    pub(crate) detail: Option<String>,
}

impl From<String> for CompletionFailure {
    fn from(message: String) -> Self {
        CompletionFailure { message, detail: None }
    }
}

/// نصّ خطأ المزوّد من جسم ردّه: {"error":{"message"}} في المتوافق مع OpenAI،
/// ومصفوفةٌ بعنصر واحد عند Gemini أحيانًا. يُقصّ، ويُحجب منه المفتاح إن ردّده
/// المزوّد — فلا يصل سرٌّ إلى الواجهة عبر رسالة خطأ
fn provider_detail(body: &str, api_key: &str) -> Option<String> {
    let payload: Value = serde_json::from_str(body).ok()?;
    let error = if payload.is_array() { &payload[0]["error"] } else { &payload["error"] };
    let text = error["message"].as_str().or_else(|| error.as_str())?.trim();
    if text.is_empty() {
        return None;
    }
    let key = api_key.trim();
    let text = if key.len() >= 8 { text.replace(key, "…") } else { text.to_string() };
    Some(text.chars().take(DETAIL_LIMIT).collect())
}

const DETAIL_LIMIT: usize = 200;

/// يرسل الرسائل إلى المزود ويعيد نص المحتوى الخام — نقل مشترك بين الوضعين،
/// وميزانية التفكير يمررها الوضع المنادي (لا قيمة افتراضية هنا عمدًا)
pub(crate) async fn request_completion(
    settings: &Settings,
    messages: &Value,
    max_tokens: u64,
    temperature: f64,
    thinking_budget: u64,
) -> Result<String, String> {
    request_completion_detailed(settings, messages, max_tokens, temperature, thinking_budget)
        .await
        .map_err(|failure| failure.message)
}

async fn request_completion_detailed(
    settings: &Settings,
    messages: &Value,
    max_tokens: u64,
    temperature: f64,
    thinking_budget: u64,
) -> Result<String, CompletionFailure> {
    // Ollama المحلي: بروتوكول مختلف تمامًا (لا مفتاح) — فرع مبكر ومنفصل، ولا
    // يمسّ المسار السحابي أدناه بشيء. ميزانية التفكير نفسها (لا قيمة جديدة)
    // تُترجم لحقل Ollama الخاص بها، فيتوقف نسق شَذْب على تصميمهما نفسه
    if settings.provider.trim() == PROVIDER_OLLAMA {
        return Ok(request_completion_ollama(settings, messages, thinking_budget).await?);
    }

    // Claude: واجهة Messages الأصلية (مصادقة وجسم واستجابة مختلفة الشكل) — فرع
    // مبكر منفصل كفرع Ollama لا يمسّ المسار السحابي أدناه. لا تُمرَّر إليه
    // الحرارة عمدًا: نماذج Claude الحديثة ترفض معاملات أخذ العينات بـ400
    if settings.provider.trim() == PROVIDER_ANTHROPIC {
        return Ok(
            request_completion_anthropic(settings, messages, max_tokens, thinking_budget).await?,
        );
    }

    let api_key = settings.api_key.trim();
    if api_key.is_empty() {
        return Err(missing_key_message(settings).to_string().into());
    }

    let url = format!(
        "{}/chat/completions",
        settings.base_url.trim().trim_end_matches('/')
    );

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(120))
        .build()
        .map_err(|_| ERR_CLIENT_INIT.to_string())?;

    // حقل ضبط التفكير يُرسل بصيغة المزود المطابق حصرًا حتى لا يكسر البقية
    let base_lower = settings.base_url.to_lowercase();
    let is_gemini = base_lower.contains("generativelanguage.googleapis.com");
    let is_openrouter = base_lower.contains("openrouter.ai");
    // OpenAI المباشر له جسمه (build_openai_body)، وبقية المزوّدات على جسمها القائم
    let is_openai = base_lower.contains(OPENAI_API_HOST);
    let body_for = |include_response_format: bool| {
        if is_openai {
            build_openai_body(
                &settings.model,
                messages,
                max_tokens,
                temperature,
                include_response_format,
                thinking_budget,
            )
        } else {
            build_request_body(
                &settings.model,
                messages,
                max_tokens,
                temperature,
                include_response_format,
                is_gemini,
                is_openrouter,
                thinking_budget,
            )
        }
    };

    let mut response = call_api(&client, &url, api_key, &body_for(true)).await?;

    // إن رفض المزود response_format (400 أو 422) نعيد المحاولة مرة واحدة دونه —
    // ضبط التفكير يبقى في جسم الإعادة (انظر build_request_body وbuild_openai_body)،
    // والجسم الأول لا يحمل أصلًا معاملًا يرفضه نموذج OpenAI فتفشل الإعادة عليه
    let first_status = response.status().as_u16();
    if first_status == 400 || first_status == 422 {
        response = call_api(&client, &url, api_key, &body_for(false)).await?;
    }

    let status = response.status();
    if !status.is_success() {
        let message = match status.as_u16() {
            401 | 403 => ERR_BAD_KEY.to_string(),
            // نفاد الرصيد له اسمه الصريح (الإصلاح ٢-ج) — كان يسقط في الذراع العام
            402 => ERR_NO_CREDIT.to_string(),
            404 => ERR_MODEL_UNAVAILABLE.to_string(),
            429 => ERR_RATE_LIMITED.to_string(),
            500..=599 => ERR_SERVER.to_string(),
            code => request_failed(code),
        };
        let body = response.text().await.unwrap_or_default();
        return Err(CompletionFailure { message, detail: provider_detail(&body, api_key) });
    }

    let payload: Value = response
        .json()
        .await
        .map_err(|_| ERR_UNREADABLE.to_string())?;

    // ناتج مقطوع بسبب بلوغ سقف التوكنات → رسالة واضحة بدل «ناتج غير صالح».
    // يُفحص قبل الفراغ: نموذج استدلالي قد يستنفد السقف تفكيرًا فلا يبقى نص ظاهر
    if payload["choices"][0]["finish_reason"].as_str() == Some("length") {
        return Err(ERR_TOO_LONG.to_string().into());
    }

    let content = payload["choices"][0]["message"]["content"]
        .as_str()
        .unwrap_or("")
        .trim()
        .to_string();

    if content.is_empty() {
        return Err(ERR_EMPTY_RESULT.to_string().into());
    }

    Ok(content)
}

// ---------- Claude (Anthropic Messages API) ----------

const ANTHROPIC_VERSION: &str = "2023-06-01";
const ANTHROPIC_FALLBACK_BETA: &str = "server-side-fallback-2026-07-01";
const CLAUDE_TIMEOUT_SECS: u64 = 180;

// نماذج Claude التي تقبل output_config.effort — بادئات صريحة، وغيرها (مثل
// claude-haiku-4-5) لا يُرسل له effort ولا thinking إطلاقًا
const CLAUDE_EFFORT_MODEL_PREFIXES: [&str; 8] = [
    "claude-opus-5",
    "claude-opus-4-8",
    "claude-opus-4-7",
    "claude-opus-4-6",
    "claude-sonnet-5",
    "claude-sonnet-4-6",
    "claude-fable-",
    "claude-mythos-",
];

const ERR_CLAUDE_REFUSAL: &str =
    "اعتذر النموذج عن معالجة هذا النص — جرّب نموذجًا آخر أو عدّل النص ثم أعد المحاولة.";
const ERR_KEY_FORBIDDEN: &str =
    "المفتاح لا يملك صلاحية هذا النموذج أو الطلب — راجع صلاحيات حسابك لدى المزوّد.";
const ERR_OVERLOADED: &str = "الخدمة مزدحمة الآن — أعد المحاولة بعد قليل.";

fn claude_supports_effort(model: &str) -> bool {
    CLAUDE_EFFORT_MODEL_PREFIXES
        .iter()
        .any(|prefix| model.starts_with(prefix))
}

/// ميزانية التفكير التي يقررها البرج بمفردات effort: صفر ← low (أدنى تفكير
/// تكيفي، لا تعطيل)، وحتى 2048 ← medium، وما فوقها ← high
fn claude_effort(thinking_budget: u64) -> &'static str {
    match thinking_budget {
        0 => "low",
        1..=2048 => "medium",
        _ => "high",
    }
}

/// الاحتياط عند الرفض (fallbacks: "default") مفعَّل افتراضيًا حيث توصي به
/// Anthropic: Opus 5 وFable 5.1
fn claude_uses_refusal_fallback(model: &str) -> bool {
    model.starts_with("claude-opus-5") || model.starts_with("claude-fable-5-1")
}

/// {base_url}/v1/messages — ويُقبل عنوان مُنهًى بـ/v1 دون تكرارها
fn anthropic_messages_url(base_url: &str) -> String {
    let base = base_url.trim().trim_end_matches('/');
    if base.ends_with("/v1") {
        format!("{}/messages", base)
    } else {
        format!("{}/v1/messages", base)
    }
}

/// رسائل الوضع بصيغة Messages API: محتوى كل رسالة system (نصًا، كما تبنيه
/// الأبراج) يُجمع في الحقل العلوي system، وتبقى user/assistant بترتيبها في
/// messages. وأي assistant في الذيل يُسقط: الملء المسبق (prefill) مرفوض بـ400
/// في نماذج Claude الحديثة.
fn split_anthropic_messages(messages: &Value) -> (String, Vec<Value>) {
    let mut system = Vec::new();
    let mut turns = Vec::new();
    for message in messages.as_array().into_iter().flatten() {
        match message["role"].as_str() {
            Some("system") => {
                if let Some(text) = message["content"].as_str() {
                    system.push(text);
                }
            }
            Some(role @ ("user" | "assistant")) => {
                turns.push(json!({ "role": role, "content": message["content"] }));
            }
            _ => {}
        }
    }
    while turns.last().is_some_and(|turn| turn["role"] == "assistant") {
        turns.pop();
    }
    (system.join("\n\n"), turns)
}

/// جسم POST /v1/messages — دالة صرفة قابلة للاختبار بمعزل عن الشبكة. لا
/// temperature ولا top_p ولا top_k ولا budget_tokens (400 على Opus 5 وأخواته)،
/// ولا thinking إطلاقًا: Opus 5 يفكر تكيفيًا افتراضيًا، وتعطيله صراحةً قد يسرّب
/// وسومًا داخلية إلى النص فيفسد JSON الذي ينتظره البرج. ميزانية التفكير تُترجم
/// إلى output_config.effort للنماذج التي تقبله فقط، مع هامش في max_tokens لأن
/// توكنات التفكير تُحسب منه. with_fallback يضيف fallbacks (وترويسته في
/// anthropic_headers).
pub(crate) fn build_anthropic_body(
    model: &str,
    messages: &Value,
    max_tokens: u64,
    thinking_budget: u64,
    with_fallback: bool,
) -> Value {
    let (system, turns) = split_anthropic_messages(messages);
    let supports_effort = claude_supports_effort(model);
    let mut body = json!({
        "model": model,
        "max_tokens": if supports_effort { thinking_headroom(max_tokens) } else { max_tokens },
        "messages": turns,
    });
    if !system.is_empty() {
        body["system"] = json!(system);
    }
    if supports_effort {
        body["output_config"] = json!({ "effort": claude_effort(thinking_budget) });
    }
    if with_fallback {
        body["fallbacks"] = json!("default");
    }
    body
}

/// ترويسات طلب Claude: المفتاح في x-api-key (لا Bearer) ومعلَّم حساسًا كما
/// تفعل bearer_auth، وترويسة beta الاحتياط ترافق حقل fallbacks حصرًا
fn anthropic_headers(api_key: &str, with_fallback: bool) -> Result<HeaderMap, String> {
    let mut key = HeaderValue::from_str(api_key).map_err(|_| ERR_BAD_KEY.to_string())?;
    key.set_sensitive(true);
    let mut headers = HeaderMap::new();
    headers.insert("x-api-key", key);
    headers.insert("anthropic-version", HeaderValue::from_static(ANTHROPIC_VERSION));
    headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
    if with_fallback {
        headers.insert("anthropic-beta", HeaderValue::from_static(ANTHROPIC_FALLBACK_BETA));
    }
    Ok(headers)
}

fn anthropic_error_text(payload: &Value) -> String {
    payload["error"]["message"]
        .as_str()
        .unwrap_or("")
        .to_lowercase()
}

/// 400 سببه الاحتياط نفسه (ترويسة beta أو حقل fallbacks غير متاحين للحساب أو
/// النموذج) — يُعاد الطلب مرة واحدة بدونهما معًا
fn anthropic_fallback_rejected(status: u16, payload: &Value) -> bool {
    let text = anthropic_error_text(payload);
    status == 400 && (text.contains("anthropic-beta") || text.contains("fallbacks"))
}

/// رسالة الخطأ بحسب الحالة — جسم خطأ Anthropic {"type":"error","error":{type,message}}
fn anthropic_error_message(status: u16, payload: &Value) -> String {
    match status {
        401 => ERR_BAD_KEY,
        403 => ERR_KEY_FORBIDDEN,
        402 => ERR_NO_CREDIT,
        // نفاد الرصيد قد يصل 400 برسالة «credit balance is too low»
        400 if anthropic_error_text(payload).contains("credit balance") => ERR_NO_CREDIT,
        404 => ERR_MODEL_UNAVAILABLE,
        413 => ERR_TOO_LONG,
        429 => ERR_RATE_LIMITED,
        529 => ERR_OVERLOADED,
        500..=599 => ERR_SERVER,
        code => return request_failed(code),
    }
    .to_string()
}

/// قراءة استجابة Messages — دالة صرفة. stop_reason أولًا: refusal خطأ صريح (لا
/// نص جزئي يُعامل ناتجًا)، وmax_tokens رسالة الطول نفسها؛ ثم يُجمع نص كل كتلة
/// text بترتيبها وتُتجاوز thinking وfallback وأي نوع آخر
fn parse_anthropic_response(payload: &Value) -> Result<String, String> {
    match payload["stop_reason"].as_str() {
        Some("refusal") => return Err(ERR_CLAUDE_REFUSAL.to_string()),
        Some("max_tokens") => return Err(ERR_TOO_LONG.to_string()),
        _ => {}
    }
    let text: String = payload["content"]
        .as_array()
        .into_iter()
        .flatten()
        .filter(|block| block["type"] == "text")
        .filter_map(|block| block["text"].as_str())
        .collect();
    let text = text.trim();
    if text.is_empty() {
        return Err(ERR_EMPTY_RESULT.to_string());
    }
    Ok(text.to_string())
}

async fn send_anthropic(
    client: &reqwest::Client,
    url: &str,
    headers: HeaderMap,
    body: &Value,
) -> Result<(u16, Value), String> {
    // الترويسات قبل json(): فلا تتكرر content-type
    let response = client
        .post(url)
        .headers(headers)
        .json(body)
        .send()
        .await
        .map_err(|e| transport_error(&e))?;
    let status = response.status().as_u16();
    // جسم خطأ غير JSON (وكيل أو بوابة) لا يمنع رسالة الحالة
    match response.json::<Value>().await {
        Ok(payload) => Ok((status, payload)),
        Err(_) if !(200..300).contains(&status) => Ok((status, Value::Null)),
        Err(_) => Err(ERR_UNREADABLE.to_string()),
    }
}

/// نقل Claude عبر واجهة Messages الأصلية. محاولة واحدة، وإعادة وحيدة بلا
/// الاحتياط إن رفضه الحساب؛ لا streaming ولا تحويل لمزوّد آخر عند الفشل
async fn request_completion_anthropic(
    settings: &Settings,
    messages: &Value,
    max_tokens: u64,
    thinking_budget: u64,
) -> Result<String, String> {
    let api_key = settings.api_key.trim();
    if api_key.is_empty() {
        return Err(missing_key_message(settings).to_string());
    }
    let model = settings.model.trim();
    let url = anthropic_messages_url(&settings.base_url);

    // التفكير التكيفي أبطأ من نداء بلا تفكير — مهلة أوسع من المسار المتوافق
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(CLAUDE_TIMEOUT_SECS))
        .build()
        .map_err(|_| ERR_CLIENT_INIT.to_string())?;

    let with_fallback = claude_uses_refusal_fallback(model);
    let body = build_anthropic_body(model, messages, max_tokens, thinking_budget, with_fallback);
    let (mut status, mut payload) =
        send_anthropic(&client, &url, anthropic_headers(api_key, with_fallback)?, &body).await?;

    if with_fallback && anthropic_fallback_rejected(status, &payload) {
        let plain = build_anthropic_body(model, messages, max_tokens, thinking_budget, false);
        (status, payload) =
            send_anthropic(&client, &url, anthropic_headers(api_key, false)?, &plain).await?;
    }

    if !(200..300).contains(&status) {
        return Err(anthropic_error_message(status, &payload));
    }
    parse_anthropic_response(&payload)
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

// ---------- اختبار الاتصال (لوحة الإعدادات) ----------

// نقطة سرد النماذج عند كل مزوّد: أرخص طلب يثبت أمرين في نداء واحد — أن
// المفتاح مقبول، وأن اسم النموذج المكتوب موجود فعلًا. والتفريق بينهما هو
// المقصود: «المفتاح صحيح والاسم خاطئ» شكوى لا يجيب عنها نجاحٌ أو فشلٌ واحد.
// لا prompt هنا ولا عقد ولا نصّ مستخدم — طلب سرد مجرّد، كبقية هذه الطبقة.

const ERR_LIST_UNREACHABLE: &str = "تعذّر الوصول إلى قائمة النماذج — تحقق من Base URL.";
const ERR_LIST_UNREADABLE: &str = "وردت قائمة النماذج بشكل غير مفهوم.";
const ERR_OLLAMA_DOWN: &str = "Ollama غير مشغّل على هذا الجهاز.";
const CONNECTION_TIMEOUT_SECS: u64 = 10;

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ConnectionReport {
    /// وصل الطلب إلى المزوّد وردّ بما يُفهم
    pub(crate) connected: bool,
    /// قبِل المزوّد المفتاح — ولـ Ollama صحيحٌ دائمًا إذ لا مفتاح له
    pub(crate) key_accepted: bool,
    /// None حين لا نموذج مكتوب أو حين لا تصلح القائمة للحكم
    pub(crate) model_listed: Option<bool>,
    pub(crate) model_count: usize,
    /// ولّد النموذج فعلًا بطلبٍ صغير — None حين لم يُجرَّب (لا نموذج، أو Ollama)
    pub(crate) generates: Option<bool>,
    /// نصّ عربي جاهز للعرض كما هو
    pub(crate) message: String,
}

impl ConnectionReport {
    fn failed(message: String) -> Self {
        ConnectionReport {
            connected: false,
            key_accepted: false,
            model_listed: None,
            model_count: 0,
            generates: None,
            message,
        }
    }
}

fn models_url(provider: &str, base_url: &str) -> String {
    let base = base_url.trim().trim_end_matches('/');
    match provider.trim() {
        PROVIDER_OLLAMA => format!("{}/api/tags", base),
        PROVIDER_ANTHROPIC => {
            if base.ends_with("/v1") {
                format!("{}/models", base)
            } else {
                format!("{}/v1/models", base)
            }
        }
        _ => format!("{}/models", base),
    }
}

fn models_status_error(status: u16) -> Option<String> {
    if (200..300).contains(&status) {
        return None;
    }
    // 404 هنا يعني المسار لا العنوان الخاطئ للنموذج: نقطة السرد نفسها غائبة
    Some(match status {
        401 | 403 => ERR_BAD_KEY.to_string(),
        402 => ERR_NO_CREDIT.to_string(),
        404 => ERR_LIST_UNREACHABLE.to_string(),
        429 => ERR_RATE_LIMITED.to_string(),
        500..=599 => ERR_SERVER.to_string(),
        code => request_failed(code),
    })
}

fn listed_models(provider: &str, payload: &Value) -> Vec<String> {
    if provider.trim() == PROVIDER_OLLAMA {
        return payload["models"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|m| m["name"].as_str().or_else(|| m["model"].as_str()))
            .map(|s| s.to_string())
            .collect();
    }
    payload["data"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|m| m["id"].as_str())
        .map(|s| s.to_string())
        .collect()
}

/// Gemini عبر طبقة توافق OpenAI يسرد معرّفاته مسبوقة بـ models/ بينما يُكتب
/// النموذج في الإعدادات بلا بادئة — فالمقارنة تُجرّدها قبل الحكم
fn strip_models_prefix(s: &str) -> &str {
    s.strip_prefix("models/").unwrap_or(s)
}

fn model_is_listed(provider: &str, configured: &str, listed: &[String]) -> bool {
    let configured = configured.trim();
    if configured.is_empty() {
        return false;
    }
    let ollama = provider.trim() == PROVIDER_OLLAMA;
    listed.iter().any(|entry| {
        if ollama {
            ollama_model_matches(configured, entry)
        } else {
            configured.eq_ignore_ascii_case(strip_models_prefix(entry))
        }
    })
}

fn connection_headers(provider: &str, api_key: &str) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    if provider.trim() == PROVIDER_ANTHROPIC {
        let mut key = HeaderValue::from_str(api_key).map_err(|_| ERR_BAD_KEY.to_string())?;
        key.set_sensitive(true);
        headers.insert("x-api-key", key);
        headers.insert(
            "anthropic-version",
            HeaderValue::from_static(ANTHROPIC_VERSION),
        );
    }
    Ok(headers)
}

/// الفحص كاملًا: يعيد تقريرًا في كل الأحوال المفهومة، ولا يخطئ إلا حين يتعذّر
/// حتى تكوين الطلب. تصنيف الحالة يبقى في التقرير لا في نوع النتيجة، فتعرض
/// لوحة الإعدادات نصًّا واحدًا مهما كانت النتيجة
pub(crate) async fn check_connection(settings: &Settings) -> ConnectionReport {
    let provider = settings.provider.trim();
    let ollama = provider == PROVIDER_OLLAMA;
    let api_key = settings.api_key.trim();
    let model = settings.model.trim();

    if settings.base_url.trim().is_empty() {
        return ConnectionReport::failed(ERR_LIST_UNREACHABLE.to_string());
    }
    if !ollama && api_key.is_empty() {
        return ConnectionReport::failed(missing_key_message(settings).to_string());
    }

    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(CONNECTION_TIMEOUT_SECS))
        .build()
    {
        Ok(client) => client,
        Err(_) => return ConnectionReport::failed(ERR_CLIENT_INIT.to_string()),
    };

    let headers = match connection_headers(provider, api_key) {
        Ok(headers) => headers,
        Err(message) => return ConnectionReport::failed(message),
    };

    let url = models_url(provider, &settings.base_url);
    let mut request = client.get(&url).headers(headers);
    if !ollama && provider != PROVIDER_ANTHROPIC {
        request = request.bearer_auth(api_key);
    }

    let response = match request.send().await {
        Ok(response) => response,
        Err(e) => {
            let message = if ollama && e.is_connect() {
                ERR_OLLAMA_DOWN.to_string()
            } else {
                transport_error(&e)
            };
            return ConnectionReport::failed(message);
        }
    };

    let status = response.status().as_u16();
    if let Some(message) = models_status_error(status) {
        let key_rejected = matches!(status, 401 | 403);
        return ConnectionReport {
            connected: true,
            key_accepted: !key_rejected,
            model_listed: None,
            model_count: 0,
            generates: None,
            message,
        };
    }

    let payload: Value = match response.json().await {
        Ok(payload) => payload,
        Err(_) => return ConnectionReport::failed(ERR_LIST_UNREADABLE.to_string()),
    };

    let models = listed_models(provider, &payload);
    let count = models.len();
    let service = if ollama { "Ollama" } else { "المزوّد" };

    if model.is_empty() {
        return ConnectionReport {
            connected: true,
            key_accepted: true,
            model_listed: None,
            model_count: count,
            generates: None,
            message: format!("تم الاتصال بـ{} — {} نموذجًا متاحًا.", service, count),
        };
    }

    if model_is_listed(provider, model, &models) {
        // وجود الاسم في القائمة لا يعني أنه يولّد: قد يُسرد نموذجٌ لا يقبله
        // الحساب أو المسار. فالحكم لطلب توليد صغير بالمسار نفسه الذي يسلكه
        // البرجان. Ollama يُستثنى: القائمة محلية، والتوليد يحمّل النموذج كله
        if !ollama {
            if let Err(failure) = probe_generation(settings).await {
                return ConnectionReport {
                    connected: true,
                    key_accepted: failure.message != ERR_BAD_KEY,
                    model_listed: Some(true),
                    model_count: count,
                    generates: Some(false),
                    message: probe_failure_message(model, &failure),
                };
            }
        }
        return ConnectionReport {
            connected: true,
            key_accepted: true,
            model_listed: Some(true),
            model_count: count,
            generates: (!ollama).then_some(true),
            message: if ollama {
                format!("تم الاتصال، و«{}» متاح.", model)
            } else {
                format!("تم الاتصال، و«{}» ولّد نصًّا فعلًا.", model)
            },
        };
    }

    // الحالة التي يخلطها الفحص البسيط: الاتصال سليم والمفتاح مقبول، والخطأ في
    // اسم النموذج وحده
    let message = if ollama {
        format!("Ollama يعمل، لكن «{}» غير منزَّل على الجهاز.", model)
    } else {
        format!("المفتاح مقبول، لكن «{}» ليس بين نماذج المزوّد ({} نموذجًا).", model, count)
    };
    ConnectionReport {
        connected: true,
        key_accepted: true,
        model_listed: Some(false),
        model_count: count,
        generates: None,
        message,
    }
}

// طلب الفحص: رسالة نقلٍ لا عقد فيها ولا سلوك، وسقفٌ يكفي كلمة واحدة
const PROBE_MESSAGE: &str = "ping";
const PROBE_MAX_TOKENS: u64 = 16;

/// التوليد نفسه الذي يطلبه البرجان، بأصغر حجم. بلوغ السقف أو نتيجة فارغة
/// نجاحٌ هنا: المزوّد قبل الطلب وولّد، والفحص لا يطلب جوابًا بعينه
async fn probe_generation(settings: &Settings) -> Result<(), CompletionFailure> {
    let messages = json!([{ "role": "user", "content": PROBE_MESSAGE }]);
    match request_completion_detailed(settings, &messages, PROBE_MAX_TOKENS, 0.0, 0).await {
        Ok(_) => Ok(()),
        Err(failure) if failure.message == ERR_TOO_LONG || failure.message == ERR_EMPTY_RESULT => Ok(()),
        Err(failure) => Err(failure),
    }
}

fn probe_failure_message(model: &str, failure: &CompletionFailure) -> String {
    let head = format!("«{}» في قائمة المزوّد، لكن التوليد فشل: {}", model, failure.message);
    match &failure.detail {
        Some(detail) => format!("{}\nردّ المزوّد: {}", head, detail),
        None => head,
    }
}

/// المفتاح لا يعبر الجسر: الفحص يقرأ الإعدادات المحفوظة (ومنها الخزنة) بنفسه
#[tauri::command]
pub(crate) async fn test_connection(app: tauri::AppHandle) -> Result<ConnectionReport, String> {
    let settings = super::settings::read_settings(&app)?;
    Ok(check_connection(&settings).await)
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

    // ---------- Claude (Anthropic Messages API) ----------

    fn tower_messages() -> Value {
        json!([
            { "role": "system", "content": "عقد البرج" },
            { "role": "user", "content": "النص" }
        ])
    }

    #[test]
    fn anthropic_body_moves_system_to_top_level_and_keeps_turns_in_order() {
        let body = build_anthropic_body("claude-opus-5", &tower_messages(), 2000, 0, false);
        assert_eq!(body["system"], "عقد البرج");
        assert_eq!(body["messages"], json!([{ "role": "user", "content": "النص" }]));
        // أكثر من رسالة system تُجمع بترتيبها، ولا يبقى دور system داخل messages
        let many = json!([
            { "role": "system", "content": "أ" },
            { "role": "user", "content": "١" },
            { "role": "system", "content": "ب" },
            { "role": "assistant", "content": "٢" },
            { "role": "user", "content": "٣" }
        ]);
        let body = build_anthropic_body("claude-opus-5", &many, 2000, 0, false);
        assert_eq!(body["system"], "أ\n\nب");
        let roles: Vec<&str> = body["messages"]
            .as_array()
            .unwrap()
            .iter()
            .map(|m| m["role"].as_str().unwrap())
            .collect();
        assert_eq!(roles, ["user", "assistant", "user"]);
        // بلا رسالة system لا يُرسل الحقل فارغًا
        let bare = build_anthropic_body("claude-opus-5", &json!([{ "role": "user", "content": "ن" }]), 2000, 0, false);
        assert!(bare.get("system").is_none());
    }

    #[test]
    fn anthropic_body_never_sends_prefill() {
        let with_prefill = json!([
            { "role": "system", "content": "s" },
            { "role": "user", "content": "u" },
            { "role": "assistant", "content": "{" }
        ]);
        let body = build_anthropic_body("claude-opus-5", &with_prefill, 2000, 0, false);
        assert_eq!(body["messages"], json!([{ "role": "user", "content": "u" }]));
    }

    #[test]
    fn anthropic_body_never_sends_sampling_budget_or_thinking_fields() {
        // الشكل مقفول: هذه الحقول وحدها ممكنة، أيًّا كان النموذج والميزانية
        let allowed = ["fallbacks", "max_tokens", "messages", "model", "output_config", "system"];
        for model in ["claude-opus-5", "claude-sonnet-4-6", "claude-haiku-4-5", "claude-fable-5-1"] {
            for budget in [0u64, 1024, 8192] {
                for with_fallback in [true, false] {
                    let body = build_anthropic_body(model, &tower_messages(), 6144, budget, with_fallback);
                    for key in body.as_object().unwrap().keys() {
                        assert!(allowed.contains(&key.as_str()), "حقل غير مسموح {key} لـ {model}");
                    }
                    let raw = body.to_string();
                    for banned in ["temperature", "top_p", "top_k", "budget_tokens", "thinking"] {
                        assert!(!raw.contains(banned), "{banned} تسرب إلى جسم {model}");
                    }
                }
            }
        }
    }

    #[test]
    fn anthropic_effort_follows_thinking_budget_and_is_gated_by_model() {
        let effort = |model: &str, budget: u64| {
            build_anthropic_body(model, &tower_messages(), 2000, budget, false)["output_config"]["effort"].clone()
        };
        // نسق (صفر) ← low، شَذْب (1024) ← medium، وما فوق 2048 ← high
        assert_eq!(effort("claude-opus-5", 0), "low");
        assert_eq!(effort("claude-opus-5", 1024), "medium");
        assert_eq!(effort("claude-opus-5", 2048), "medium");
        assert_eq!(effort("claude-opus-5", 2049), "high");
        for model in [
            "claude-opus-4-8",
            "claude-opus-4-7",
            "claude-opus-4-6",
            "claude-sonnet-5",
            "claude-sonnet-4-6",
            "claude-fable-5-1",
            "claude-mythos-5-1",
        ] {
            assert_eq!(effort(model, 1024), "medium", "{model} يقبل effort");
        }
        for model in ["claude-haiku-4-5", "claude-sonnet-4-5", "claude-opus-4-5"] {
            let body = build_anthropic_body(model, &tower_messages(), 2000, 1024, false);
            assert!(body.get("output_config").is_none(), "{model} لا يُرسل له effort");
        }
    }

    #[test]
    fn anthropic_headroom_is_added_only_with_effort_and_capped() {
        let max = |model: &str, tokens: u64| build_anthropic_body(model, &tower_messages(), tokens, 0, false)["max_tokens"].clone();
        assert_eq!(max("claude-opus-5", 1200), 5296);
        assert_eq!(max("claude-opus-5", 6144), 10240);
        // سقف نسق الأعلى (16384) يُقصّ عند الحد الصلب
        assert_eq!(max("claude-opus-5", 16384), 20000);
        // نموذج بلا effort لا تفكير له هنا — السقف كما قرره البرج
        assert_eq!(max("claude-haiku-4-5", 1200), 1200);
        // الهامش لا يُنقص سقفًا أعلى من الحد أبدًا
        assert_eq!(thinking_headroom(30000), 30000);
    }

    #[test]
    fn anthropic_refusal_fallback_is_gated_in_body_and_headers() {
        assert!(claude_uses_refusal_fallback("claude-opus-5"));
        assert!(claude_uses_refusal_fallback("claude-fable-5-1"));
        for model in ["claude-sonnet-5", "claude-opus-4-8", "claude-fable-5", "claude-haiku-4-5"] {
            assert!(!claude_uses_refusal_fallback(model), "{model} بلا احتياط");
        }
        let with = build_anthropic_body("claude-opus-5", &tower_messages(), 2000, 0, true);
        assert_eq!(with["fallbacks"], "default");
        let without = build_anthropic_body("claude-opus-5", &tower_messages(), 2000, 0, false);
        assert!(without.get("fallbacks").is_none());

        let headers = anthropic_headers("sk-ant-test", true).unwrap();
        assert_eq!(headers["x-api-key"], "sk-ant-test");
        assert!(headers["x-api-key"].is_sensitive());
        assert_eq!(headers["anthropic-version"], "2023-06-01");
        assert_eq!(headers["anthropic-beta"], "server-side-fallback-2026-07-01");
        assert_eq!(headers[CONTENT_TYPE], "application/json");
        // لا Bearer إطلاقًا — المصادقة في x-api-key وحدها
        assert!(headers.get("authorization").is_none());
        let plain = anthropic_headers("sk-ant-test", false).unwrap();
        assert!(plain.get("anthropic-beta").is_none());
        // مفتاح لا يصلح ترويسةً (سطر جديد ملصوق داخله) يُرفض برسالة المفتاح لا
        // بفشل اتصال غامض
        assert_eq!(anthropic_headers("sk-ant\nbroken", false).unwrap_err(), ERR_BAD_KEY);
    }

    #[test]
    fn anthropic_fallback_rejection_is_detected_only_on_its_own_400() {
        let error = |message: &str| json!({ "type": "error", "error": { "type": "invalid_request_error", "message": message } });
        assert!(anthropic_fallback_rejected(
            400,
            &error("Unexpected value(s) `server-side-fallback-2026-07-01` for the `anthropic-beta` header.")
        ));
        assert!(anthropic_fallback_rejected(400, &error("fallbacks: Extra inputs are not permitted")));
        assert!(!anthropic_fallback_rejected(400, &error("messages: roles must alternate")));
        assert!(!anthropic_fallback_rejected(401, &error("anthropic-beta")));
        assert!(!anthropic_fallback_rejected(400, &Value::Null));
    }

    #[test]
    fn anthropic_response_joins_text_blocks_and_skips_thinking_and_fallback() {
        let payload = json!({
            "stop_reason": "end_turn",
            "content": [
                { "type": "thinking", "thinking": "", "signature": "x" },
                { "type": "fallback", "from": { "model": "claude-opus-5" }, "to": { "model": "claude-opus-4-8" } },
                { "type": "text", "text": "{\"lines\": " },
                { "type": "text", "text": "[\"سطر\"]}" }
            ]
        });
        let text = parse_anthropic_response(&payload).unwrap();
        assert_eq!(text, "{\"lines\": [\"سطر\"]}");
        assert!(extract_json(&text).is_some());
    }

    #[test]
    fn anthropic_refusal_max_tokens_and_empty_results_are_clear_errors() {
        // الرفض يسبق أي نص جزئي — لا يُعامل ما قبله ناتجًا
        let refusal = json!({ "stop_reason": "refusal", "content": [{ "type": "text", "text": "{\"partial\"" }] });
        assert_eq!(parse_anthropic_response(&refusal).unwrap_err(), ERR_CLAUDE_REFUSAL);
        let cut = json!({ "stop_reason": "max_tokens", "content": [{ "type": "text", "text": "{\"lines\": [" }] });
        assert_eq!(parse_anthropic_response(&cut).unwrap_err(), ERR_TOO_LONG);
        let only_thinking = json!({ "stop_reason": "end_turn", "content": [{ "type": "thinking", "thinking": "" }] });
        assert_eq!(parse_anthropic_response(&only_thinking).unwrap_err(), ERR_EMPTY_RESULT);
        assert_eq!(parse_anthropic_response(&json!({ "stop_reason": "refusal", "content": [] })).unwrap_err(), ERR_CLAUDE_REFUSAL);
    }

    #[test]
    fn anthropic_errors_map_by_status() {
        let error = |kind: &str, message: &str| json!({ "type": "error", "error": { "type": kind, "message": message } });
        assert_eq!(anthropic_error_message(401, &error("authentication_error", "invalid x-api-key")), ERR_BAD_KEY);
        assert_eq!(anthropic_error_message(403, &error("permission_error", "not allowed")), ERR_KEY_FORBIDDEN);
        assert_eq!(anthropic_error_message(402, &error("billing_error", "billing")), ERR_NO_CREDIT);
        assert_eq!(
            anthropic_error_message(
                400,
                &error("invalid_request_error", "Your credit balance is too low to access the Anthropic API.")
            ),
            ERR_NO_CREDIT
        );
        assert_eq!(
            anthropic_error_message(400, &error("invalid_request_error", "max_tokens: too large")),
            request_failed(400)
        );
        assert_eq!(anthropic_error_message(404, &error("not_found_error", "model: x")), ERR_MODEL_UNAVAILABLE);
        assert_eq!(anthropic_error_message(413, &Value::Null), ERR_TOO_LONG);
        assert_eq!(anthropic_error_message(429, &error("rate_limit_error", "slow down")), ERR_RATE_LIMITED);
        assert_eq!(anthropic_error_message(529, &error("overloaded_error", "Overloaded")), ERR_OVERLOADED);
        assert_eq!(anthropic_error_message(500, &error("api_error", "oops")), ERR_SERVER);
        assert_eq!(anthropic_error_message(503, &Value::Null), ERR_SERVER);
    }

    #[test]
    fn anthropic_messages_url_appends_v1_exactly_once() {
        assert_eq!(anthropic_messages_url("https://api.anthropic.com"), "https://api.anthropic.com/v1/messages");
        assert_eq!(anthropic_messages_url(" https://api.anthropic.com/ "), "https://api.anthropic.com/v1/messages");
        assert_eq!(anthropic_messages_url("https://api.anthropic.com/v1/"), "https://api.anthropic.com/v1/messages");
    }

    // ---------- OpenAI المباشر (Chat Completions) ----------

    #[test]
    fn openai_reasoning_floor_follows_documented_families() {
        for model in ["gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-5-2025-08-07"] {
            assert_eq!(openai_reasoning_floor(model), Some("minimal"), "{model}");
        }
        for model in ["gpt-5.1", "gpt-5.2", "gpt-5.4-mini", "gpt-5.5", "gpt-5.6-terra", "gpt-5.6-luna", "GPT-5.6-Sol"] {
            assert_eq!(openai_reasoning_floor(model), Some("none"), "{model}");
        }
        for model in ["gpt-6-astra", "o1", "o3", "o3-mini", "o4-mini"] {
            assert_eq!(openai_reasoning_floor(model), Some("low"), "{model}");
        }
        for model in ["gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini", "gpt-5-chat-latest", "gpt-5.1-chat-latest", "chatgpt-4o-latest", "gpt-oss-120b"] {
            assert_eq!(openai_reasoning_floor(model), None, "{model}");
        }
    }

    #[test]
    fn openai_reasoning_body_uses_completion_cap_and_effort_without_temperature() {
        let messages = tower_messages();
        // نسق على النموذج الافتراضي: none بلا هامش (لا توكنات تفكير)
        let nasaq = build_openai_body("gpt-5.6-terra", &messages, 1500, 0.85, true, 0);
        assert_eq!(nasaq["reasoning_effort"], "none");
        assert_eq!(nasaq["max_completion_tokens"], 1500);
        assert_eq!(nasaq["response_format"]["type"], "json_object");
        assert_eq!(nasaq["messages"], messages);
        // شَذْب: low مع هامش للتفكير لأنه يُحسب من السقف نفسه
        let shadhb = build_openai_body("gpt-5.6-terra", &messages, 1200, 0.3, true, 1024);
        assert_eq!(shadhb["reasoning_effort"], "low");
        assert_eq!(shadhb["max_completion_tokens"], 5296);
        // أدنى قيمة العائلة لميزانية صفر، والهامش متى كانت فوق none
        let gpt5 = build_openai_body("gpt-5-mini", &messages, 1500, 0.85, true, 0);
        assert_eq!(gpt5["reasoning_effort"], "minimal");
        assert_eq!(gpt5["max_completion_tokens"], 5596);
        assert_eq!(build_openai_body("gpt-6-astra", &messages, 1500, 0.85, true, 0)["reasoning_effort"], "low");
        assert_eq!(build_openai_body("o4-mini", &messages, 1500, 0.85, true, 0)["reasoning_effort"], "low");
        for model in ["gpt-5.6-terra", "gpt-5-mini", "gpt-6-astra", "o3"] {
            for budget in [0u64, 1024] {
                let body = build_openai_body(model, &messages, 1500, 0.92, true, budget);
                assert!(body.get("temperature").is_none(), "temperature لـ {model}");
                assert!(body.get("max_tokens").is_none(), "max_tokens المهمَل لـ {model}");
            }
        }
    }

    #[test]
    fn openai_non_reasoning_body_keeps_temperature_without_effort() {
        let body = build_openai_body("gpt-4.1", &tower_messages(), 2000, 0.85, true, 1024);
        assert_eq!(body["temperature"], 0.85);
        assert_eq!(body["max_completion_tokens"], 2000);
        assert!(body.get("reasoning_effort").is_none());
        assert!(body.get("max_tokens").is_none());
        assert_eq!(body["response_format"]["type"], "json_object");
    }

    #[test]
    fn openai_retry_body_drops_only_response_format() {
        // الإعادة بعد 400/422 تُسقط response_format وحده — reasoning_effort باقٍ
        // فلا يعمل medium الافتراضي بصمت، ولا يدخل الإعادةَ معامل لم يكن في الأولى
        for (model, budget) in [("gpt-5.6-terra", 0u64), ("gpt-5.6-terra", 1024), ("gpt-4o", 0)] {
            let first = build_openai_body(model, &tower_messages(), 1500, 0.85, true, budget);
            let retry = build_openai_body(model, &tower_messages(), 1500, 0.85, false, budget);
            assert!(retry.get("response_format").is_none());
            let mut expected = first.clone();
            expected.as_object_mut().unwrap().remove("response_format");
            assert_eq!(retry, expected, "جسم الإعادة لـ {model}");
        }
    }

    #[test]
    fn openai_detection_is_by_base_url_host() {
        assert!("https://api.openai.com/v1".contains(OPENAI_API_HOST));
        for other in [
            "https://generativelanguage.googleapis.com/v1beta/openai/",
            "https://api.groq.com/openai/v1",
            "https://openrouter.ai/api/v1",
        ] {
            assert!(!other.to_lowercase().contains(OPENAI_API_HOST), "{other}");
        }
    }

    // ---------- اختبار الاتصال ----------

    #[test]
    fn the_models_endpoint_follows_each_provider() {
        assert_eq!(models_url(PROVIDER_OLLAMA, "http://localhost:11434"), "http://localhost:11434/api/tags");
        assert_eq!(models_url(PROVIDER_OLLAMA, "http://localhost:11434/"), "http://localhost:11434/api/tags");
        // Anthropic: لا تتكرر v1 حين يكتبها المستخدم في العنوان
        assert_eq!(models_url(PROVIDER_ANTHROPIC, "https://api.anthropic.com"), "https://api.anthropic.com/v1/models");
        assert_eq!(models_url(PROVIDER_ANTHROPIC, "https://api.anthropic.com/v1"), "https://api.anthropic.com/v1/models");
        // المسار السحابي: العنوان كما حفظه المستخدم + models، والشرطة الأخيرة تُطرح
        assert_eq!(models_url("", "https://api.openai.com/v1"), "https://api.openai.com/v1/models");
        assert_eq!(
            models_url("cloud", "https://generativelanguage.googleapis.com/v1beta/openai/"),
            "https://generativelanguage.googleapis.com/v1beta/openai/models"
        );
    }

    #[test]
    fn a_rejected_key_is_told_apart_from_a_missing_endpoint() {
        assert_eq!(models_status_error(200), None);
        assert_eq!(models_status_error(204), None);
        assert_eq!(models_status_error(401).as_deref(), Some(ERR_BAD_KEY));
        assert_eq!(models_status_error(403).as_deref(), Some(ERR_BAD_KEY));
        assert_eq!(models_status_error(402).as_deref(), Some(ERR_NO_CREDIT));
        // ٤٠٤ على نقطة السرد يعني العنوان لا اسم النموذج
        assert_eq!(models_status_error(404).as_deref(), Some(ERR_LIST_UNREACHABLE));
        assert_eq!(models_status_error(429).as_deref(), Some(ERR_RATE_LIMITED));
        assert_eq!(models_status_error(503).as_deref(), Some(ERR_SERVER));
        assert!(models_status_error(418).unwrap().contains("418"));
    }

    #[test]
    fn each_provider_list_shape_is_read_as_it_comes() {
        let openai = json!({"data": [{"id": "gpt-5.6-terra"}, {"id": "o4-mini"}]});
        assert_eq!(listed_models("", &openai), vec!["gpt-5.6-terra", "o4-mini"]);

        let anthropic = json!({"data": [{"id": "claude-opus-5", "type": "model"}]});
        assert_eq!(listed_models(PROVIDER_ANTHROPIC, &anthropic), vec!["claude-opus-5"]);

        // Ollama: name أو model، وكلاهما مقبول
        let ollama = json!({"models": [{"name": "qwen3:8b"}, {"model": "llama3.2:latest"}]});
        assert_eq!(listed_models(PROVIDER_OLLAMA, &ollama), vec!["qwen3:8b", "llama3.2:latest"]);

        // شكل غير متوقع لا يُسقط شيئًا: قائمة فارغة لا انهيار
        assert!(listed_models("", &json!({"models": []})).is_empty());
        assert!(listed_models(PROVIDER_OLLAMA, &json!({"data": [{"id": "x"}]})).is_empty());
    }

    #[test]
    fn gemini_model_prefix_never_reads_as_a_missing_model() {
        // Gemini عبر طبقة التوافق يسرد models/gemini-… ويُكتب في الإعدادات بلا بادئة
        let listed = vec!["models/gemini-2.5-flash".to_string(), "models/gemini-2.5-pro".to_string()];
        assert!(model_is_listed("cloud", "gemini-2.5-flash", &listed));
        assert!(model_is_listed("cloud", "GEMINI-2.5-PRO", &listed));
        assert!(!model_is_listed("cloud", "gemini-9-ultra", &listed));
    }

    #[test]
    fn an_ollama_tag_matches_with_or_without_latest() {
        let listed = vec!["llama3.2:latest".to_string()];
        assert!(model_is_listed(PROVIDER_OLLAMA, "llama3.2", &listed));
        assert!(model_is_listed(PROVIDER_OLLAMA, "llama3.2:latest", &listed));
        assert!(!model_is_listed(PROVIDER_OLLAMA, "llama3.2:70b", &listed));
    }

    #[test]
    fn an_empty_model_is_never_reported_as_listed() {
        let listed = vec!["gpt-5.6-terra".to_string()];
        assert!(!model_is_listed("", "", &listed));
        assert!(!model_is_listed("", "   ", &listed));
    }

    #[test]
    fn anthropic_authenticates_by_header_and_the_cloud_path_does_not() {
        let headers = connection_headers(PROVIDER_ANTHROPIC, "sk-ant").unwrap();
        assert_eq!(headers.get("x-api-key").unwrap(), "sk-ant");
        assert_eq!(headers.get("anthropic-version").unwrap(), ANTHROPIC_VERSION);
        assert!(headers.get("x-api-key").unwrap().is_sensitive(), "المفتاح غير معلَّم حسّاسًا");

        // المسار السحابي يوقّع بـ bearer لا برأس، فلا رؤوس هنا
        assert!(connection_headers("", "sk-open").unwrap().is_empty());
        assert!(connection_headers(PROVIDER_OLLAMA, "").unwrap().is_empty());
    }

    #[test]
    fn a_locked_keychain_does_not_read_as_a_missing_key() {
        let missing = Settings { api_key: String::new(), ..Settings::default() };
        assert_eq!(missing_key_message(&missing), ERR_NO_API_KEY);

        let locked = Settings {
            api_key: String::new(),
            key_unavailable: true,
            ..Settings::default()
        };
        assert_eq!(missing_key_message(&locked), ERR_KEY_LOCKED);
        // العلاجان مختلفان، فالرسالتان مختلفتان
        assert_ne!(ERR_KEY_LOCKED, ERR_NO_API_KEY);

        // واختبار الاتصال يقول السبب نفسه لا رسالة من لا مفتاح له
        let report = futures_lite_block_on(check_connection(&locked));
        assert_eq!(report.message, ERR_KEY_LOCKED);
        assert!(!report.key_accepted);
    }

    #[test]
    fn a_missing_key_stops_before_any_request_except_for_ollama() {
        let cloud = Settings { api_key: String::new(), ..Settings::default() };
        let report = futures_lite_block_on(check_connection(&cloud));
        assert!(!report.connected);
        assert_eq!(report.message, ERR_NO_API_KEY);

        // Ollama بلا مفتاح ليس خطأ — يمضي إلى الطلب، ويسقط هنا على عنوان فارغ
        let ollama = Settings {
            api_key: String::new(),
            base_url: String::new(),
            provider: PROVIDER_OLLAMA.to_string(),
            ..Settings::default()
        };
        let report = futures_lite_block_on(check_connection(&ollama));
        assert_eq!(report.message, ERR_LIST_UNREACHABLE);
    }

    /// وقت تشغيل Tauri نفسه: الاختبارات التي تطرق خادمًا حقيقيًا تحتاج مُفاعِلًا
    fn futures_lite_block_on<F: std::future::Future>(future: F) -> F::Output {
        tauri::async_runtime::block_on(future)
    }

    #[test]
    fn a_key_that_cannot_be_a_header_is_refused_before_the_request() {
        // مفتاح فيه سطر جديد لا يصلح قيمة ترويسة: يُرفض هنا لا عند المزوّد
        let refused = connection_headers(PROVIDER_ANTHROPIC, "sk-ant\nbad");
        assert_eq!(refused.unwrap_err(), ERR_BAD_KEY);
    }

    // ---------- المسار كاملًا، على خادم محلي ----------

    /// خادم يردّ مرة واحدة بما يُملى عليه، ويعيد نصّ الطلب كما وصله.
    /// الغرض: فحص ما بين الطلب والتقرير — وهو صلب الميزة — لا الدوال وحدها
    fn stub_once(status: &str, body: &'static str) -> (String, std::sync::mpsc::Receiver<String>) {
        use std::io::{Read, Write};
        use std::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let (sender, receiver) = std::sync::mpsc::channel();
        let status = status.to_string();

        std::thread::spawn(move || {
            let Ok((mut stream, _)) = listener.accept() else { return };
            let mut request = Vec::new();
            let mut buffer = [0u8; 1024];
            while let Ok(read) = stream.read(&mut buffer) {
                if read == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..read]);
                if request.windows(4).any(|w| w == b"\r\n\r\n") {
                    break;
                }
            }
            let _ = sender.send(String::from_utf8_lossy(&request).to_string());
            let response = format!(
                "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                status,
                body.len(),
                body
            );
            let _ = stream.write_all(response.as_bytes());
            let _ = stream.flush();
        });

        (format!("http://127.0.0.1:{port}"), receiver)
    }

    /// كـ stub_once لطلبات متتالية على العنوان نفسه، ويقرأ الجسم كاملًا
    /// بطوله المعلن — فطلب التوليد يصل بحمولته ولا يُقطع الاتصال قبل الردّ
    fn stub_seq(replies: Vec<(&'static str, &'static str)>) -> (String, std::sync::mpsc::Receiver<String>) {
        use std::io::{Read, Write};
        use std::net::TcpListener;

        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let (sender, receiver) = std::sync::mpsc::channel();

        std::thread::spawn(move || {
            for (status, body) in replies {
                let Ok((mut stream, _)) = listener.accept() else { return };
                let mut request = Vec::new();
                let mut buffer = [0u8; 4096];
                loop {
                    let Ok(read) = stream.read(&mut buffer) else { break };
                    if read == 0 {
                        break;
                    }
                    request.extend_from_slice(&buffer[..read]);
                    let text = String::from_utf8_lossy(&request).to_string();
                    if let Some(end) = text.find("\r\n\r\n") {
                        let length = text[..end]
                            .lines()
                            .find_map(|l| l.to_ascii_lowercase().strip_prefix("content-length:").map(|v| v.trim().parse::<usize>().unwrap_or(0)))
                            .unwrap_or(0);
                        if request.len() >= end + 4 + length {
                            break;
                        }
                    }
                }
                let _ = sender.send(String::from_utf8_lossy(&request).to_string());
                let response = format!(
                    "HTTP/1.1 {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    status,
                    body.len(),
                    body
                );
                let _ = stream.write_all(response.as_bytes());
                let _ = stream.flush();
            }
        });

        (format!("http://127.0.0.1:{port}"), receiver)
    }

    fn cloud_settings(base_url: &str, model: &str) -> Settings {
        Settings {
            api_key: "sk-test".to_string(),
            base_url: base_url.to_string(),
            model: model.to_string(),
            ..Settings::default()
        }
    }

    #[test]
    fn a_listed_model_reports_a_clean_connection() {
        let (base, request) = stub_seq(vec![
            ("200 OK", r#"{"data":[{"id":"gpt-5.6-terra"},{"id":"o4-mini"}]}"#),
            ("200 OK", r#"{"choices":[{"finish_reason":"stop","message":{"content":"pong"}}]}"#),
        ]);
        let report = futures_lite_block_on(check_connection(&cloud_settings(&base, "gpt-5.6-terra")));

        assert!(report.connected && report.key_accepted);
        assert_eq!(report.model_listed, Some(true));
        assert_eq!(report.generates, Some(true));
        assert_eq!(report.model_count, 2);
        assert!(report.message.contains("gpt-5.6-terra"));

        // الطلب الأول: سرد نماذج موقَّع بـ bearer، بلا أي حمولة
        let listing = request.recv().unwrap();
        assert!(listing.starts_with("GET /models "), "المسار ليس سرد نماذج: {listing}");
        assert!(listing.to_lowercase().contains("authorization: bearer sk-test"));
        assert!(!listing.contains("messages"), "حمولة في طلب سرد");

        // والثاني: توليد فعلي بالمسار الذي يسلكه البرجان، بالنموذج المكتوب
        // بمهلة: غياب طلب التوليد يُفشل الاختبار ولا يُعلّقه
        let probe = request
            .recv_timeout(std::time::Duration::from_secs(5))
            .expect("لم يُرسَل طلب توليد بعد السرد");
        assert!(probe.starts_with("POST /chat/completions "), "لم يُجرَّب التوليد: {probe}");
        assert!(probe.contains(r#""model":"gpt-5.6-terra""#), "جُرّب نموذج آخر: {probe}");
    }

    // الشكوى التي أنشأت الفحص: «اختبر» قال متاح، والتنسيق بالاسم نفسه أعاد 404
    #[test]
    fn a_listed_model_that_refuses_to_generate_is_not_a_success() {
        let (base, _request) = stub_seq(vec![
            ("200 OK", r#"{"data":[{"id":"models/gemini-2.5-flash"}]}"#),
            ("404 Not Found", r#"[{"error":{"code":404,"message":"models/gemini-2.5-flash is not found for key sk-test-secret-123","status":"NOT_FOUND"}}]"#),
        ]);
        let mut settings = cloud_settings(&base, "gemini-2.5-flash");
        settings.api_key = "sk-test-secret-123".to_string();
        let report = futures_lite_block_on(check_connection(&settings));

        assert_eq!(report.model_listed, Some(true), "الاسم في القائمة فعلًا");
        assert_eq!(report.generates, Some(false), "نجاحٌ وهو لا يولّد");
        assert!(report.message.contains(ERR_MODEL_UNAVAILABLE), "{}", report.message);
        // سبب المزوّد نفسه يصل — وبلا المفتاح ولو ردّده المزوّد
        assert!(report.message.contains("is not found"), "لم يصل ردّ المزوّد: {}", report.message);
        assert!(!report.message.contains("sk-test-secret-123"), "تسرّب المفتاح: {}", report.message);
    }

    #[test]
    fn a_probe_that_hits_the_token_cap_still_counts_as_generating() {
        let (base, _request) = stub_seq(vec![
            ("200 OK", r#"{"data":[{"id":"gpt-5.6-terra"}]}"#),
            ("200 OK", r#"{"choices":[{"finish_reason":"length","message":{"content":""}}]}"#),
        ]);
        let report = futures_lite_block_on(check_connection(&cloud_settings(&base, "gpt-5.6-terra")));
        assert_eq!(report.generates, Some(true), "{}", report.message);
    }

    #[test]
    fn provider_detail_reads_both_shapes_and_hides_the_key() {
        let key = "AIzaSy-secret-key-000";
        let object = r#"{"error":{"message":"Model AIzaSy-secret-key-000 not found"}}"#;
        let array = r#"[{"error":{"message":"not supported for generateContent"}}]"#;
        assert_eq!(provider_detail(object, key).as_deref(), Some("Model … not found"));
        assert_eq!(provider_detail(array, key).as_deref(), Some("not supported for generateContent"));
        assert_eq!(provider_detail("<html>bad gateway</html>", key), None);
        assert_eq!(provider_detail(&format!(r#"{{"error":{{"message":"{}"}}}}"#, "x".repeat(500)), key).unwrap().chars().count(), DETAIL_LIMIT);
    }

    #[test]
    fn a_good_key_with_a_wrong_model_name_says_exactly_that() {
        // الشكوى التي لا يجيب عنها نجاحٌ أو فشلٌ واحد
        let (base, _request) = stub_once("200 OK", r#"{"data":[{"id":"gpt-5.6-terra"}]}"#);
        let report = futures_lite_block_on(check_connection(&cloud_settings(&base, "gpt-4o-mini")));

        assert!(report.connected, "الاتصال نجح فعلًا");
        assert!(report.key_accepted, "المفتاح قُبل فعلًا");
        assert_eq!(report.model_listed, Some(false));
        assert!(report.message.contains("gpt-4o-mini"), "الرسالة لا تسمّي النموذج: {}", report.message);
        assert!(!report.message.contains(ERR_BAD_KEY), "لُمت المفتاح وهو سليم");
    }

    #[test]
    fn a_rejected_key_never_blames_the_model_name() {
        let (base, _request) = stub_once("401 Unauthorized", r#"{"error":{"message":"bad key"}}"#);
        let report = futures_lite_block_on(check_connection(&cloud_settings(&base, "gpt-5.6-terra")));

        assert!(report.connected, "وصلنا إلى المزوّد وردّ");
        assert!(!report.key_accepted);
        assert_eq!(report.model_listed, None, "لا حكم على النموذج والمفتاح مرفوض");
        assert_eq!(report.message, ERR_BAD_KEY);
    }

    #[test]
    fn a_dead_address_is_a_failure_to_connect_not_a_bad_key() {
        // منفذ مغلق: العنوان لا يستجيب أصلًا
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        drop(listener);
        let report = futures_lite_block_on(check_connection(&cloud_settings(
            &format!("http://127.0.0.1:{port}"),
            "gpt-5.6-terra",
        )));

        assert!(!report.connected);
        assert!(!report.message.contains("المفتاح"), "اتُّهم المفتاح بعطل شبكة: {}", report.message);
    }
}
