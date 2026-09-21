// إعدادات الخدمة: تخزين محلي في settings.json — المفتاح والمزود والنموذج.
// جزء من الأساس المشترك: لا يعرف عقدًا ولا وضعًا. (نُقل من main.rs حرفيًا
// في تحصين v4.1)
use serde::{Deserialize, Serialize};
use std::fs;
use std::sync::Mutex;
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager};

use super::secrets::{Keychain, SecretStore, ACCOUNT_API_KEY};
use super::storage::{set_aside, write_private};

pub(crate) const DEFAULT_BASE_URL: &str =
    "https://generativelanguage.googleapis.com/v1beta/openai/";
// فحص m7-07: gemini-2.5-flash يرفضه المزوّد للمستخدمين الجدد («no longer available to new
// users»)، فكان أول تنسيقٍ بالإعداد الافتراضي يفشل. gemini-3.5-flash جرّبه المالك في التطبيق فولّد
pub(crate) const DEFAULT_MODEL: &str = "gemini-3.5-flash";

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
    /// «تلقائي» يتبع النظام، و«فاتح»/«داكن» يفرضان مخططًا — لوحة الإعدادات
    #[serde(default = "default_appearance")]
    pub(crate) appearance: String,
    /// التحقق من التحديثات تلقائيًا — تقرأه المرحلة ٦ حين يُبنى تدفّقها
    #[serde(default = "default_true")]
    pub(crate) auto_updates: bool,
    /// آخر تحقق ناجح بالثواني منذ ١٩٧٠، وصفرٌ يعني «لم يحدث بعد»
    #[serde(default)]
    pub(crate) last_update_check: i64,
    /// المفتاح محفوظ لكن تعذّرت قراءته الآن — يميّز «لا مفتاح» عن «لم أصل
    /// إليه»، فلا يرى صاحب مفتاحٍ قائمٍ رسالةَ من لا مفتاح له. لا يُكتب في
    /// الملف ولا يُرسل إلى الواجهة إلا حين يكون صحيحًا
    #[serde(default, skip_serializing_if = "is_false")]
    pub(crate) key_unavailable: bool,
}

fn is_false(value: &bool) -> bool {
    !*value
}

fn default_appearance() -> String {
    APPEARANCE_AUTO.to_string()
}

fn default_true() -> bool {
    true
}

pub(crate) const APPEARANCE_AUTO: &str = "auto";
const APPEARANCES: [&str; 3] = [APPEARANCE_AUTO, "light", "dark"];

impl Default for Settings {
    fn default() -> Self {
        Settings {
            api_key: String::new(),
            base_url: DEFAULT_BASE_URL.to_string(),
            model: DEFAULT_MODEL.to_string(),
            provider: String::new(),
            appearance: default_appearance(),
            auto_updates: true,
            last_update_check: 0,
            key_unavailable: false,
        }
    }
}

/// ما تراه الواجهة: **لا يعبر المفتاح الجسر إطلاقًا**. يكفيها أن تعرف أنه
/// محفوظ لتعرض حقلًا مقنّعًا، وأن تعرف حين يتعذّر الوصول إليه لتقول السبب
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SettingsView {
    pub(crate) base_url: String,
    pub(crate) model: String,
    pub(crate) provider: String,
    pub(crate) appearance: String,
    pub(crate) auto_updates: bool,
    pub(crate) last_update_check: i64,
    pub(crate) has_api_key: bool,
    pub(crate) key_unavailable: bool,
}

impl From<&Settings> for SettingsView {
    fn from(settings: &Settings) -> Self {
        SettingsView {
            base_url: settings.base_url.clone(),
            model: settings.model.clone(),
            provider: settings.provider.clone(),
            appearance: settings.appearance.clone(),
            auto_updates: settings.auto_updates,
            last_update_check: settings.last_update_check,
            has_api_key: !settings.api_key.trim().is_empty(),
            key_unavailable: settings.key_unavailable,
        }
    }
}

/// ما ترسله الواجهة: الحقل الغائب لم يتغيّر، فالتطبيق الفوري يرسل ما مسّه
/// المستخدم وحده. و`apiKey` فارغةً تعني المحو صراحةً لا سهوًا
#[derive(Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SettingsPatch {
    pub(crate) base_url: Option<String>,
    pub(crate) model: Option<String>,
    pub(crate) provider: Option<String>,
    pub(crate) appearance: Option<String>,
    pub(crate) auto_updates: Option<bool>,
    pub(crate) last_update_check: Option<i64>,
    pub(crate) api_key: Option<String>,
}

/// الحفظ دورةُ قراءة-تعديل-كتابة، وأوامر تاوري تُنفَّذ على مجمّع خيوط —
/// فحفظان متسارعان (حقلان يتغيّران بسرعة) يقرآن النسخة نفسها ويمحو آخرهما
/// تعديل الأول. قفل واحد يجعل الدورة ذرّية
static SETTINGS_LOCK: Mutex<()> = Mutex::new(());

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

fn read_settings_file(path: &Path) -> Result<Settings, String> {
    if !path.exists() {
        return Ok(Settings::default());
    }
    let raw = fs::read_to_string(path).map_err(|_| "تعذّرت قراءة ملف الإعدادات.".to_string())?;
    serde_json::from_str(&raw)
        .map_err(|_| "ملف الإعدادات تالف — افتح الإعدادات واحفظها من جديد.".to_string())
}

/// الملف قد يحوي مفتاح API في مسار التراجع — لصاحب الجهاز وحده، ولا يكون ناقصًا
/// على القرص في أي لحظة
fn write_settings_file(path: &Path, settings: &Settings) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(settings)
        .map_err(|_| "تعذّر تجهيز الإعدادات للحفظ.".to_string())?;
    write_private(path, raw.as_bytes()).map_err(|_| "تعذّر حفظ الإعدادات محليًا.".to_string())
}

/// يُفرَّغ حقل المفتاح بعد ترحيله، على **أحدث** نسخة من الملف لا على اللقطة
/// التي بدأت بها القراءة: نافذة أخرى قد تكون حفظت بينهما، فلا تُعاد قيمها
/// القديمة فوق حفظها. وإن لم يعد المفتاح في الملف هو نفسه فلا شأن لنا به.
/// وفشل الكتابة لا يُفقد شيئًا: المفتاح حينها في الموضعين
fn blank_key_in_file(path: &Path, expected_key: &str) {
    let Ok(mut fresh) = read_settings_file(path) else {
        return;
    };
    if fresh.api_key.trim() != expected_key {
        return;
    }
    fresh.api_key = String::new();
    let _ = write_settings_file(path, &fresh);
}

pub(crate) fn read_settings(app: &tauri::AppHandle) -> Result<Settings, String> {
    let path = settings_path(app)?;
    // القراءة قد تكتب (ترحيل المفتاح عند أول مرة)، فتدخل القفل نفسه
    let _guard = SETTINGS_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    read_settings_with(&Keychain, &path)
}

/// الإعدادات من الملف، والمفتاح من الخزنة. مفتاحٌ قديم باقٍ في الملف يُرحَّل
/// عند أول قراءة، ولا يُمحى من الملف إلا بعد قراءة تحقّق تثبت وصوله سالمًا،
/// فلا تخسره كتابةٌ نصفُ ناجحة.
fn read_settings_with(store: &dyn SecretStore, path: &Path) -> Result<Settings, String> {
    let mut settings = read_settings_file(path)?;
    fill_empty_defaults(&mut settings);

    let file_key = settings.api_key.trim().to_string();
    if !file_key.is_empty() {
        let migrated = store.set(ACCOUNT_API_KEY, &file_key).is_ok()
            && matches!(store.get(ACCOUNT_API_KEY), Ok(Some(ref stored)) if *stored == file_key);
        if migrated {
            blank_key_in_file(path, &file_key);
        }
        settings.api_key = file_key;
        return Ok(settings);
    }

    // بعد الترحيل تصير الخزنة مصدر المفتاح الوحيد، فتعذُّر قراءتها ليس غيابًا:
    // يبقى الحقل فارغًا (ولا يُبنى عليه حذف)، ويُرفع العلم حتى تنطق الرسالة
    // بالسبب الصحيح بدل «لا يوجد مفتاح»
    match store.get(ACCOUNT_API_KEY) {
        Ok(Some(stored)) => settings.api_key = stored,
        Ok(None) => {}
        Err(_) => settings.key_unavailable = true,
    }
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
pub(crate) fn load_settings(app: tauri::AppHandle) -> Result<SettingsView, String> {
    Ok(SettingsView::from(&read_settings(&app)?))
}

/// الدورة كاملة تحت القفل: تُقرأ الحالة، وتُدمج الرقعة، وتُكتب — فلا يمحو
/// حفظٌ متسارعٌ تعديلَ سابقه
fn save_patch_with(
    store: &dyn SecretStore,
    path: &Path,
    patch: SettingsPatch,
) -> Result<Settings, String> {
    let _guard = SETTINGS_LOCK.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let current = match read_settings_with(store, path) {
        Ok(settings) => settings,
        // ملفٌّ تالف أو لا يُقرأ لا يمنع الحفظ الذي تطلبه رسالته («احفظها من
        // جديد»): يُنحّى جانبًا فلا يُمحى، ويبدأ الحفظ من القيم الافتراضية،
        // والمفتاح في الخزنة لا يمسّه شيء (فحص m2)
        Err(_) => {
            set_aside(path).map_err(|_| "تعذّر حفظ الإعدادات محليًا.".to_string())?;
            read_settings_with(store, path)?
        }
    };
    save_settings_with(store, path, apply_patch(current, patch))
}

/// دمج ما أرسلته الواجهة على المحفوظ: الغائب لم يتغيّر
fn apply_patch(mut settings: Settings, patch: SettingsPatch) -> Settings {
    if let Some(value) = patch.base_url {
        settings.base_url = value;
    }
    if let Some(value) = patch.model {
        settings.model = value;
    }
    if let Some(value) = patch.provider {
        settings.provider = value;
    }
    if let Some(value) = patch.appearance {
        // قيمة لا يعرفها المظهر تعود إلى «تلقائي» بدل أن تُحفظ كما وردت
        let value = value.trim();
        settings.appearance = if APPEARANCES.contains(&value) {
            value.to_string()
        } else {
            APPEARANCE_AUTO.to_string()
        };
    }
    if let Some(value) = patch.auto_updates {
        settings.auto_updates = value;
    }
    if let Some(value) = patch.last_update_check {
        settings.last_update_check = value;
    }
    if let Some(value) = patch.api_key {
        settings.api_key = value;
    }
    settings
}

/// التطبيق فوري: تُرسَل الحقول الممسوسة وحدها، ويعود ما استقرّ فعلًا بعد
/// أن تملأ النواة الفارغ بقيم مزوّده
#[tauri::command]
pub(crate) fn save_settings(
    app: tauri::AppHandle,
    patch: SettingsPatch,
) -> Result<SettingsView, String> {
    let path = settings_path(&app)?;
    let settled = save_patch_with(&Keychain, &path, patch)?;
    let view = SettingsView::from(&settled);
    // النوافذ المفتوحة تتبع ما تغيّر (المظهر اليوم) بلا أن تسأل
    let _ = app.emit("settings:changed", &view);
    Ok(view)
}

/// المفتاح إلى الخزنة والباقي إلى الملف. ثلاثة مسارات مقصودة:
/// مفتاحٌ يُحفظ في الخزنة فيُفرَّغ حقله في الملف، ومفتاحٌ تعذّر حفظه فيبقى في
/// الملف كما كان قبل هذه المرحلة، وحقلٌ فارغ يعني الحذف — ولا يجري الحذف إلا
/// والخزنة مقروءة، فلا يُترجم عطلٌ عابر إلى محو مفتاح قائم.
fn save_settings_with(
    store: &dyn SecretStore,
    path: &Path,
    settings: Settings,
) -> Result<Settings, String> {
    let mut settings = settings;
    fill_empty_defaults(&mut settings);
    let key = settings.api_key.trim().to_string();
    let mut on_disk = settings.clone();
    on_disk.key_unavailable = false;

    if key.is_empty() {
        // الواجهة تعيد ما قرأته. فإن كان ما قرأته فراغًا سببه تعذُّر الوصول،
        // فحفظُها ليس أمرًا بالمحو — والعلم هنا مانعٌ لا رسالة فقط
        if !settings.key_unavailable && store.get(ACCOUNT_API_KEY).is_ok() {
            let _ = store.delete(ACCOUNT_API_KEY);
        }
        on_disk.api_key = String::new();
    } else if store.set(ACCOUNT_API_KEY, &key).is_ok() {
        on_disk.api_key = String::new();
    } else {
        on_disk.api_key = key;
    }

    write_settings_file(path, &on_disk)?;
    Ok(settings)
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
            ..Settings::default()
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

    use crate::shared::secrets::testing::MemoryStore;

    fn temp_settings(name: &str) -> PathBuf {
        let mut dir = std::env::temp_dir();
        dir.push(format!("nasaq-settings-{}-{}", std::process::id(), name));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir.join("settings.json")
    }

    fn write_raw(path: &Path, api_key: &str) {
        let settings = Settings {
            api_key: api_key.to_string(),
            base_url: DEFAULT_BASE_URL.to_string(),
            model: DEFAULT_MODEL.to_string(),
            provider: String::new(),
            ..Settings::default()
        };
        write_settings_file(path, &settings).unwrap();
    }

    fn key_on_disk(path: &Path) -> String {
        read_settings_file(path).unwrap().api_key
    }

    #[test]
    fn legacy_key_migrates_to_the_store_and_leaves_the_file_blank() {
        let path = temp_settings("migrate");
        write_raw(&path, "sk-legacy");
        let store = MemoryStore::new();

        let loaded = read_settings_with(&store, &path).unwrap();

        assert_eq!(loaded.api_key, "sk-legacy", "الواجهة تفقد المفتاح بعد الترحيل");
        assert_eq!(store.peek(ACCOUNT_API_KEY).as_deref(), Some("sk-legacy"));
        assert_eq!(key_on_disk(&path), "", "المفتاح بقي في الملف بعد ترحيل ناجح");
    }

    #[test]
    fn a_failed_migration_keeps_the_key_in_the_file() {
        let path = temp_settings("migrate-fail");
        write_raw(&path, "sk-legacy");
        let mut store = MemoryStore::new();
        store.fail_set = true;

        let loaded = read_settings_with(&store, &path).unwrap();

        assert_eq!(loaded.api_key, "sk-legacy", "المفتاح ضاع رغم فشل الترحيل");
        assert_eq!(key_on_disk(&path), "sk-legacy", "مُحي من الملف بلا وصول للخزنة");
        assert_eq!(store.peek(ACCOUNT_API_KEY), None);
    }

    #[test]
    fn the_key_comes_from_the_store_when_the_file_has_none() {
        let path = temp_settings("from-store");
        write_raw(&path, "");
        let store = MemoryStore::with(ACCOUNT_API_KEY, "sk-stored");

        let loaded = read_settings_with(&store, &path).unwrap();

        assert_eq!(loaded.api_key, "sk-stored");
        assert_eq!(key_on_disk(&path), "", "الملف لا يستعيد المفتاح أبدًا");
    }

    #[test]
    fn a_missing_file_still_reads_the_stored_key() {
        let path = temp_settings("no-file");
        let store = MemoryStore::with(ACCOUNT_API_KEY, "sk-stored");

        let loaded = read_settings_with(&store, &path).unwrap();

        assert_eq!(loaded.api_key, "sk-stored");
        assert_eq!(loaded.base_url, DEFAULT_BASE_URL);
    }

    #[test]
    fn an_unreadable_store_yields_an_empty_key_without_failing() {
        let path = temp_settings("unreadable");
        write_raw(&path, "");
        let mut store = MemoryStore::with(ACCOUNT_API_KEY, "sk-stored");
        store.fail_get = true;

        let loaded = read_settings_with(&store, &path).unwrap();

        assert_eq!(loaded.api_key, "", "تعذُّر القراءة لا يُنتج مفتاحًا");
        assert!(loaded.key_unavailable, "الفراغ هنا بسبب، ولم يُعلَن السبب");
        assert_eq!(store.peek(ACCOUNT_API_KEY).as_deref(), Some("sk-stored"), "المفتاح مُسّ رغم تعذُّر القراءة");
    }

    #[test]
    fn a_readable_store_never_raises_the_unavailable_flag() {
        let path = temp_settings("flag-clear");
        write_raw(&path, "");
        let store = MemoryStore::with(ACCOUNT_API_KEY, "sk-stored");
        assert!(!read_settings_with(&store, &path).unwrap().key_unavailable);

        // ولا حين تكون الخزنة فارغة فعلًا: ذلك غيابٌ لا تعذُّر
        let empty = MemoryStore::new();
        let loaded = read_settings_with(&empty, &path).unwrap();
        assert_eq!(loaded.api_key, "");
        assert!(!loaded.key_unavailable, "الغياب خُلط بتعذُّر الوصول");
    }

    #[test]
    fn the_unavailable_flag_is_a_moment_not_a_setting() {
        let path = temp_settings("flag-not-saved");
        let store = MemoryStore::new();
        let settings = Settings {
            api_key: "sk-new".to_string(),
            key_unavailable: true,
            ..Settings::default()
        };

        save_settings_with(&store, &path, settings).unwrap();

        let raw = fs::read_to_string(&path).unwrap();
        assert!(!raw.contains("keyUnavailable"), "العلم كُتب في الملف: {raw}");
        assert!(!read_settings_file(&path).unwrap().key_unavailable);
    }

    #[test]
    fn saving_a_key_puts_it_in_the_store_not_in_the_file() {
        let path = temp_settings("save");
        let store = MemoryStore::new();
        let settings = Settings { api_key: "sk-new".to_string(), ..Settings::default() };

        save_settings_with(&store, &path, settings).unwrap();

        assert_eq!(store.peek(ACCOUNT_API_KEY).as_deref(), Some("sk-new"));
        assert_eq!(key_on_disk(&path), "", "المفتاح كُتب في الملف رغم نجاح الخزنة");
    }

    #[test]
    fn a_store_that_refuses_the_write_keeps_the_key_in_the_file() {
        let path = temp_settings("save-fail");
        let mut store = MemoryStore::new();
        store.fail_set = true;
        let settings = Settings { api_key: "sk-new".to_string(), ..Settings::default() };

        save_settings_with(&store, &path, settings).unwrap();

        assert_eq!(key_on_disk(&path), "sk-new", "المفتاح ضاع حين رفضت الخزنة الكتابة");
    }

    #[test]
    fn an_empty_key_deletes_the_stored_one() {
        let path = temp_settings("clear");
        let store = MemoryStore::with(ACCOUNT_API_KEY, "sk-old");
        let settings = Settings { api_key: String::new(), ..Settings::default() };

        save_settings_with(&store, &path, settings).unwrap();

        assert_eq!(store.peek(ACCOUNT_API_KEY), None, "المسح من الواجهة لم يصل الخزنة");
    }

    #[test]
    fn two_saves_at_once_never_lose_a_field() {
        // حقلان يتغيّران معًا من خيطين: بلا قفل يقرأ كلٌّ النسخة نفسها
        // ويمحو آخرُهما تعديلَ الأول
        let path = temp_settings("concurrent");
        write_raw(&path, "");
        let a = path.clone();
        let b = path.clone();

        let one = std::thread::spawn(move || {
            for _ in 0..40 {
                save_patch_with(
                    &MemoryStore::new(),
                    &a,
                    SettingsPatch { base_url: Some("https://one.test".to_string()), ..SettingsPatch::default() },
                )
                .unwrap();
            }
        });
        let two = std::thread::spawn(move || {
            for _ in 0..40 {
                save_patch_with(
                    &MemoryStore::new(),
                    &b,
                    SettingsPatch { model: Some("نموذج-اثنين".to_string()), ..SettingsPatch::default() },
                )
                .unwrap();
            }
        });
        one.join().unwrap();
        two.join().unwrap();

        let settled = read_settings_file(&path).unwrap();
        assert_eq!(settled.base_url, "https://one.test", "ضاع تعديل الخيط الأول");
        assert_eq!(settled.model, "نموذج-اثنين", "ضاع تعديل الخيط الثاني");
    }

    #[test]
    fn the_view_never_carries_the_key_across_the_bridge() {
        let settings = Settings { api_key: "sk-secret".to_string(), ..Settings::default() };
        let json = serde_json::to_string(&SettingsView::from(&settings)).unwrap();

        assert!(!json.contains("sk-secret"), "المفتاح عبر إلى الواجهة: {json}");
        assert!(!json.contains("apiKey"), "حقل المفتاح موجود أصلًا: {json}");
        assert!(json.contains("\"hasApiKey\":true"), "الواجهة لا تعرف أنه محفوظ");

        let empty = Settings::default();
        let json = serde_json::to_string(&SettingsView::from(&empty)).unwrap();
        assert!(json.contains("\"hasApiKey\":false"));
    }

    #[test]
    fn a_field_absent_from_the_patch_changes_nothing() {
        let current = Settings {
            base_url: "https://example.test".to_string(),
            model: "قديم".to_string(),
            provider: PROVIDER_ANTHROPIC.to_string(),
            ..Settings::default()
        };
        let patched = apply_patch(
            current,
            SettingsPatch { model: Some("جديد".to_string()), ..SettingsPatch::default() },
        );

        assert_eq!(patched.model, "جديد");
        assert_eq!(patched.base_url, "https://example.test", "تغيّر حقل لم يُرسل");
        assert_eq!(patched.provider, PROVIDER_ANTHROPIC, "تغيّر حقل لم يُرسل");
    }

    #[test]
    fn an_absent_key_keeps_the_stored_one_and_an_empty_one_clears_it() {
        let path = temp_settings("patch-key");
        let store = MemoryStore::with(ACCOUNT_API_KEY, "sk-live");

        // لا مفتاح في الرقعة: تعديل حقل آخر لا يمسّ المخزون
        let current = read_settings_with(&store, &path).unwrap();
        let patched = apply_patch(current, SettingsPatch { model: Some("m".to_string()), ..SettingsPatch::default() });
        save_settings_with(&store, &path, patched).unwrap();
        assert_eq!(store.peek(ACCOUNT_API_KEY).as_deref(), Some("sk-live"), "ضاع المفتاح بحفظ حقل آخر");

        // مفتاح فارغ صراحةً: محوٌ مقصود
        let current = read_settings_with(&store, &path).unwrap();
        let patched = apply_patch(current, SettingsPatch { api_key: Some(String::new()), ..SettingsPatch::default() });
        save_settings_with(&store, &path, patched).unwrap();
        assert_eq!(store.peek(ACCOUNT_API_KEY), None, "المحو الصريح لم يصل");
    }

    #[test]
    fn an_unknown_appearance_falls_back_to_auto() {
        let patched = apply_patch(
            Settings::default(),
            SettingsPatch { appearance: Some("  dark ".to_string()), ..SettingsPatch::default() },
        );
        assert_eq!(patched.appearance, "dark", "لم تُقبل قيمة معروفة بعد التشذيب");

        let patched = apply_patch(
            Settings::default(),
            SettingsPatch { appearance: Some("neon".to_string()), ..SettingsPatch::default() },
        );
        assert_eq!(patched.appearance, APPEARANCE_AUTO, "حُفظت قيمة مظهر لا يعرفها أحد");
    }

    #[test]
    fn a_save_that_echoes_an_unreadable_read_never_deletes() {
        // الواجهة تقرأ فتجد فراغًا وعلمًا مرفوعًا، ثم تحفظ ما قرأته كما هو:
        // هذا ليس أمرًا بمحو مفتاح قائم
        let path = temp_settings("echo-unreadable");
        let store = MemoryStore::with(ACCOUNT_API_KEY, "sk-live");
        let echoed = Settings {
            api_key: String::new(),
            key_unavailable: true,
            ..Settings::default()
        };

        save_settings_with(&store, &path, echoed).unwrap();

        assert_eq!(
            store.peek(ACCOUNT_API_KEY).as_deref(),
            Some("sk-live"),
            "حُذف مفتاح قائم بفراغٍ سببه تعذُّر القراءة"
        );
    }

    #[test]
    fn the_migration_write_never_overwrites_a_newer_save() {
        // نافذة أخرى حفظت نموذجًا جديدًا بين قراءتنا وكتابتنا: الترحيل يفرّغ
        // المفتاح على أحدث نسخة، فلا يعيد قيمنا القديمة فوق حفظها
        let path = temp_settings("migration-race");
        let newer = Settings {
            api_key: "sk-legacy".to_string(),
            model: "نموذج-جديد".to_string(),
            ..Settings::default()
        };
        write_settings_file(&path, &newer).unwrap();

        blank_key_in_file(&path, "sk-legacy");

        let on_disk = read_settings_file(&path).unwrap();
        assert_eq!(on_disk.api_key, "");
        assert_eq!(on_disk.model, "نموذج-جديد", "أُعيدت قيمة قديمة فوق حفظ أحدث");
    }

    #[test]
    fn a_key_that_changed_on_disk_is_left_alone() {
        let path = temp_settings("migration-changed");
        write_raw(&path, "sk-other");

        blank_key_in_file(&path, "sk-legacy");

        assert_eq!(key_on_disk(&path), "sk-other", "مُحي مفتاح ليس هو الذي رُحِّل");
    }

    fn survives_beside(path: &Path, bytes: &[u8]) -> bool {
        fs::read_dir(path.parent().unwrap())
            .unwrap()
            .flatten()
            .any(|entry| fs::read(entry.path()).map(|found| found == bytes).unwrap_or(false))
    }

    #[test]
    fn a_damaged_settings_file_can_be_saved_over_as_its_message_asks() {
        // «ملف الإعدادات تالف — افتح الإعدادات واحفظها من جديد»: الحفظ الذي تطلبه
        // الرسالة يجب أن يمرّ، والتالف يُنحّى ولا يُمحى
        for (name, damaged) in [
            ("cut-json", b"{\n  \"apiKey\": \"\",\n  \"baseUrl\": \"https://api.anthro".to_vec()),
            // البتر وسط الجيم: ١٤ بايتًا قبل «نموذج» وأربعة أحرف منها ونصف حرف
            ("cut-letter", "{\n  \"model\": \"نموذج".as_bytes()[..23].to_vec()),
        ] {
            if name == "cut-letter" {
                assert!(std::str::from_utf8(&damaged).is_err(), "البتر لم يقع وسط حرف");
            }
            let path = temp_settings(name);
            fs::write(&path, &damaged).unwrap();
            let store = MemoryStore::new();
            assert!(read_settings_with(&store, &path).is_err(), "{name}: الملف التالف قُرئ");

            let saved = save_patch_with(
                &store,
                &path,
                SettingsPatch { model: Some("m".to_string()), ..SettingsPatch::default() },
            );

            assert!(saved.is_ok(), "{name}: الحفظ الذي تطلبه الرسالة فشل: {:?}", saved.err());
            assert_eq!(read_settings_file(&path).ok().map(|s| s.model).as_deref(), Some("m"));
            assert!(survives_beside(&path, &damaged), "{name}: مُحي التالف بلا نسخة");
        }
    }

    #[test]
    fn the_settings_file_is_never_incomplete_during_a_save() {
        use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
        use std::sync::Arc;

        let path = temp_settings("never-incomplete");
        // حقلٌ طويل يمدّ زمن الكتابة فيراها القارئ، والطولان متساويان
        let a = Settings { model: "أ".repeat(300_000), ..Settings::default() };
        let b = Settings { model: "ب".repeat(300_000), ..Settings::default() };
        let complete = serde_json::to_string_pretty(&a).unwrap().len();
        write_settings_file(&path, &a).unwrap();

        let done = Arc::new(AtomicBool::new(false));
        let reads = Arc::new(AtomicUsize::new(0));
        let incomplete = Arc::new(AtomicUsize::new(0));
        let reader = {
            let (path, done, reads, incomplete) = (path.clone(), done.clone(), reads.clone(), incomplete.clone());
            std::thread::spawn(move || {
                while !done.load(Ordering::Relaxed) {
                    if let Ok(bytes) = fs::read(&path) {
                        reads.fetch_add(1, Ordering::Relaxed);
                        if bytes.len() != complete {
                            incomplete.fetch_add(1, Ordering::Relaxed);
                        }
                    }
                }
            })
        };
        for round in 0..150 {
            write_settings_file(&path, if round % 2 == 0 { &b } else { &a }).unwrap();
        }
        done.store(true, Ordering::Relaxed);
        reader.join().unwrap();

        let (reads, incomplete) = (reads.load(Ordering::Relaxed), incomplete.load(Ordering::Relaxed));
        assert!(reads > 0, "القارئ لم يقرأ شيئًا");
        assert_eq!(incomplete, 0, "{incomplete} من {reads} قراءة وجدت الإعدادات ناقصة أثناء الحفظ");
    }

    #[test]
    fn an_unreadable_store_never_leads_to_deletion() {
        let path = temp_settings("clear-unreadable");
        let mut store = MemoryStore::with(ACCOUNT_API_KEY, "sk-old");
        store.fail_get = true;
        let settings = Settings { api_key: String::new(), ..Settings::default() };

        save_settings_with(&store, &path, settings).unwrap();

        assert_eq!(
            store.peek(ACCOUNT_API_KEY).as_deref(),
            Some("sk-old"),
            "عطلٌ عابر في الخزنة مُحي به مفتاح قائم"
        );
    }
}
