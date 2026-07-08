// أداة تسجيل تجربة شَذْب — مؤقتة، خلف مفتاح الواجهة ENABLE_SHATHB_TRIAL_LOG
// (في shadhb-trial-log.js). لا تلمس عقود شَذْب ولا منطق الفحص أو التحقق —
// وحدة مستقلة بالكامل، شقيقة لـshared/nasaq/shadhb لا جزء من أيٍّ منها،
// فلا استيراد من أي برج وأي برج لا يستوردها.
//
// تكتب ملفات JSON في data/shathb-trials/ داخل جذر المشروع (لا مجلد بيانات
// التطبيق) كي تُقرأ من الملفات مباشرة. المسار يُشتق من CARGO_MANIFEST_DIR
// (ثابت وقت الترجمة = مجلد src-tauri) لا من مجلد العمل وقت التشغيل، ولا
// تملك الواجهة أي سبيل لتغييره.
//
// الإزالة: احذف هذا الملف + سطر mod وسطري invoke_handler في main.rs +
// src/shadhb-trial-log.js + وسم <script> المقابل في index.html، وbeta
// data/shathb-trials/ إن رغبت.
use serde_json::Value;
use std::fs;
use std::path::PathBuf;

fn trials_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .expect("src-tauri له أب دائمًا")
        .join("data")
        .join("shathb-trials")
}

fn version_from_name(name: &str) -> Option<u32> {
    name.strip_prefix("shathb-trial-log-v")?
        .strip_suffix(".json")?
        .parse()
        .ok()
}

/// أعلى رقم نسخة موجود فعليًا على القرص، أو صفر إن لم يوجد شيء بعد
fn latest_version(dir: &PathBuf) -> u32 {
    fs::read_dir(dir)
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .filter_map(|e| version_from_name(&e.file_name().to_string_lossy()))
        .max()
        .unwrap_or(0)
}

/// يضيف سجلًا واحدًا إلى أحدث ملف تجربة نشط — ينشئ v1 عند أول استخدام
#[tauri::command]
pub(crate) fn save_shadhb_trial(entry: Value) -> Result<String, String> {
    let dir = trials_dir();
    fs::create_dir_all(&dir).map_err(|_| "تعذّر إنشاء مجلد سجل التجربة.".to_string())?;

    let version = latest_version(&dir).max(1);
    let file_name = format!("shathb-trial-log-v{}.json", version);
    let path = dir.join(&file_name);

    let mut entries: Vec<Value> = if path.exists() {
        let raw = fs::read_to_string(&path).map_err(|_| "تعذّرت قراءة ملف السجل.".to_string())?;
        serde_json::from_str(&raw)
            .map_err(|_| "ملف السجل تالف — لا يمكن الإضافة إليه بأمان.".to_string())?
    } else {
        Vec::new()
    };

    entries.push(entry);
    let raw = serde_json::to_string_pretty(&entries)
        .map_err(|_| "تعذّر تجهيز السجل للحفظ.".to_string())?;
    fs::write(&path, raw).map_err(|_| "تعذّر حفظ ملف السجل.".to_string())?;

    Ok(file_name)
}

/// يبدأ دفعة تجربة جديدة بإنشاء النسخة التالية فارغة — لا يمسّ أي ملف سابق
#[tauri::command]
pub(crate) fn renew_shadhb_trial_log() -> Result<String, String> {
    let dir = trials_dir();
    fs::create_dir_all(&dir).map_err(|_| "تعذّر إنشاء مجلد سجل التجربة.".to_string())?;

    let next = latest_version(&dir) + 1;
    let file_name = format!("shathb-trial-log-v{}.json", next);
    fs::write(dir.join(&file_name), "[]")
        .map_err(|_| "تعذّر إنشاء ملف السجل الجديد.".to_string())?;

    Ok(file_name)
}
