// التحقق الآلي لبرج «شَذْب» — الضمانة المعمارية لعهد «يحذف ولا يضيف»:
// رياضيات نصية بحتة تُطابق سلوك وحدة الواجهة النقية src/prune.js سلوكًا
// لا استدعاءً، والتطابق مضمون بحالات مشتركة (tests/fixtures/prune-cases.json)
// يستهلكها الطرفان — أي انحراف بين التطبيقين يفشل هنا وهناك معًا.

/// طلب قصّة: اقتباس حرفي + رقم الظهور (الأول افتراضًا)
pub(crate) struct CutRequest {
    pub(crate) quote: String,
    pub(crate) occurrence: usize,
}

pub(crate) struct ApplyOutcome {
    pub(crate) text: String,
    pub(crate) applied: usize,
    pub(crate) skipped: usize,
}

/// يطبق القصّات تتابعيًا على النص المتطور: الاقتباس غير الموجود حرفيًا
/// لا يُطبَّق ويُعدّ متخطًّى — لا مطابقة تقريبية ولا إصلاح
pub(crate) fn apply_cuts(text: &str, cuts: &[CutRequest]) -> ApplyOutcome {
    let mut out = text.to_string();
    let mut applied = 0usize;
    let mut skipped = 0usize;

    for cut in cuts {
        if cut.quote.is_empty() {
            skipped += 1;
            continue;
        }
        let occurrence = cut.occurrence.max(1);

        let mut found: Option<usize> = None;
        let mut from = 0usize;
        let mut ok = true;
        for _ in 0..occurrence {
            match out.get(from..).and_then(|s| s.find(&cut.quote)) {
                Some(rel) => {
                    let abs = from + rel;
                    found = Some(abs);
                    // التقدم بمحرف واحد كامل (لا بايت) حتى لا ينكسر UTF-8
                    let step = out[abs..].chars().next().map(|c| c.len_utf8()).unwrap_or(1);
                    from = abs + step;
                }
                None => {
                    ok = false;
                    break;
                }
            }
        }

        match (ok, found) {
            (true, Some(abs)) => {
                out.replace_range(abs..abs + cut.quote.len(), "");
                applied += 1;
            }
            _ => skipped += 1,
        }
    }

    ApplyOutcome { text: out, applied, skipped }
}

// ---------- ترتيب آثار الحذف — الخطوات السبع بترتيب prune.js نفسه ----------

fn collapse_space_runs(s: &str) -> String {
    // [ \t]{2,} → مسافة واحدة، والمحرف المفرد يبقى كما هو (مسافة أو تبويب)
    let mut out = String::with_capacity(s.len());
    let mut run: Vec<char> = Vec::new();
    let flush = |out: &mut String, run: &mut Vec<char>| {
        if run.len() >= 2 {
            out.push(' ');
        } else {
            for &c in run.iter() {
                out.push(c);
            }
        }
        run.clear();
    };
    for c in s.chars() {
        if c == ' ' || c == '\t' {
            run.push(c);
        } else {
            flush(&mut out, &mut run);
            out.push(c);
        }
    }
    flush(&mut out, &mut run);
    out
}

fn collapse_dup_punct(s: &str) -> String {
    // ([،؛])(فراغ*\1)+ → العلامة مرة واحدة — أثر التقاء قصّين
    let chars: Vec<char> = s.chars().collect();
    let mut out = String::with_capacity(s.len());
    let mut i = 0usize;
    while i < chars.len() {
        let c = chars[i];
        out.push(c);
        if c == '،' || c == '؛' {
            let mut j = i + 1;
            loop {
                let mut k = j;
                while k < chars.len() && chars[k].is_whitespace() {
                    k += 1;
                }
                if k < chars.len() && chars[k] == c {
                    j = k + 1;
                } else {
                    break;
                }
            }
            i = j;
        } else {
            i += 1;
        }
    }
    out
}

fn is_stop_punct(c: char) -> bool {
    matches!(c, '،' | '؛' | ':' | '.' | '؟' | '!' | '…')
}

fn strip_space_before_stop(s: &str) -> String {
    // « +علامة» → «علامة» — مسافات فقط لا تبويب، كسلوك الواجهة حرفيًا
    let mut out = String::with_capacity(s.len());
    for c in s.chars() {
        if is_stop_punct(c) {
            while out.ends_with(' ') {
                out.pop();
            }
        }
        out.push(c);
    }
    out
}

fn strip_leading_orphan_punct(line: &str) -> String {
    // ^[ \t]*[،؛]+[ \t]* → يُحذف فقط حين توجد العلامة اليتيمة فعلًا —
    // النقطة والنقطة العارية (·) لا تُمسان: قد تكونان فاصل شذرات مقصودًا
    let rest = line.trim_start_matches([' ', '\t']);
    if rest.starts_with(['،', '؛']) {
        rest.trim_start_matches(['،', '؛'])
            .trim_start_matches([' ', '\t'])
            .to_string()
    } else {
        line.to_string()
    }
}

fn collapse_blank_lines(s: &str) -> String {
    // \n{3,} → \n\n — حذف سطر كامل لا يترك أكثر من فراغ واحد
    let mut out = String::with_capacity(s.len());
    let mut newlines = 0usize;
    let emit = |out: &mut String, n: usize| {
        if n >= 3 {
            out.push_str("\n\n");
        } else {
            for _ in 0..n {
                out.push('\n');
            }
        }
    };
    for c in s.chars() {
        if c == '\n' {
            newlines += 1;
        } else {
            emit(&mut out, newlines);
            newlines = 0;
            out.push(c);
        }
    }
    emit(&mut out, newlines);
    out
}

/// ترتيب آثار الحذف حتميًا — تنظيف لا تحويل: لا يضيف محرف كلمة واحدًا،
/// فشرط verify_subset يبقى قائمًا بعده دائمًا، وتكرار تطبيقه آمن
pub(crate) fn tidy_after_cut(text: &str) -> String {
    let mut t = text.replace("\r\n", "\n").replace('\r', "\n");
    t = collapse_space_runs(&t);
    t = collapse_dup_punct(&t);
    t = strip_space_before_stop(&t);
    t = t
        .split('\n')
        .map(strip_leading_orphan_punct)
        .collect::<Vec<_>>()
        .join("\n");
    t = t
        .split('\n')
        .map(str::trim)
        .collect::<Vec<_>>()
        .join("\n");
    t = collapse_blank_lines(&t);
    t.trim().to_string()
}

// ---------- شهادة العهد: الناتج ⊂ الأصل كتتابع كلمات ----------

fn is_edge_punct(c: char) -> bool {
    c.is_whitespace()
        || matches!(
            c,
            '،' | '؛' | ':' | '.' | '؟' | '!' | '…' | '«' | '»' | '"' | '\'' | '(' | ')'
                | '[' | ']' | '{' | '}' | '·' | '—' | '–' | '-'
        )
}

/// نوى الكلمات: تقسيم على الفراغ وتجريد علامات الوقف من طرفي كل كلمة —
/// المعجم نفسه المعتمد في src/prune.js حرفًا بحرف
pub(crate) fn word_cores(text: &str) -> Vec<String> {
    text.split_whitespace()
        .map(|w| w.trim_matches(|c: char| is_edge_punct(c)))
        .filter(|w| !w.is_empty())
        .map(String::from)
        .collect()
}

pub(crate) struct SubsetCheck {
    pub(crate) ok: bool,
    pub(crate) added_words: Vec<String>,
}

/// كل كلمة في الناتج موجودة في الأصل وبترتيبها — الإضافة وإعادة الترتيب
/// كلتاهما تُسقطان الشهادة. قاعدة «يحذف ولا يضيف» مفحوصة آليًا لا موعودة
pub(crate) fn verify_subset(original: &str, pruned: &str) -> SubsetCheck {
    let source = word_cores(original);
    let target = word_cores(pruned);
    let mut added_words = Vec::new();

    let mut cursor = 0usize;
    for word in target {
        match source[cursor..].iter().position(|w| *w == word) {
            Some(rel) => cursor += rel + 1,
            None => added_words.push(word),
        }
    }

    SubsetCheck { ok: added_words.is_empty(), added_words }
}

/// سقف حجم القصّة الواحدة — يُفرض آليًا لأن المعايرة أثبتت أن قاعدة العقد
/// النصية وحدها لا تُلزم النموذج (شذرة 73 كلمة جاءت بقصّة 21 كلمة).
/// البوابة أرخى من طموح العقد عمدًا: العقد يطلب المثالي (~12 كلمة ورُبع
/// النص) والبوابة تصدّ الفاحش (فوق السقف المطلق أو نصف النص) — قصّة خاتمةٍ
/// مشروعة من شذرة قصيرة قد تبلغ ثلثها، وبين الطموح والصدّ مساحة حكم الكاتب
pub(crate) fn cut_within_limits(quote: &str, total_words: usize, max_cut_words: usize) -> bool {
    let wc = quote.split_whitespace().count();
    wc > 0 && wc <= max_cut_words && wc * 2 <= total_words.max(2)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::Value;

    // الحالات المشتركة مع الواجهة — المصدر الواحد لتطابق السلوك بين
    // Rust (هنا) وNode (tests/prune-fixtures.test.js)
    const FIXTURES: &str = include_str!("../../../tests/fixtures/prune-cases.json");

    fn fixtures() -> Value {
        serde_json::from_str(FIXTURES).expect("ملف الحالات المشتركة تالف")
    }

    #[test]
    fn apply_cuts_matches_shared_fixtures() {
        for case in fixtures()["applyCuts"].as_array().unwrap() {
            let name = case["name"].as_str().unwrap();
            let cuts: Vec<CutRequest> = case["cuts"]
                .as_array()
                .unwrap()
                .iter()
                .map(|c| CutRequest {
                    quote: c["quote"].as_str().unwrap_or("").to_string(),
                    occurrence: c["occurrence"].as_u64().unwrap_or(1) as usize,
                })
                .collect();
            let outcome = apply_cuts(case["text"].as_str().unwrap(), &cuts);
            assert_eq!(outcome.text, case["expected"].as_str().unwrap(), "نص {name}");
            assert_eq!(outcome.applied as u64, case["applied"].as_u64().unwrap(), "applied {name}");
            assert_eq!(outcome.skipped as u64, case["skipped"].as_u64().unwrap(), "skipped {name}");
        }
    }

    #[test]
    fn tidy_after_cut_matches_shared_fixtures_and_is_idempotent() {
        for case in fixtures()["tidyAfterCut"].as_array().unwrap() {
            let name = case["name"].as_str().unwrap();
            let once = tidy_after_cut(case["input"].as_str().unwrap());
            assert_eq!(once, case["expected"].as_str().unwrap(), "ترتيب {name}");
            assert_eq!(tidy_after_cut(&once), once, "الترتيب غير حتمي التكرار في {name}");
        }
    }

    #[test]
    fn verify_subset_matches_shared_fixtures() {
        for case in fixtures()["verifySubset"].as_array().unwrap() {
            let name = case["name"].as_str().unwrap();
            let check = verify_subset(
                case["original"].as_str().unwrap(),
                case["pruned"].as_str().unwrap(),
            );
            assert_eq!(check.ok, case["ok"].as_bool().unwrap(), "ok {name}");
            let expected: Vec<String> = case["addedWords"]
                .as_array()
                .unwrap()
                .iter()
                .map(|w| w.as_str().unwrap().to_string())
                .collect();
            assert_eq!(check.added_words, expected, "addedWords {name}");
        }
    }

    #[test]
    fn pipeline_preserves_covenant_end_to_end() {
        // قص ثم ترتيب ثم شهادة — العهد يصمد عبر الخط كله
        let original = "الحنين لا يعود إلى الأماكن، بل إلى أنفسنا التي تركناها هناك. وهذا هو معنى الحنين الحقيقي في نهاية الأمر.";
        let cuts = [CutRequest {
            quote: "وهذا هو معنى الحنين الحقيقي في نهاية الأمر.".to_string(),
            occurrence: 1,
        }];
        let outcome = apply_cuts(original, &cuts);
        let tidied = tidy_after_cut(&outcome.text);
        assert_eq!(tidied, "الحنين لا يعود إلى الأماكن، بل إلى أنفسنا التي تركناها هناك.");
        assert!(verify_subset(original, &tidied).ok);
    }

    #[test]
    fn cut_size_limits_enforce_what_the_contract_only_requests() {
        // حالة المعايرة الفعلية: قصّة 21 كلمة من نص 73 كلمة تُرفض آليًا
        let long_cut = "الاسم لا يصف الشعور، يُدرّبه. وما تشعر به الآن، وقد سمّيته منذ جملتين، لم يعد ذلك الثقل الأول؛ صار تدريباً عليه.";
        assert!(!cut_within_limits(long_cut, 73, 14));
        // وقصّتا الجولة الثانية الجراحيتان (3 و4 كلمات من 89) تمران
        assert!(cut_within_limits("التي تحتاجها اليوم.", 89, 14));
        assert!(cut_within_limits("ثم نسيت أنك كاتبها.", 89, 14));
        // نص قصير جدًا: النصف يصدّ البتر وإن كان تحت السقف المطلق
        assert!(!cut_within_limits("خمس كلمات في نص قصير", 8, 14));
        // وقصّة خاتمة مشروعة (8 من 30 — 27%) تمر: البوابة تصدّ الفاحش لا المشروع
        assert!(cut_within_limits("وهذا هو معنى الحنين الحقيقي في نهاية الأمر.", 30, 14));
        // اقتباس فارغ لا يمر أبدًا
        assert!(!cut_within_limits("", 100, 14));
    }
}
