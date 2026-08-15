// إعدادات الخدمة: تخزين محلي في settings.json — المفتاح والمزود والنموذج.
// جزء من الأساس المشترك: لا يعرف عقدًا ولا وضعًا. (نُقل من main.rs حرفيًا
// في تحصين v4.1)
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

pub(crate) const DEFAULT_BASE_URL: &str =
    "https://generativelanguage.googleapis.com/v1beta/openai/";
pub(crate) const DEFAULT_MODEL: &str = "gemini-2.5-flash";

// قيمة provider الوحيدة ذات المعنى للنقل: أي شيء آخر (فارغ أو "cloud" أو غيره)
// يعني المسار السحابي القديم (OpenAI-compatible) بلا أي تغيير في سلوكه
pub(crate) const PROVIDER_OLLAMA: &str = "ollama";

#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Settings {
    #[serde(default)]
    pub(crate) api_key: String,
    #[serde(default)]
    pub(crate) base_url: String,
    #[serde(default)]
    pub(crate) model: String,
    #[serde(default)]
    pub(crate) provider: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            api_key: String::new(),
            base_url: DEFAULT_BASE_URL.to_string(),
            model: DEFAULT_MODEL.to_string(),
            provider: String::new(),
        }
    }
}

/// مجلد بيانات التطبيق — تستخدمه الإعدادات والمسودات معًا
pub(crate) fn data_file_path(app: &tauri::AppHandle, name: &str) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|_| "تعذّر الوصول إلى مجلد بيانات التطبيق.".to_string())?;
    fs::create_dir_all(&dir).map_err(|_| "تعذّر إنشاء مجلد بيانات التطبيق.".to_string())?;
    Ok(dir.join(name))
}

fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    data_file_path(app, "settings.json")
}

pub(crate) fn read_settings(app: &tauri::AppHandle) -> Result<Settings, String> {
    let path = settings_path(app)?;
    if !path.exists() {
        return Ok(Settings::default());
    }
    let raw = fs::read_to_string(&path).map_err(|_| "تعذّرت قراءة ملف الإعدادات.".to_string())?;
    let mut settings: Settings =
        serde_json::from_str(&raw).map_err(|_| "ملف الإعدادات تالف — افتح الإعدادات واحفظها من جديد.".to_string())?;
    if settings.base_url.trim().is_empty() {
        settings.base_url = DEFAULT_BASE_URL.to_string();
    }
    if settings.model.trim().is_empty() {
        settings.model = DEFAULT_MODEL.to_string();
    }
    Ok(settings)
}

#[tauri::command]
pub(crate) fn load_settings(app: tauri::AppHandle) -> Result<Settings, String> {
    read_settings(&app)
}

#[tauri::command]
pub(crate) fn save_settings(app: tauri::AppHandle, settings: Settings) -> Result<(), String> {
    let mut settings = settings;
    if settings.base_url.trim().is_empty() {
        settings.base_url = DEFAULT_BASE_URL.to_string();
    }
    if settings.model.trim().is_empty() {
        settings.model = DEFAULT_MODEL.to_string();
    }
    let path = settings_path(&app)?;
    let raw = serde_json::to_string_pretty(&settings)
        .map_err(|_| "تعذّر تجهيز الإعدادات للحفظ.".to_string())?;
    fs::write(&path, raw).map_err(|_| "تعذّر حفظ الإعدادات محليًا.".to_string())?;
    // الملف يحوي مفتاح API — قراءة وكتابة لصاحب الجهاز فقط
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(&path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}
