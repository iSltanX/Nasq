// المسودات: تخزين محلي بالكامل في drafts.json بجوار الإعدادات، ونسخة
// احتياطية إلى التنزيلات. جزء من الأساس المشترك: يخزّن Value خامًا ولا
// يعرف بنية المسودة — النموذج الهرمي في drafts-model.js عند الواجهة.
// (نُقل من main.rs حرفيًا في تحصين v4.1)
use serde_json::{json, Value};
use std::fs;
use tauri::Manager;

use super::settings::data_file_path;

#[tauri::command]
pub(crate) fn load_drafts(app: tauri::AppHandle) -> Result<Value, String> {
    let path = data_file_path(&app, "drafts.json")?;
    if !path.exists() {
        return Ok(json!([]));
    }
    let raw = fs::read_to_string(&path).map_err(|_| "تعذّرت قراءة المسودات.".to_string())?;
    // ملف تالف لا يعطّل اللوحة — تُعرض قائمة فارغة وتُستبدل عند أول حفظ
    Ok(serde_json::from_str(&raw).unwrap_or_else(|_| json!([])))
}

#[tauri::command]
pub(crate) fn save_drafts(app: tauri::AppHandle, drafts: Value) -> Result<(), String> {
    let path = data_file_path(&app, "drafts.json")?;
    let raw = serde_json::to_string_pretty(&drafts)
        .map_err(|_| "تعذّر تجهيز المسودات للحفظ.".to_string())?;
    fs::write(&path, raw).map_err(|_| "تعذّر حفظ المسودات محليًا.".to_string())?;
    // نصوص المستخدم الخاصة — قراءة وكتابة لصاحب الجهاز فقط
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

// نسخة احتياطية من المسودات إلى مجلد التنزيلات — نسخ الملف كما هو حرفيًا،
// فالنسخة صالحة للاستيراد لاحقًا ولا تمس الأصل. اسم الملف يُبنى في الواجهة
// (بتاريخ ووقت)، والتعقيم هنا دفاعي من فواصل المسارات فقط
#[tauri::command]
pub(crate) fn export_drafts(app: tauri::AppHandle, file_name: String) -> Result<String, String> {
    let src = data_file_path(&app, "drafts.json")?;
    if !src.exists() {
        return Err("لا توجد مسودات محفوظة للنسخ الاحتياطي بعد.".to_string());
    }
    let safe: String = file_name
        .chars()
        .map(|c| if c == '/' || c == '\\' || c == ':' { '-' } else { c })
        .collect();
    let safe = safe.trim();
    let safe = if safe.is_empty() || safe == "." || safe == ".." {
        "nasaq-drafts-backup.json"
    } else {
        safe
    };
    let dir = app
        .path()
        .download_dir()
        .map_err(|_| "تعذّر الوصول إلى مجلد التنزيلات.".to_string())?;
    let dest = dir.join(safe);
    fs::copy(&src, &dest).map_err(|_| "تعذّر كتابة النسخة الاحتياطية.".to_string())?;
    Ok(safe.to_string())
}
