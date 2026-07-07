// الحافظة عبر pbcopy — جزء من الأساس المشترك.
// (نُقل من main.rs حرفيًا في تحصين v4.1)
use std::io::Write;

#[tauri::command]
pub(crate) fn copy_to_clipboard(text: String) -> Result<(), String> {
    // بدون LANG (كما يحدث عند التشغيل من Finder) يفسّر pbcopy المدخلات
    // بترميز MacRoman فيتخرّب النص العربي — نفرض UTF-8 صراحة
    let mut child = std::process::Command::new("pbcopy")
        .env("LANG", "en_US.UTF-8")
        .env("LC_ALL", "en_US.UTF-8")
        .stdin(std::process::Stdio::piped())
        .spawn()
        .map_err(|_| "تعذّر الوصول إلى الحافظة.".to_string())?;
    child
        .stdin
        .as_mut()
        .ok_or_else(|| "تعذّر الوصول إلى الحافظة.".to_string())?
        .write_all(text.as_bytes())
        .map_err(|_| "تعذّر النسخ إلى الحافظة.".to_string())?;
    child
        .wait()
        .map_err(|_| "تعذّر النسخ إلى الحافظة.".to_string())?;
    Ok(())
}
