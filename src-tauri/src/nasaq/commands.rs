// أوامر برج «نسق» الثلاثة: «نسّق النص» و«لوحة التنويعات» و«سطور أقل/أكثر» —
// تركّب الرسائل من عقود contracts وتمررها عبر نقل shared::llm الخام،
// ثم تفكك الناتج إلى بنية النتيجة. (نُقل من main.rs حرفيًا في تحصين v4.1)
use serde::Serialize;
use serde_json::json;

use super::contracts::*;
use crate::shared::llm::{extract_json, request_completion};
use crate::shared::settings::read_settings;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FormatResult {
    pub(crate) formatted_text: String,
    pub(crate) notes: Vec<String>,
    pub(crate) intervention_level: String,
    // بصمة الإيقاع: وصف محايد منفصل عن النص — None لغير المستويين الإيقاعيين
    // أو حين لا يُرجعه النموذج
    pub(crate) rhythm_profile: Option<String>,
}

/// يفكك ناتج النموذج إلى بنية النتيجة — مشترك بين النداءين
pub(crate) fn parse_format_result(content: &str, intervention: &str) -> Result<FormatResult, String> {
    let (formatted, notes, level, rhythm_profile) = match extract_json(content) {
        Some(v) => {
            let formatted = v["formattedText"]
                .as_str()
                .or_else(|| v["formatted_text"].as_str())
                .unwrap_or("")
                .to_string();
            let notes = v["notes"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|n| n.as_str().map(|s| s.to_string()))
                        .collect()
                })
                .unwrap_or_default();
            let level = v["interventionLevel"]
                .as_str()
                .unwrap_or(intervention)
                .to_string();
            // بصمة الإيقاع حقل مستقل — غيابه أو فراغه يعني بلا وصف (مستوى غير إيقاعي)
            let rhythm_profile = v["rhythmProfile"]
                .as_str()
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
            (formatted, notes, level, rhythm_profile)
        }
        // إن لم يكن الناتج JSON لكنه نص عادي بلا أقواس، نعامله كنص منسّق مباشرة
        None if !content.contains('{') => {
            (content.to_string(), Vec::new(), intervention.to_string(), None)
        }
        None => {
            return Err("أعاد النموذج ناتجًا غير صالح — أعد المحاولة.".to_string());
        }
    };

    if formatted.trim().is_empty() {
        return Err("أعاد النموذج نتيجة فارغة — أعد المحاولة. نصّك الأصلي محفوظ في خانة الإدخال.".to_string());
    }

    Ok(FormatResult {
        formatted_text: formatted,
        notes,
        intervention_level: level,
        rhythm_profile,
    })
}

#[tauri::command]
pub(crate) async fn format_text(
    app: tauri::AppHandle,
    text: String,
    style: String,
    intervention: String,
    platform: Option<String>,
    attempt: Option<u64>,
    directives: Option<String>,
) -> Result<FormatResult, String> {
    let settings = read_settings(&app)?;

    if text.trim().is_empty() {
        return Err("النص فارغ.".to_string());
    }

    let rules = compose_rules(&style, &intervention, platform.as_deref());
    let variation = variation_note(attempt.unwrap_or(1).max(1), &style);
    let directives = directives_block(directives.as_deref());

    let user_message =
        build_format_message(&style, &intervention, &rules, &directives, &variation, &text);

    let messages = json!([
        { "role": "system", "content": SYSTEM_PROMPT },
        { "role": "user", "content": user_message }
    ]);

    // سقف لتوكنات الإخراج يحدّ من أسوأ استهلاك ممكن للرصيد:
    // الناتج بحجم المدخل تقريبًا، والحد محسوب بهامش أمان واسع
    let max_tokens = (text.chars().count() as u64 + 500).clamp(1500, 16384);

    let content =
        request_completion(&settings, &messages, max_tokens, CREATIVE_TEMPERATURE).await?;
    parse_format_result(&content, &intervention)
}

/// نداء مخصص للوحة التنويعات — لا يُستدعى من «نسّق النص» أو «سطور أقل/أكثر».
/// منفصل عن format_text عمدًا: حرارة أعلى (VARIATIONS_TEMPERATURE) ورافعة
/// كثافة كسر صريحة لكل شق (variation_slot_lever)، فلا يتأثر مسار التنسيق
/// العام بشيء من هذا.
#[tauri::command]
pub(crate) async fn generate_variation(
    app: tauri::AppHandle,
    text: String,
    style: String,
    intervention: String,
    platform: Option<String>,
    slot: u8,
    attempt: u64,
    directives: Option<String>,
) -> Result<FormatResult, String> {
    let settings = read_settings(&app)?;

    if text.trim().is_empty() {
        return Err("النص فارغ.".to_string());
    }

    let rules = compose_rules(&style, &intervention, platform.as_deref());
    let directives = directives_block(directives.as_deref());

    let user_message = build_variation_message(
        &style,
        &intervention,
        &rules,
        variation_slot_lever(slot),
        &directives,
        attempt,
        &text,
    );

    let messages = json!([
        { "role": "system", "content": SYSTEM_PROMPT },
        { "role": "user", "content": user_message }
    ]);

    let max_tokens = (text.chars().count() as u64 + 500).clamp(1500, 16384);

    let content =
        request_completion(&settings, &messages, max_tokens, VARIATIONS_TEMPERATURE).await?;
    parse_format_result(&content, &intervention)
}

#[tauri::command]
pub(crate) async fn adjust_lines(
    app: tauri::AppHandle,
    original: String,
    current: String,
    style: String,
    intervention: String,
    platform: Option<String>,
    direction: String,
    attempt: Option<u64>,
    directives: Option<String>,
) -> Result<FormatResult, String> {
    let settings = read_settings(&app)?;

    if current.trim().is_empty() {
        return Err("لا توجد نتيجة لتعديلها.".to_string());
    }

    let rules = compose_rules(&style, &intervention, platform.as_deref());

    let direction_rules = if direction == "fewer" {
        "المطلوب: أسطر أقل — ادمج المقاطع القريبة وقلّل الفواصل البصرية، دون حذف فكرة أساسية ودون تحويل النص إلى ملخّص."
    } else {
        "المطلوب: أسطر أكثر — افتح المقاطع وأبرز الوقفات وزد التنفّس البصري، دون إضافة عبارات من عندك ودون إطالة مصطنعة."
    };

    // مدى الشذرة أضيق من مدى المقال — إن بلغت حدّها لا تتمادى
    let fragment_note = if style == STYLE_FRAGMENT {
        "\nالنمط شذرة والمدى ضيق: «أسطر أكثر» يفتح الكسور الداخلية فقط (عزل المنعطف، سطر لكل جملة) دون تفتيت، و«أسطر أقل» يضغط الشذرة نحو أكثف صورة (سطر أو سطران). إن بلغت الشذرة حدّها فأعدها كما هي."
    } else {
        ""
    };

    // على سابستاك «الأسطر» كسور لا فراغات — الفراغ يُبتلع عند النشر
    let substack_note = if intervention == LEVEL_PLATFORM
        && platform.as_deref().map(is_substack).unwrap_or(false)
    {
        "\nالوجهة سابستاك: «أسطر أكثر» يزيد كسور السطر المفردة لا الأسطر الفارغة (فالفراغ يُبتلع عند النشر)، و«أسطر أقل» يدمج بتقليل الكسور. التنفّس بالكسر لا بالفراغ."
    } else {
        ""
    };

    let attempt_num = attempt.unwrap_or(1).max(1);
    let directives = directives_block(directives.as_deref());

    let user_message = build_adjust_message(
        &style,
        &intervention,
        &rules,
        direction_rules,
        fragment_note,
        substack_note,
        &directives,
        attempt_num,
        &original,
        &current,
    );

    let messages = json!([
        { "role": "system", "content": SYSTEM_PROMPT },
        { "role": "user", "content": user_message }
    ]);

    // الناتج بحجم النتيجة الحالية تقريبًا، بهامش أمان واسع
    let max_tokens = (current.chars().count() as u64 + 500).clamp(1500, 16384);

    let content =
        request_completion(&settings, &messages, max_tokens, CREATIVE_TEMPERATURE).await?;
    parse_format_result(&content, &intervention)
}
