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

// OpenAI المباشر يسلك المسار السحابي نفسه (provider "cloud") ويُعرف بمضيف
// Base URL كما يُعرف Gemini وOpenRouter. نموذجه الافتراضي لحقل نموذج فارغ فقط:
// gpt-5.6-terra — «يوازن بين الذكاء والتكلفة» في صفحة نماذج OpenAI الرسمية
pub(crate) const OPENAI_API_HOST: &str = "api.openai.com";
pub(crate) const OPENAI_DEFAULT_MODEL: &str = "gpt-5.6-terra";

// Claude عبر واجهة Messages الأصلية لـ Anthropic (لا طبقة توافق OpenAI)
pub(crate) const ANTHROPIC_DEFAULT_BASE_URL: &str = "https://api.anthropic.com";
pub(crate) const ANTHROPIC_DEFAULT_MODEL: &str = "claude-opus-5";

// قيمتا provider ذواتا المعنى للنقل، ولكلٍّ فرعه المستقل: أي شيء آخر (فارغ أو
// "cloud" أو غيره) يعني المسار السحابي القديم (OpenAI-compatible) بلا أي تغيير
// في سلوكه
pub(crate) const PROVIDER_OLLAMA: &str = "ollama";
pub(crate) const PROVIDER_ANTHROPIC: &str = "anthropic";

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
    fill_empty_defaults(&mut settings);
    Ok(settings)
}

/// يملأ الحقل الفارغ بقيمة مزوّده: Claude بقيمه، وOpenAI (بمضيف Base URL)
/// بنموذجه، وما عداهما بقيم Gemini كما كان — فلا يسقط إعداد Claude أو OpenAI
/// إلى قيم Gemini بصمت
fn fill_empty_defaults(settings: &mut Settings) {
    let anthropic = settings.provider.trim() == PROVIDER_ANTHROPIC;
    if settings.base_url.trim().is_empty() {
        settings.base_url =
            if anthropic { ANTHROPIC_DEFAULT_BASE_URL } else { DEFAULT_BASE_URL }.to_string();
    }
    if settings.model.trim().is_empty() {
        settings.model = if anthropic {
            ANTHROPIC_DEFAULT_MODEL
        } else if settings.base_url.to_lowercase().contains(OPENAI_API_HOST) {
            OPENAI_DEFAULT_MODEL
        } else {
            DEFAULT_MODEL
        }
        .to_string();
    }
}

#[tauri::command]
pub(crate) fn load_settings(app: tauri::AppHandle) -> Result<Settings, String> {
    read_settings(&app)
}

#[tauri::command]
pub(crate) fn save_settings(app: tauri::AppHandle, settings: Settings) -> Result<(), String> {
    let mut settings = settings;
    fill_empty_defaults(&mut settings);
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

#[cfg(test)]
mod tests {
    use super::*;

    fn with(provider: &str, base_url: &str, model: &str) -> Settings {
        let mut s = Settings {
            api_key: "k".to_string(),
            base_url: base_url.to_string(),
            model: model.to_string(),
            provider: provider.to_string(),
        };
        fill_empty_defaults(&mut s);
        s
    }

    #[test]
    fn empty_fields_never_fall_back_to_gemini_for_claude_or_openai() {
        let claude = with(PROVIDER_ANTHROPIC, "", "  ");
        assert_eq!(claude.base_url, "https://api.anthropic.com");
        assert_eq!(claude.model, "claude-opus-5");
        let openai = with("cloud", "https://api.openai.com/v1", "");
        assert_eq!(openai.base_url, "https://api.openai.com/v1");
        assert_eq!(openai.model, OPENAI_DEFAULT_MODEL);
        // المسار السحابي بلا عنوان يبقى على Gemini كما كان قبل هذا التعديل
        let legacy = with("", "", "");
        assert_eq!(legacy.base_url, DEFAULT_BASE_URL);
        assert_eq!(legacy.model, DEFAULT_MODEL);
        let groq = with("cloud", "https://api.groq.com/openai/v1", "");
        assert_eq!(groq.model, DEFAULT_MODEL);
    }

    #[test]
    fn filled_fields_are_kept_as_saved() {
        let s = with(PROVIDER_ANTHROPIC, "https://proxy.example/anthropic", "claude-sonnet-5");
        assert_eq!(s.base_url, "https://proxy.example/anthropic");
        assert_eq!(s.model, "claude-sonnet-5");
    }
}
