// نَسَق — تطبيق عربي يرتّب النصوص ويجهّزها للنشر مع الحفاظ على النص كما كتبه صاحبه
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// قاعدة الاعتمادية الحاكمة (تحصين v4.1، تمهيدًا لوضع «شَذْب» المستقبلي):
// - shared لا يعرف عقدًا ولا prompt — نقل وتخزين خام فقط.
// - nasaq (وshadhb حين يُبنى) يستوردان من shared حصرًا — لا استيراد متبادل
//   بين البرجين أبدًا، ولا ثابت نصي مشترك بينهما ولو تطابق حرفيًا.
// - كل ما يغيّر سلوك النموذج في وضعٍ ما يعيش داخل وحدة وضعه وحده.
// قشرة التطبيق: النوافذ وإطارها الأصلي — لا تعرف برجًا ولا عقدًا
mod app;
mod nasaq;
mod shadhb;
mod shared;

fn main() {
    app::window::mark_launch();
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
        // النافذة الرئيسية تُنشأ هنا لا في tauri.conf: مخفية بلون مظهر النظام
        // حتى تعلن الواجهة اكتمال أول رسم
        .setup(|app| {
            crate::app::window::create_main_window(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            app::window::main_window_ready,
            shared::settings::load_settings,
            shared::settings::save_settings,
            shared::llm::test_ollama_connection,
            shared::drafts::load_drafts,
            shared::drafts::save_drafts,
            shared::drafts::export_drafts,
            shared::clipboard::copy_to_clipboard,
            nasaq::commands::format_text,
            nasaq::commands::generate_variation,
            nasaq::commands::adjust_lines,
            shadhb::commands::prune_text
        ])
        .run(tauri::generate_context!())
        .expect("فشل تشغيل نَسَق");
}
