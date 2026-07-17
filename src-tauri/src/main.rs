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
        // نظام التحديثات (المرحلة 1): plugin-process فقط مسجَّل — لا سلوك
        // إضافي حتى يُستدعى أمره صراحةً من الواجهة (المرحلة 3). تسجيل
        // updater مؤجَّل عمدًا إلى المرحلة 4: تحقّق فعلي أثبت أن تسجيله
        // يفشل عند الإقلاع بلا plugins.updater.pubkey صالح في
        // tauri.conf.json (حقل إلزامي في الإعداد، لا قيمة افتراضية) —
        // فتسجيله الآن قبل وجود مفتاح حقيقي يُسقط التطبيق كاملًا عند فتحه.
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            shared::settings::load_settings,
            shared::settings::save_settings,
            shared::drafts::load_drafts,
            shared::drafts::save_drafts,
            shared::drafts::export_drafts,
            shared::clipboard::copy_to_clipboard,
            shared::dock_icon::set_dock_icon,
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
