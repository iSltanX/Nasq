// أمر برج «شَذْب» الوحيد: prune_text — فحص الشذرة وإرجاع بطاقة قراءة
// وقائمة قصّات مقترحة. لا واجهة تناديه بعد (المرحلة 3 نواة خلفية فقط).
//
// الضمانة البنيوية: PruneResult لا يملك حقل نص كامل أصلًا — يستحيل أن
// يتسرب «نص محسّن» عبر هذا الأمر حتى لو أخرجه النموذج، فالحقل غير موجود.
// وكل قصّة تمر بالتحقق الآلي: حرفية الاقتباس، وليست النص كله، وضمن سقف
// الحجم — ما يسقط يُحصى في droppedCuts فيبقى الإسقاط مرئيًا لا صامتًا.
use serde::Serialize;
use serde_json::json;

use super::contracts::*;
use super::verify;
use crate::shared::llm::{extract_json, request_completion};
use crate::shared::settings::read_settings;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ReadingCard {
    pub(crate) central_sentence: String,
    pub(crate) over_explanation: String,
    pub(crate) ending: String,
    pub(crate) rhythm: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ProposedCut {
    pub(crate) quote: String,
    pub(crate) reason: String,
    // يُحسب محليًا من الاقتباس نفسه — عدّ النموذج لا يُؤتمن
    pub(crate) word_count: u32,
    pub(crate) expected_effect: String,
    pub(crate) safe: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PruneResult {
    pub(crate) reading_card: ReadingCard,
    pub(crate) cuts: Vec<ProposedCut>,
    // ما أسقطه التحقق الآلي (غير حرفي/فوق السقف/النص كله/فوق العدد)
    pub(crate) dropped_cuts: u32,
}

/// يفكك ناتج النموذج ويُخضع كل قصّة للتحقق الآلي قبل قبولها
pub(crate) fn parse_prune_result(content: &str, original: &str) -> Result<PruneResult, String> {
    let v = extract_json(content)
        .ok_or_else(|| "أعاد النموذج ناتجًا غير صالح — أعد المحاولة.".to_string())?;

    let card = &v["readingCard"];
    let reading_card = ReadingCard {
        central_sentence: card["centralSentence"].as_str().unwrap_or("").trim().to_string(),
        over_explanation: card["overExplanation"].as_str().unwrap_or("").trim().to_string(),
        ending: card["ending"].as_str().unwrap_or("").trim().to_string(),
        rhythm: card["rhythm"].as_str().unwrap_or("").trim().to_string(),
    };

    let total_words = original.split_whitespace().count();
    let mut cuts: Vec<ProposedCut> = Vec::new();
    let mut dropped = 0u32;

    if let Some(list) = v["cuts"].as_array() {
        for c in list {
            let quote = c["quote"].as_str().unwrap_or("").to_string();
            // العهد مفحوص لا موعود: حرفية، وليست النص كله، وضمن السقف
            let verbatim = !quote.is_empty() && original.contains(&quote);
            let not_whole = quote.trim() != original.trim();
            let within = verify::cut_within_limits(&quote, total_words, MAX_CUT_WORDS);
            if !(verbatim && not_whole && within) || cuts.len() >= MAX_CUTS {
                dropped += 1;
                continue;
            }
            cuts.push(ProposedCut {
                word_count: quote.split_whitespace().count() as u32,
                quote,
                reason: c["reason"].as_str().unwrap_or("").trim().to_string(),
                expected_effect: c["expectedEffect"].as_str().unwrap_or("").trim().to_string(),
                // الافتراض الحذر: ما لم يصرّح النموذج بالأمان فهو قرار جريء
                safe: c["safe"].as_bool().unwrap_or(false),
            });
        }
    }

    if reading_card.central_sentence.is_empty() && cuts.is_empty() {
        return Err("أعاد النموذج ناتجًا فارغًا — أعد المحاولة.".to_string());
    }

    Ok(PruneResult { reading_card, cuts, dropped_cuts: dropped })
}

#[tauri::command]
pub(crate) async fn prune_text(app: tauri::AppHandle, text: String) -> Result<PruneResult, String> {
    let settings = read_settings(&app)?;

    if text.trim().is_empty() {
        return Err("النص فارغ.".to_string());
    }

    let user_message = build_prune_message(&text);
    let messages = json!([
        { "role": "system", "content": PRUNE_SYSTEM_PROMPT },
        { "role": "user", "content": user_message }
    ]);

    // مخرج شَذْب صغير بطبعه (بطاقة + اقتباسات ⊆ النص) — سقف أدنى بكثير من
    // سقف نسق، وفيه هامش لتوكنات التفكير المحدودة حيث تُحسب من المخرج
    let max_tokens = (text.chars().count() as u64 / 2 + 700).clamp(1200, 6144);

    let content = request_completion(
        &settings,
        &messages,
        max_tokens,
        PRUNE_TEMPERATURE,
        PRUNE_THINKING_BUDGET,
    )
    .await?;
    parse_prune_result(&content, &text)
}

#[cfg(test)]
mod tests {
    use super::*;

    const ORIGINAL: &str = "الحنين لا يعود إلى الأماكن، بل إلى أنفسنا التي تركناها هناك. نحن لا نشتاق إلى البيت القديم، وإنما نشتاق إلى صورتنا فيه. وهذا هو معنى الحنين الحقيقي في نهاية الأمر.";

    #[test]
    fn parse_accepts_verbatim_cut_and_recomputes_word_count() {
        // النموذج كذب في العدّ (99) — العدّ يُحسب محليًا من الاقتباس
        let content = r#"{"readingCard": {"centralSentence": "الحنين لا يعود إلى الأماكن، بل إلى أنفسنا التي تركناها هناك.", "overExplanation": "الخاتمة", "ending": "تشرح", "rhythm": "هادئ"}, "cuts": [{"quote": "وهذا هو معنى الحنين الحقيقي في نهاية الأمر.", "reason": "خاتمة تشرح", "wordCount": 99, "expectedEffect": "تبقى الضربة بلا شرح.", "safe": false}]}"#;
        let r = parse_prune_result(content, ORIGINAL).unwrap();
        assert_eq!(r.cuts.len(), 1);
        assert_eq!(r.cuts[0].word_count, 8);
        assert_eq!(r.dropped_cuts, 0);
        assert_eq!(r.reading_card.ending, "تشرح");
        assert!(!r.cuts[0].safe);
    }

    #[test]
    fn parse_drops_non_verbatim_oversized_and_whole_text_cuts() {
        let content = format!(
            r#"{{"readingCard": {{"centralSentence": "الحنين لا يعود إلى الأماكن", "overExplanation": "لا يوجد", "ending": "تضرب", "rhythm": "هادئ"}}, "cuts": [
                {{"quote": "وهذا هو معنى الحنين الحقيقى في نهاية الأمر.", "reason": "غير حرفي — ياء بدل الهمزة", "wordCount": 8, "expectedEffect": "-", "safe": true}},
                {{"quote": "نحن لا نشتاق إلى البيت القديم، وإنما نشتاق إلى صورتنا فيه. وهذا هو معنى الحنين الحقيقي", "reason": "أكبر من السقف", "wordCount": 16, "expectedEffect": "-", "safe": true}},
                {{"quote": "{}", "reason": "النص كله", "wordCount": 31, "expectedEffect": "-", "safe": true}},
                {{"quote": "في نهاية الأمر.", "reason": "حشو", "wordCount": 3, "expectedEffect": "إيجاز.", "safe": true}}
            ]}}"#,
            ORIGINAL
        );
        let r = parse_prune_result(&content, ORIGINAL).unwrap();
        assert_eq!(r.cuts.len(), 1, "قصّة واحدة فقط تنجو من التحقق");
        assert_eq!(r.cuts[0].quote, "في نهاية الأمر.");
        assert_eq!(r.dropped_cuts, 3);
    }

    #[test]
    fn parse_caps_cuts_at_three_and_counts_overflow() {
        let content = r#"{"readingCard": {"centralSentence": "الحنين لا يعود", "overExplanation": "لا يوجد", "ending": "تضرب", "rhythm": "هادئ"}, "cuts": [
            {"quote": "بل", "reason": "أ", "wordCount": 1, "expectedEffect": "-", "safe": true},
            {"quote": "نحن", "reason": "ب", "wordCount": 1, "expectedEffect": "-", "safe": true},
            {"quote": "فيه", "reason": "ج", "wordCount": 1, "expectedEffect": "-", "safe": true},
            {"quote": "هناك", "reason": "د", "wordCount": 1, "expectedEffect": "-", "safe": true}
        ]}"#;
        let r = parse_prune_result(content, ORIGINAL).unwrap();
        assert_eq!(r.cuts.len(), 3);
        assert_eq!(r.dropped_cuts, 1);
    }

    #[test]
    fn full_text_field_from_model_cannot_leak_into_result() {
        // حتى لو أخرج النموذج «نسخة كاملة» في حقل غريب، البنية لا تحملها:
        // الناتج المتسلسل لا يحوي الحقل ولا النص الكامل
        let content = format!(
            r#"{{"readingCard": {{"centralSentence": "الحنين لا يعود إلى الأماكن", "overExplanation": "لا يوجد", "ending": "تضرب", "rhythm": "هادئ"}}, "formattedText": "{}", "improvedVersion": "نسخة محسنة مزعومة", "cuts": []}}"#,
            ORIGINAL
        );
        let r = parse_prune_result(&content, ORIGINAL).unwrap();
        let serialized = serde_json::to_string(&r).unwrap();
        assert!(!serialized.contains("formattedText"));
        assert!(!serialized.contains("improvedVersion"));
        assert!(!serialized.contains(ORIGINAL));
    }

    #[test]
    fn parse_rejects_garbage_and_empty_results() {
        assert!(parse_prune_result("ليس JSON إطلاقًا", ORIGINAL).is_err());
        let empty = r#"{"readingCard": {"centralSentence": "", "overExplanation": "", "ending": "", "rhythm": ""}, "cuts": []}"#;
        assert!(parse_prune_result(empty, ORIGINAL).is_err());
        // بطاقة عامرة بلا قصّات = شذرة مُحكَمة — نتيجة مشروعة لا خطأ
        let card_only = r#"{"readingCard": {"centralSentence": "الحنين لا يعود إلى الأماكن", "overExplanation": "لا يوجد", "ending": "تضرب", "rhythm": "هادئ"}, "cuts": []}"#;
        let r = parse_prune_result(card_only, ORIGINAL).unwrap();
        assert!(r.cuts.is_empty());
    }

    #[test]
    fn shadhb_knobs_are_surgical_and_its_own() {
        // إعدادات شَذْب قراره وحده: حرارة جراحية منخفضة وتفكير محدود غير صفري
        // — لا يرثهما من نسق ولا يورثهما له (العزل يمنع الاستيراد أصلًا)
        assert!(PRUNE_TEMPERATURE <= 0.4, "حرارة التشذيب يجب أن تبقى جراحية");
        assert!(PRUNE_THINKING_BUDGET > 0, "شَذْب يفكر — عكس نسق المقفول على الصفر");
        assert!(PRUNE_THINKING_BUDGET <= 4096, "ميزانية محدودة لا مفتوحة");
        assert_eq!(MAX_CUTS, 3);
    }

    #[test]
    fn prune_contract_bans_are_present_and_text_comes_last() {
        for phrase in [
            "لا تقترح إضافة كلمة ولا استبدال كلمة",
            "لا تعيد كتابة النص",
            "حرفًا بحرف",
            "القائمة الفارغة أشرف",
            "أنت مقصّ لا قلم",
        ] {
            assert!(PRUNE_SYSTEM_PROMPT.contains(phrase), "عبارة مفقودة: {phrase}");
        }
        for phrase in ["أصغر قصٍّ يحقق الأثر", "تُشذَّب ولا تُبتَر", "ممنوع منعًا باتًا"] {
            assert!(PRUNE_RULES.contains(phrase), "قاعدة مفقودة: {phrase}");
        }
        let msg = build_prune_message("نص التجربة الأخير");
        assert!(msg.ends_with("نص التجربة الأخير"), "النص ليس آخر الرسالة");
        assert!(!msg.contains("formattedText"), "لا حقل نص كامل في الصيغة المطلوبة");
        assert!(msg.contains("readingCard") && msg.contains("cuts"));
    }
}
