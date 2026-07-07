// اختبارات برج «نسق»: العقود والقواعد وبناة الرسائل وتفكيك ناتج النموذج.
// (نُقلت من main.rs حرفيًا في تحصين v4.1 — اختبارات النقل في shared::llm)
use super::commands::*;
use super::contracts::*;

#[test]
fn nasaq_thinking_budget_is_locked_at_zero() {
    // قرار تكلفة مقفول: التنسيق شكل لا حُكم — الصفر ثابت صلب لا إعداد،
    // وميزانية برج التشذيب في برجه ولا سبيل لها إلى هنا (العزل يمنع الاستيراد)
    assert_eq!(FORMAT_THINKING_BUDGET, 0);
}

#[test]
fn nasaq_contracts_frozen_after_prune_nucleus() {
    // حارس تجميد المرحلة 3: بناء نواة التشذيب لم يغيّر حرفًا في عقود نسق
    assert_eq!(
        CONTRACT,
        "أعد ترتيب الشكل والتنفّس البصري فقط. لا تضف أفكارًا جديدة ولا تغيّر المعنى."
    );
    assert_eq!(
        ADJUST_CONTRACT,
        "عدّل كثافة الأسطر والتنفّس البصري فقط، لا تلخّص النص ولا تضف معنى جديدًا."
    );
    assert!((CREATIVE_TEMPERATURE - 0.85).abs() < f64::EPSILON);
    assert!((VARIATIONS_TEMPERATURE - 0.92).abs() < f64::EPSILON);
    for phrase in ["أنت «نسق»", "لا تكتب بدل الكاتب", "لا تحلل النص ولا تنقده"] {
        assert!(SYSTEM_PROMPT.contains(phrase), "عبارة مؤسِّسة مفقودة: {phrase}");
    }
}

#[test]
fn creative_temperature_is_in_variation_range() {
    assert!((0.7..=0.9).contains(&CREATIVE_TEMPERATURE));
}

#[test]
fn variations_temperature_is_higher_than_general_creative_temperature() {
    // اللوحة غرضها التنويع الأقصى — حرارتها أعلى، ولا تتساوى بالعام
    assert!(VARIATIONS_TEMPERATURE > CREATIVE_TEMPERATURE);
    assert!((0.85..=1.0).contains(&VARIATIONS_TEMPERATURE));
}

#[test]
fn variation_slot_levers_are_three_distinct_density_instructions() {
    let levers: Vec<&str> = (0..3).map(variation_slot_lever).collect();
    let mut seen = std::collections::HashSet::new();
    for l in &levers {
        assert!(!l.is_empty());
        assert!(seen.insert(*l), "رافعة كثافة مكررة");
        assert!(l.contains("كثافة"), "الرافعة لا تذكر الكثافة صراحة");
    }
    // الرافعتان الأولى والثانية تتقابلان بالتجميع/التفريد لا تتشابهان
    assert!(levers[0].contains("منخفضة") && levers[0].contains("اجمع"));
    assert!(levers[1].contains("عالية") && levers[1].contains("افرد"));
    assert!(levers[2].contains("وسط"));
    // slot خارج 0..2 يسقط على الرافعة الوسطى بأمان (match _ =>)
    assert_eq!(variation_slot_lever(2), variation_slot_lever(5));
}

#[test]
fn variations_lock_forbids_word_changes_and_demands_visible_difference() {
    assert!(VARIATIONS_LOCK.contains("يتطابق حرفًا بحرف"));
    assert!(VARIATIONS_LOCK.contains("لا كلمة تُضاف أو تُحذف أو تُبدَّل"));
    assert!(VARIATIONS_LOCK.contains("فرق بصري واضح"));
}

#[test]
fn every_style_has_distinct_rules() {
    let styles = ["مقال", "منشور", "شذرة", "رسالة", "مخطط"];
    let mut seen = std::collections::HashSet::new();
    for s in styles {
        let rules = style_rules(s);
        assert!(!rules.is_empty());
        assert!(seen.insert(rules), "قواعد مكررة للنمط {s}");
    }
}

#[test]
fn every_intervention_level_has_distinct_rules() {
    let levels = [
        LEVEL_CLEAN,
        "تنسيق قراءة",
        LEVEL_RHYTHM,
        LEVEL_RHYTHM_DOTTED,
        LEVEL_PUBLISH,
        LEVEL_PLATFORM,
    ];
    let mut seen = std::collections::HashSet::new();
    for l in levels {
        let rules = intervention_rules(l);
        assert!(!rules.is_empty());
        assert!(seen.insert(rules), "قواعد مكررة للمستوى {l}");
    }
}

#[test]
fn every_platform_has_distinct_rules_and_unknown_falls_back() {
    let platforms = [
        PLATFORM_SUBSTACK_ARTICLE,
        PLATFORM_SUBSTACK_NOTE,
        "إكس",
        "ثريدز",
        "إنستغرام",
        "واتساب",
    ];
    let mut seen = std::collections::HashSet::new();
    for p in platforms {
        let rules = platform_rules(p);
        assert!(!rules.is_empty());
        assert!(seen.insert(rules), "قواعد مكررة للمنصة {p}");
    }
    assert!(platform_rules("").contains("غير محددة"));
}

#[test]
fn every_platform_has_distinct_fragment_rules() {
    let platforms = [
        PLATFORM_SUBSTACK_ARTICLE,
        PLATFORM_SUBSTACK_NOTE,
        "إكس",
        "ثريدز",
        "إنستغرام",
        "واتساب",
    ];
    let mut seen = std::collections::HashSet::new();
    for p in platforms {
        let rules = fragment_platform_rules(p);
        assert!(!rules.is_empty());
        assert!(seen.insert(rules), "قواعد شذرة مكررة للمنصة {p}");
        // قواعد الشذرة للمنصة تختلف عن قواعدها العامة — هذا جوهر التخصيص
        assert_ne!(rules, platform_rules(p), "قواعد الشذرة تطابق العامة للمنصة {p}");
    }
}

#[test]
fn substack_faces_split_rtl_article_from_ltr_note() {
    // المقال: RTL يعمل، والتنفّس بالكسر
    let article = platform_rules(PLATFORM_SUBSTACK_ARTICLE);
    assert!(article.contains("RTL"));
    assert!(article.contains("كسر السطر المفرد"));
    // النوت: LTR مفروض، والتنفّس بالكسر حصرًا
    let note = platform_rules(PLATFORM_SUBSTACK_NOTE);
    assert!(note.contains("LTR"));
    assert!(note.contains("كسر السطر المفرد"));
    assert_ne!(article, note);
    // الاسم القديم «سابستاك» في المسودات المحفوظة يُعامل كمقال
    assert_eq!(platform_rules("سابستاك"), article);
    assert_eq!(
        fragment_platform_rules("سابستاك"),
        fragment_platform_rules(PLATFORM_SUBSTACK_ARTICLE)
    );
}

#[test]
fn substack_destination_injects_breath_contract() {
    // وجها سابستاك يحقنان عقد الكسر تحت «تنسيق منصة»
    for p in [PLATFORM_SUBSTACK_ARTICLE, PLATFORM_SUBSTACK_NOTE, "سابستاك"] {
        let rules = compose_rules("مقال", LEVEL_PLATFORM, Some(p));
        assert!(rules.contains("قيد سابستاك"), "عقد الكسر غائب عن {p}");
        assert!(rules.contains("كسر السطر المفرد"));
    }
    // المنصات الأخرى لا تتأثر
    let x = compose_rules("منشور", LEVEL_PLATFORM, Some("إكس"));
    assert!(!x.contains("قيد سابستاك"));
    // وخارج مستوى «تنسيق منصة» لا يُحقن العقد
    let rhythm = compose_rules("مقال", LEVEL_RHYTHM, None);
    assert!(!rhythm.contains("قيد سابستاك"));
}

#[test]
fn substack_fragments_separate_by_break_with_bare_dot_exception() {
    let rules = compose_rules(STYLE_FRAGMENT, LEVEL_PLATFORM, Some(PLATFORM_SUBSTACK_NOTE));
    assert!(rules.contains("تُفصَل بكسر السطر"));
    assert!(rules.contains("نقطة عارية (·)"));
    assert!(rules.contains("قواعد الشذرة"));
    assert!(rules.contains("قيد سابستاك"));
}

#[test]
fn substack_non_fragment_injects_manual_markers_map() {
    // مقال/منشور/رسالة/مخطط على سابستاك: خريطة الرموز تُحقن
    for p in [PLATFORM_SUBSTACK_ARTICLE, PLATFORM_SUBSTACK_NOTE] {
        let rules = compose_rules("مقال", LEVEL_PLATFORM, Some(p));
        assert!(rules.contains("خريطة سابستاك اليدوية"), "الخريطة غائبة عن {p}");
        assert!(rules.contains("\"++\""));
        assert!(rules.contains("Enter"));
        assert!(rules.contains("\"**\""));
        assert!(rules.contains("Shift+Enter"));
        assert!(rules.contains("\"---\""));
        assert!(rules.contains("Divider"));
        // --- بنيوي نادر لا إيقاعي متكرر — التمييز الحاسم في العقد
        assert!(rules.contains("الغياب هو الأصل"));
        assert!(rules.contains("لا تضعه بين كل فقرتين"));
    }
}

#[test]
fn substack_fragment_does_not_inject_manual_markers_map() {
    // الشذرة على سابستاك: فاصلها مضبوط أصلًا (رقم/نقطة) — لا خريطة رموز إضافية
    let rules = compose_rules(STYLE_FRAGMENT, LEVEL_PLATFORM, Some(PLATFORM_SUBSTACK_ARTICLE));
    assert!(!rules.contains("خريطة سابستاك اليدوية"));
}

#[test]
fn manual_markers_map_absent_outside_substack() {
    // منصة أخرى أو بلا منصة: لا خريطة رموز إطلاقًا
    let x = compose_rules("مقال", LEVEL_PLATFORM, Some("إكس"));
    assert!(!x.contains("خريطة سابستاك اليدوية"));
    let none_platform = compose_rules("مقال", LEVEL_RHYTHM, None);
    assert!(!none_platform.contains("خريطة سابستاك اليدوية"));
}

#[test]
fn rhythm_fingerprint_injected_only_for_rhythmic_levels() {
    for level in [LEVEL_RHYTHM, LEVEL_RHYTHM_DOTTED] {
        let rules = compose_rules("مقال", level, None);
        assert!(rules.contains("بصمة الإيقاع"), "الحقن غائب عن {level}");
        assert!(rules.contains("rhythmProfile"));
    }
    // غير الإيقاعية: لا حقن إطلاقًا — حتى لو كان النمط شذرة أو المنصة سابستاك
    for level in [LEVEL_CLEAN, "تنسيق قراءة", LEVEL_PUBLISH] {
        assert!(!compose_rules("مقال", level, None).contains("بصمة الإيقاع"));
    }
    let platform_level = compose_rules("مقال", LEVEL_PLATFORM, Some(PLATFORM_SUBSTACK_ARTICLE));
    assert!(!platform_level.contains("بصمة الإيقاع"));
}

#[test]
fn rhythm_fingerprint_contract_bans_judgment_and_recommendation_language() {
    let c = RHYTHM_FINGERPRINT_CONTRACT;
    // معجم محايد مذكور صراحة، وحظر التقييم والتوصية والمقارنة بمثالي
    assert!(c.contains("معجم محايد"));
    assert!(c.contains("ممنوع منعًا باتًا"));
    assert!(c.contains("مرتبك") && c.contains("ثقيل") && c.contains("رتيب"));
    assert!(c.contains("لغة توصية"));
    assert!(c.contains("أكثر من اللازم") && c.contains("جدًا"));
    assert!(c.contains("مرآة تصف، لا ناقد يحكم"));
}

#[test]
fn directives_block_empty_when_absent_preserving_old_behavior() {
    // فارغ تمامًا حين لا توجيهات — الرسالة النهائية مطابقة حرفيًا لما قبل v4.0
    assert_eq!(directives_block(None), "");
    assert_eq!(directives_block(Some("")), "");
    assert_eq!(directives_block(Some("   \n  ")), "");
}

#[test]
fn directives_block_carries_user_text_with_priority_and_no_rewrite_rule() {
    let block = directives_block(Some("اجعل الجملة الأخيرة في سطر مستقل."));
    assert!(block.contains("توجيهات خاصة من الكاتب"));
    assert!(block.contains("اجعل الجملة الأخيرة في سطر مستقل."));
    // الأولوية في التفاصيل الموضعية، وقاعدة عدم تغيير النص تعلوها
    assert!(block.contains("أولوية في تفاصيل الإخراج الموضعية"));
    assert!(block.contains("لا تسمح بتغيير الكلمات أو المعنى"));
    assert!(block.contains("قاعدة عدم تغيير النص تُحترم أولًا"));
    assert!(block.contains("ليست لطلب كتابة نص جديد"));
}

#[test]
fn format_message_orders_stable_then_variable_then_text() {
    // ترتيب v4.1: تعليمات الصيغة الثابتة قبل التوجيهات، فرقم المحاولة، فالنص أخيرًا
    let directives = directives_block(Some("اجعل الجملة الأخيرة في سطر مستقل."));
    let variation = variation_note(2, "مقال");
    let msg = build_format_message(
        "مقال", "تنسيق قراءة", "قواعد تجريبية", &directives, &variation, "النص الخام هنا",
    );
    let json_pos = msg.find("أعد الناتج بصيغة JSON").unwrap();
    let rhythm_pos = msg.find("بصمة الإيقاع").unwrap();
    let dir_pos = msg.find("توجيهات خاصة من الكاتب").unwrap();
    let var_pos = msg.find("رقم المحاولة").unwrap();
    let text_pos = msg.find("النص الخام:\n").unwrap();
    assert!(json_pos < rhythm_pos && rhythm_pos < dir_pos, "تعليمات الصيغة ليست قبل التوجيهات");
    assert!(dir_pos < var_pos, "التوجيهات ليست قبل رقم المحاولة");
    assert!(var_pos < text_pos, "رقم المحاولة ليس قبل النص");
    assert!(msg.ends_with("النص الخام هنا"), "النص ليس آخر الرسالة");
}

#[test]
fn format_message_prefix_identical_across_attempts_for_caching() {
    // شرط الخصم الضمني عند المزود: البادئة حتى رقم المحاولة متطابقة بايتًا
    // بين الضغطات المتكررة على النص نفسه — المتغير الوحيد قبل النص هو المحاولة
    let m1 = build_format_message("مقال", "تنسيق قراءة", "قواعد", "", &variation_note(1, "مقال"), "نص");
    let m2 = build_format_message("مقال", "تنسيق قراءة", "قواعد", "", &variation_note(2, "مقال"), "نص");
    let cut1 = m1.find("رقم المحاولة").unwrap();
    let cut2 = m2.find("رقم المحاولة").unwrap();
    assert_eq!(m1[..cut1], m2[..cut2]);
    assert!(cut1 > 0);
}

#[test]
fn variation_message_orders_stable_then_variable_then_text() {
    let directives = directives_block(Some("احفظ علامات الحوار."));
    let msg = build_variation_message(
        "شذرة", "تنسيق منصة", "قواعد", variation_slot_lever(0), &directives, 4, "نص التنويعة",
    );
    let lock_pos = msg.find("قفل مطلق").unwrap();
    let lever_pos = msg.find("رافعة هذه التنويعة").unwrap();
    let json_pos = msg.find("أعد الناتج بصيغة JSON").unwrap();
    let dir_pos = msg.find("توجيهات خاصة من الكاتب").unwrap();
    let batch_pos = msg.find("دفعة التوليد رقم").unwrap();
    let text_pos = msg.find("النص الخام:\n").unwrap();
    assert!(lock_pos < lever_pos && lever_pos < json_pos, "الرافعة والقفل ليسا في الجزء الثابت");
    assert!(json_pos < dir_pos && dir_pos < batch_pos && batch_pos < text_pos);
    assert!(msg.ends_with("نص التنويعة"));
}

#[test]
fn adjust_message_orders_stable_then_variable_then_texts() {
    let directives = directives_block(Some("لا تلمس الفقرة الأولى."));
    let msg = build_adjust_message(
        "مقال", "تنسيق قراءة", "قواعد", "المطلوب: أسطر أقل — تجربة.", "", "",
        &directives, 3, "الأصل", "الحالية",
    );
    let json_pos = msg.find("أعد الناتج بصيغة JSON").unwrap();
    let dir_pos = msg.find("توجيهات خاصة من الكاتب").unwrap();
    let attempt_pos = msg.find("رقم المحاولة: 3.").unwrap();
    let orig_pos = msg.find("النص الأصلي (مرجع):").unwrap();
    let cur_pos = msg.find("النتيجة الحالية (عدّل كثافة أسطرها):").unwrap();
    assert!(json_pos < dir_pos && dir_pos < attempt_pos);
    assert!(attempt_pos < orig_pos && orig_pos < cur_pos, "النصان ليسا آخر الرسالة");
    assert!(msg.ends_with("الحالية"));
}

#[test]
fn messages_preserve_all_contract_sentences_verbatim() {
    // إعادة الترتيب لا تُسقط جملة: كل مكونات الرسالة القديمة حاضرة حرفيًا
    let directives = directives_block(Some("توجيه."));
    let msg = build_format_message(
        "مقال", "تنسيق قراءة", "قواعد", &directives, &variation_note(2, "مقال"), "نص",
    );
    for piece in [
        "نمط التنسيق: مقال",
        "مستوى التدخل: تنسيق قراءة",
        CONTRACT,
        LAYOUT_RULES,
        "ملاحظة قصيرة عن التنسيق إن لزم",
        "rhythmProfile",
        "حافظ على الأسطر الجديدة داخل formattedText كما هي باستخدام \\n.",
        "يختلف عن المحاولات السابقة",
    ] {
        assert!(msg.contains(piece), "جملة مفقودة من الرسالة: {piece}");
    }
}

#[test]
fn parse_format_result_extracts_rhythm_profile_when_present() {
    let content = r#"{"formattedText": "نص", "notes": [], "interventionLevel": "تنسيق إيقاعي", "rhythmProfile": "متدفّق: جُمل ممتدّة تنساب دون توقّف."}"#;
    let result = parse_format_result(content, LEVEL_RHYTHM).unwrap();
    assert_eq!(result.rhythm_profile, Some("متدفّق: جُمل ممتدّة تنساب دون توقّف.".to_string()));
}

#[test]
fn parse_format_result_rhythm_profile_none_when_absent_or_empty() {
    let absent = r#"{"formattedText": "نص", "notes": [], "interventionLevel": "تجهيز للنشر"}"#;
    assert_eq!(parse_format_result(absent, LEVEL_PUBLISH).unwrap().rhythm_profile, None);

    let empty = r#"{"formattedText": "نص", "notes": [], "interventionLevel": "تنسيق إيقاعي", "rhythmProfile": "   "}"#;
    assert_eq!(parse_format_result(empty, LEVEL_RHYTHM).unwrap().rhythm_profile, None);

    // نص عادي بلا أقواس (مسار الاحتياط): لا بصمة أيضًا
    let plain = parse_format_result("نص بلا JSON", LEVEL_RHYTHM).unwrap();
    assert_eq!(plain.rhythm_profile, None);
}

#[test]
fn fragment_style_gets_fragment_rules_and_overrides_platform() {
    // شذرة + منصة: قواعد المنصة الخاصة بالشذرة + القواعد الأساس
    let rules = compose_rules(STYLE_FRAGMENT, LEVEL_PLATFORM, Some("إكس"));
    assert!(rules.contains("نسيبة التغريدة"));
    assert!(rules.contains("قواعد الشذرة"));
    assert!(!rules.contains("مقاطع مرقّمة (1/ 2/ …)"));

    // شذرة بلا منصة: القواعد الأساس حاضرة دون قواعد منصة
    let rules = compose_rules(STYLE_FRAGMENT, LEVEL_RHYTHM, None);
    assert!(rules.contains("قواعد الشذرة"));
    assert!(!rules.contains("المنصة:"));

    // نمط غير الشذرة: لا قواعد شذرة، والمنصة تُتجاهل خارج مستوى «تنسيق منصة»
    let rules = compose_rules("مقال", "تنسيق قراءة", Some("إكس"));
    assert!(!rules.contains("قواعد الشذرة"));
    assert!(!rules.contains("المنصة:"));
}

#[test]
fn variation_note_kicks_in_from_second_attempt() {
    let first = variation_note(1, "مقال");
    assert!(first.contains("رقم المحاولة"));
    assert!(!first.contains("يختلف عن المحاولات السابقة"));

    let second = variation_note(2, "مقال");
    assert!(second.contains("يختلف عن المحاولات السابقة"));
    assert!(!second.contains("استثناء"));

    // استثناء الشذرة المُحكَمة يظهر للشذرة وحدها
    let fragment = variation_note(3, STYLE_FRAGMENT);
    assert!(fragment.contains("استثناء"));
}

#[test]
fn rhythm_dotted_anchors_on_punctuation_and_spares_decimal_points() {
    let rules = intervention_rules(LEVEL_RHYTHM_DOTTED);
    assert!(rules.contains("3.14"), "استثناء النقطة العشرية غائب");
    assert!(rules.contains("وقفة إيقاعية فعلية"));
    assert!(rules.contains("لا كل علامة آليًا"));
    // يختلف عن «تنسيق إيقاعي» الحر — الارتكاز على الترقيم جوهر الفارق
    assert_ne!(rules, intervention_rules(LEVEL_RHYTHM));
    assert!(rules.contains("لا تغيّر الكلمات ولا المعنى"));
}

