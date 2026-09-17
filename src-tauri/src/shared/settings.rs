// إعدادات الخدمة: تخزين محلي في settings.json — المفتاح والمزود والنموذج.
// جزء من الأساس المشترك: لا يعرف عقدًا ولا وضعًا. (نُقل من main.rs حرفيًا
// في تحصين v4.1)
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

use super::secrets::{Keychain, SecretStore, ACCOUNT_API_KEY};

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
    /// المفتاح محفوظ لكن تعذّرت قراءته الآن — يميّز «لا مفتاح» عن «لم أصل
    /// إليه»، فلا يرى صاحب مفتاحٍ قائمٍ رسالةَ من لا مفتاح له. لا يُكتب في
    /// الملف ولا يُرسل إلى الواجهة إلا حين يكون صحيحًا
    #[serde(default, skip_serializing_if = "is_false")]
    pub(crate) key_unavailable: bool,
}

fn is_false(value: &bool) -> bool {
    !*value
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            api_key: String::new(),
            base_url: DEFAULT_BASE_URL.to_string(),
            model: DEFAULT_MODEL.to_string(),
            provider: String::new(),
            key_unavailable: false,
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

fn read_settings_file(path: &Path) -> Result<Settings, String> {
    if !path.exists() {
        return Ok(Settings::default());
    }
    let raw = fs::read_to_string(path).map_err(|_| "تعذّرت قراءة ملف الإعدادات.".to_string())?;
    serde_json::from_str(&raw)
        .map_err(|_| "ملف الإعدادات تالف — افتح الإعدادات واحفظها من جديد.".to_string())
}

fn write_settings_file(path: &Path, settings: &Settings) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(settings)
        .map_err(|_| "تعذّر تجهيز الإعدادات للحفظ.".to_string())?;
    fs::write(path, raw).map_err(|_| "تعذّر حفظ الإعدادات محليًا.".to_string())?;
    // الملف قد يحوي مفتاح API في مسار التراجع — قراءة وكتابة لصاحب الجهاز فقط
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
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
pub(crate) fn load_settings(app: tauri::AppHandle) -> Result<Settings, String> {
    read_settings(&app)
}

#[tauri::command]
pub(crate) fn save_settings(app: tauri::AppHandle, settings: Settings) -> Result<(), String> {
    let path = settings_path(&app)?;
    save_settings_with(&Keychain, &path, settings)
}

/// المفتاح إلى الخزنة والباقي إلى الملف. ثلاثة مسارات مقصودة:
/// مفتاحٌ يُحفظ في الخزنة فيُفرَّغ حقله في الملف، ومفتاحٌ تعذّر حفظه فيبقى في
/// الملف كما كان قبل هذه المرحلة، وحقلٌ فارغ يعني الحذف — ولا يجري الحذف إلا
/// والخزنة مقروءة، فلا يُترجم عطلٌ عابر إلى محو مفتاح قائم.
fn save_settings_with(
    store: &dyn SecretStore,
    path: &Path,
    settings: Settings,
) -> Result<(), String> {
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

    write_settings_file(path, &on_disk)
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
