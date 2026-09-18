// الجلسة الجارية: ما يُعمل عليه ولم يُحفظ مسودةً — نص الخانة، ونتيجته، وصيغه
// المنتظرة — في session.json بجوار المسودات، فلا يضيع بإغلاقٍ أو انهيار (فحص
// m2-16). جزء من الأساس المشترك: يخزّن Value خامًا كما تبنيه الواجهة، ولا يعرف
// بنيته ولا برجًا ولا مسودة.
use serde_json::Value;
use std::fs;
use std::path::Path;

use super::settings::data_file_path;
use super::storage::{set_aside, write_private};

/// الجلسة المحفوظة، أو null حين لا جلسة. وما لا يُقرأ يُنحّى جانبًا ويُعاد null،
/// فلا تمنع جلسةٌ تالفة الإقلاع ولا يكتب فوقها أول حفظ
#[tauri::command]
pub(crate) fn load_session(app: tauri::AppHandle) -> Result<Value, String> {
    load_session_at(&data_file_path(&app, "session.json")?)
}

fn load_session_at(path: &Path) -> Result<Value, String> {
    if !path.exists() {
        return Ok(Value::Null);
    }
    match fs::read(path).ok().and_then(|raw| serde_json::from_slice::<Value>(&raw).ok()) {
        Some(session @ Value::Object(_)) => Ok(session),
        _ => {
            set_aside(path).map_err(|_| "تعذّرت قراءة الجلسة السابقة.".to_string())?;
            Ok(Value::Null)
        }
    }
}

/// نصوص الكاتب: لصاحب الجهاز وحده، ولا تكون ناقصة على القرص في أي لحظة
#[tauri::command]
pub(crate) fn save_session(app: tauri::AppHandle, session: Value) -> Result<(), String> {
    save_session_at(&data_file_path(&app, "session.json")?, &session)
}

fn save_session_at(path: &Path, session: &Value) -> Result<(), String> {
    let raw = serde_json::to_vec(session).map_err(|_| "تعذّر تجهيز الجلسة للحفظ.".to_string())?;
    write_private(path, &raw).map_err(|_| "تعذّر حفظ الجلسة محليًا.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::os::unix::fs::PermissionsExt;
    use std::path::PathBuf;

    fn temp_dir(name: &str) -> PathBuf {
        let mut dir = std::env::temp_dir();
        dir.push(format!("nasaq-session-{}-{}", std::process::id(), name));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_saved_session_comes_back_as_it_was() {
        let dir = temp_dir("round-trip");
        let path = dir.join("session.json");
        assert_eq!(load_session_at(&path).unwrap(), Value::Null, "لا جلسة قبل أول حفظ");

        let session = json!({ "input": "العلم نورٌ\nيُقذف في القلب", "parts": { "a": { "output": "العلم\nنور" } } });
        save_session_at(&path, &session).unwrap();
        assert_eq!(load_session_at(&path).unwrap(), session);
        let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "الجلسة مقروءةٌ لغير صاحب الجهاز");
    }

    #[test]
    fn a_damaged_session_is_set_aside_not_written_over() {
        let dir = temp_dir("damaged");
        let path = dir.join("session.json");
        let cut = b"{\"input\": \"\xd8".to_vec(); // بُترت وسط حرفٍ عربي
        fs::write(&path, &cut).unwrap();

        assert_eq!(load_session_at(&path).unwrap(), Value::Null);
        save_session_at(&path, &json!({ "input": "" })).unwrap();
        assert_eq!(fs::read(dir.join("session.json.corrupt")).unwrap(), cut, "الجلسة التالفة لم تُنحَّ");
    }
}
