// نَسَق — تطبيق عربي يرتّب النصوص ويجهّزها للنشر مع الحفاظ على النص كما كتبه صاحبه
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// قاعدة الاعتمادية الحاكمة (تحصين v4.1، تمهيدًا لوضع «شَذْب» المستقبلي):
// - shared لا يعرف عقدًا ولا prompt — نقل وتخزين خام فقط.
// - nasaq (وshadhb حين يُبنى) يستوردان من shared حصرًا — لا استيراد متبادل
//   بين البرجين أبدًا، ولا ثابت نصي مشترك بينهما ولو تطابق حرفيًا.
// - كل ما يغيّر سلوك النموذج في وضعٍ ما يعيش داخل وحدة وضعه وحده.
mod nasaq;
mod shadhb;
// أداة تسجيل تجربة شَذْب — مؤقتة، خلف مفتاح الواجهة، ومعزولة عن الأبراج
// الثلاثة كليًا (انظر رأس الملف). تُزال بحذف mod هذا وسطري invoke_handler
// أدناه وshadhb_trial_log.rs نفسه.
mod shadhb_trial_log;
mod shared;

fn main() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            shared::settings::load_settings,
            shared::settings::save_settings,
            shared::drafts::load_drafts,
            shared::drafts::save_drafts,
            shared::drafts::export_drafts,
            shared::clipboard::copy_to_clipboard,
            nasaq::commands::format_text,
            nasaq::commands::generate_variation,
            nasaq::commands::adjust_lines,
            shadhb::commands::prune_text,
            shadhb_trial_log::save_shadhb_trial,
            shadhb_trial_log::renew_shadhb_trial_log
        ])
        .run(tauri::generate_context!())
        .expect("فشل تشغيل نَسَق");
}
