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
        // نظام التحديث التلقائي (v8.2.0): المحدّث مُسجَّل الآن بعد اكتمال
        // plugins.updater.pubkey والنقطة في tauri.conf.json. process لازمٌ
        // لإعادة التشغيل الآمنة بعد التثبيت (plugin:process|restart)،
        // والواجهة تقود الحالات عبر أوامر plugin:updater الرسمية حصرًا —
        // لا مُنزِّل مخصّص ولا تنفيذ يدويّ للملفات ولا إضعاف للتحقّق.
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // فتح الروابط الخارجية في المتصفح الافتراضي (رابط «صفحة المشروع»)
        // عبر أمر plugin:opener|open_url — الصلاحية مقيّدة بنطاق github.com
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            shared::settings::load_settings,
            shared::settings::save_settings,
            shared::llm::test_ollama_connection,
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
