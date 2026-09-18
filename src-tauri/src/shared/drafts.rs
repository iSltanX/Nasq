// المسودات: تخزين محلي بالكامل في drafts.json بجوار الإعدادات، ونسخة
// احتياطية إلى التنزيلات. جزء من الأساس المشترك: يخزّن Value خامًا ولا
// يعرف بنية المسودة — النموذج الهرمي في drafts-model.js عند الواجهة.
// (نُقل من main.rs حرفيًا في تحصين v4.1)
use serde_json::{json, Value};
use std::fs;
use std::path::Path;
use tauri::Manager;

use super::settings::data_file_path;
use super::storage::{set_aside, write_private};

#[tauri::command]
pub(crate) fn load_drafts(app: tauri::AppHandle) -> Result<Value, String> {
    load_drafts_at(&data_file_path(&app, "drafts.json")?)
}

/// ما لا يُقرأ قائمةً لا يعطّل اللوحة ولا يُكتب فوقه: بايتاتٌ لا تُقرأ (ومنها
/// كتابةٌ بُترت وسط حرف)، أو JSON تالف، أو JSON ليس مصفوفة — كلها تُنحّى جانبًا
/// باسمٍ لم يُستعمل، ثم تُعرض قائمة فارغة، فيبقى ما كان قابلًا للإنقاذ اليدوي
/// محفوظًا. وإن تعذّرت التنحية نفسها وصل الخطأ الواجهةَ بدل قائمةٍ فارغة (فحص m2)
fn load_drafts_at(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(json!([]));
    }
    match fs::read(path).ok().and_then(|raw| serde_json::from_slice::<Value>(&raw).ok()) {
        Some(list @ Value::Array(_)) => Ok(list),
        _ => {
            set_aside(path).map_err(|_| "تعذّرت قراءة المسودات.".to_string())?;
            Ok(json!([]))
        }
    }
}

#[tauri::command]
pub(crate) fn save_drafts(app: tauri::AppHandle, drafts: Value) -> Result<(), String> {
    save_drafts_at(&data_file_path(&app, "drafts.json")?, &drafts)
}

/// نصوص المستخدم الخاصة: لصاحب الجهاز وحده، ولا تكون ناقصة على القرص في أي لحظة
fn save_drafts_at(path: &Path, drafts: &Value) -> Result<(), String> {
    let raw = serde_json::to_string_pretty(drafts)
        .map_err(|_| "تعذّر تجهيز المسودات للحفظ.".to_string())?;
    write_private(path, raw.as_bytes()).map_err(|_| "تعذّر حفظ المسودات محليًا.".to_string())
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::Arc;

    fn temp_dir(name: &str) -> PathBuf {
        let mut dir = std::env::temp_dir();
        dir.push(format!("nasaq-drafts-{}-{}", std::process::id(), name));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    /// ما يعرضه الشريط الجانبي من ردّ التحميل: الخطأ قائمة فارغة
    /// (shell.js loadDraftsFromStore)، وما ليس مصفوفة كذلك (migrateDrafts)
    fn as_the_sidebar_shows_it(loaded: Result<Value, String>) -> Value {
        match loaded {
            Ok(Value::Array(list)) => Value::Array(list),
            _ => json!([]),
        }
    }

    /// هل بقيت هذه البايتات كما هي في ملفٍّ ما من المجلد: الأصل أو نسخةٌ منحّاة
    fn survives(dir: &Path, bytes: &[u8]) -> bool {
        fs::read_dir(dir)
            .unwrap()
            .flatten()
            .any(|entry| fs::read(entry.path()).map(|found| found == bytes).unwrap_or(false))
    }

    /// المسودات كما يكتبها save_drafts
    fn written(drafts: &Value) -> Vec<u8> {
        serde_json::to_string_pretty(drafts).unwrap().into_bytes()
    }

    fn sample() -> Value {
        json!([{
            "key": "العلم نور",
            "original": "العلم نور",
            "createdAt": "2026-09-18T08:00:00Z",
            "versions": [{ "id": 1, "createdAt": "2026-09-18T08:00:00Z", "formatted": "العلم\nنور" }]
        }])
    }

    fn one_new_draft() -> Value {
        json!([{ "key": "جديد", "original": "جديد", "versions": [{ "id": 2 }] }])
    }

    #[test]
    fn a_file_cut_mid_letter_survives_the_next_save() {
        // كتابةٌ انقطعت (انهيار، أو قرصٌ امتلأ) تترك الملف مبتورًا، وقد يقع البتر
        // وسط حرفٍ عربي من بايتين فلا يبقى نصًّا صالحًا
        let dir = temp_dir("cut-mid-letter");
        let path = dir.join("drafts.json");
        let full = written(&sample());
        let cut_at = (1..full.len())
            .rev()
            .find(|&at| std::str::from_utf8(&full[..at]).is_err())
            .unwrap();
        let cut = full[..cut_at].to_vec();
        fs::write(&path, &cut).unwrap();

        assert_eq!(as_the_sidebar_shows_it(load_drafts_at(&path)), json!([]));
        save_drafts_at(&path, &one_new_draft()).unwrap();

        assert!(survives(&dir, &cut), "أول حفظٍ كتب فوق مسوداتٍ لم تُقرأ، ولا نسخة منها");
    }

    #[test]
    fn a_file_that_is_not_a_list_survives_the_next_save() {
        let dir = temp_dir("not-a-list");
        let path = dir.join("drafts.json");
        let original = written(&json!({ "drafts": sample() }));
        fs::write(&path, &original).unwrap();

        assert_eq!(as_the_sidebar_shows_it(load_drafts_at(&path)), json!([]));
        save_drafts_at(&path, &one_new_draft()).unwrap();

        assert!(survives(&dir, &original), "أول حفظٍ كتب فوق ملفٍّ ليس قائمة، ولا نسخة منه");
    }

    #[test]
    fn a_second_damaged_file_keeps_the_first_copy() {
        let dir = temp_dir("damaged-twice");
        let path = dir.join("drafts.json");
        let first = b"[{\"key\": \"first".to_vec();
        let second = b"[{\"key\": \"second".to_vec();

        fs::write(&path, &first).unwrap();
        load_drafts_at(&path).unwrap();
        save_drafts_at(&path, &sample()).unwrap();
        fs::write(&path, &second).unwrap();
        load_drafts_at(&path).unwrap();

        assert!(survives(&dir, &first), "التنحية الثانية محت نسخة الأولى");
        assert!(survives(&dir, &second), "التالف الثاني لم يُنحَّ");
    }

    #[test]
    fn the_file_on_disk_is_never_incomplete_during_a_save() {
        // ما يجده قارئٌ في أي لحظة هو ما يبقى على القرص لو انقطعت الكتابة فيها
        let dir = temp_dir("never-incomplete");
        let path = dir.join("drafts.json");
        let big = |tag: &str| {
            Value::Array(
                (0..1500)
                    .map(|i| {
                        json!({
                            "key": format!("{tag}-{i}"),
                            "original": "نصٌّ عربيٌّ يطول ".repeat(10),
                            "versions": [{ "id": i, "formatted": "سطرٌ\nوسطر" }]
                        })
                    })
                    .collect(),
            )
        };
        let (a, b) = (big("أ"), big("ب"));
        let complete = [written(&a).len(), written(&b).len()];
        save_drafts_at(&path, &a).unwrap();

        let done = Arc::new(AtomicBool::new(false));
        let reads = Arc::new(AtomicUsize::new(0));
        let incomplete = Arc::new(AtomicUsize::new(0));
        let reader = {
            let (path, done, reads, incomplete) = (path.clone(), done.clone(), reads.clone(), incomplete.clone());
            std::thread::spawn(move || {
                while !done.load(Ordering::Relaxed) {
                    if let Ok(bytes) = fs::read(&path) {
                        reads.fetch_add(1, Ordering::Relaxed);
                        if !complete.contains(&bytes.len()) {
                            incomplete.fetch_add(1, Ordering::Relaxed);
                        }
                    }
                }
            })
        };
        for round in 0..150 {
            save_drafts_at(&path, if round % 2 == 0 { &b } else { &a }).unwrap();
        }
        done.store(true, Ordering::Relaxed);
        reader.join().unwrap();

        let (reads, incomplete) = (reads.load(Ordering::Relaxed), incomplete.load(Ordering::Relaxed));
        assert!(reads > 0, "القارئ لم يقرأ شيئًا");
        assert_eq!(incomplete, 0, "{incomplete} من {reads} قراءة وجدت الملف ناقصًا أثناء الحفظ");
    }
}
