// الملفات الخاصة على القرص: الإعدادات والمسودات. جزء من الأساس المشترك:
// بايتات ومسارات، ولا يعرف إعدادًا ولا مسودة.
//
// قاعدتان (فحص m2): الملف على القرص لا يكون ناقصًا في أي لحظة، فانهيارٌ أو
// قرصٌ امتلأ أثناء الحفظ يُبقي النسخة السابقة كاملة. وما لا يُقرأ لا يُكتب
// فوقه: يُنحّى جانبًا باسمٍ لم يُستعمل من قبل.
use std::fs;
use std::io::Write;
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

static TEMP_SEQ: AtomicU64 = AtomicU64::new(0);

/// الملف كاملًا في ملفٍّ مؤقت بجواره، يُثبَّت على القرص، ثم يحلّ محلّ الأصل
/// بإعادة تسمية واحدة: من يقرأ الملف في أي لحظة يجد القديم كاملًا أو الجديد
/// كاملًا. والصلاحية 0600 من لحظة الإنشاء، فالنص لا يمرّ بلحظةٍ يقرؤه فيها غير
/// صاحب الجهاز
pub(crate) fn write_private(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let name = path.file_name().map(|n| n.to_string_lossy()).unwrap_or_default();
    let temp = path.with_file_name(format!(
        ".{name}.{}-{}.tmp",
        std::process::id(),
        TEMP_SEQ.fetch_add(1, Ordering::Relaxed)
    ));
    let written = (|| {
        let mut file = fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(&temp)?;
        // مؤقتٌ قديم بالاسم نفسه من عمليةٍ انهارت لا يحمل صلاحيته إلى الأصل
        file.set_permissions(fs::Permissions::from_mode(0o600))?;
        file.write_all(bytes)?;
        file.sync_all()?;
        fs::rename(&temp, path)
    })();
    if written.is_err() {
        let _ = fs::remove_file(&temp);
    }
    written
}

/// يُنحّي ملفًّا لا يُستعمل باسمٍ لم يُستعمل: `drafts.json.corrupt` ثم
/// `drafts.json.corrupt-2`… فلا تمحو تنحيةٌ نسخةً نحّتها أخرى قبلها. الربط الصلب
/// يرفض اسمًا موجودًا من تلقاء نفسه، فلا يمحو ولو تسابق اثنان على الاسم (نسختان
/// من التطبيق مثلًا)؛ ثم يُزال الاسم الأصلي، والنسخة لصاحب الجهاز وحده
pub(crate) fn set_aside(path: &Path) -> std::io::Result<PathBuf> {
    let name = path.file_name().map(|n| n.to_string_lossy()).unwrap_or_default();
    for n in 1..=1000 {
        let aside = path.with_file_name(if n == 1 {
            format!("{name}.corrupt")
        } else {
            format!("{name}.corrupt-{n}")
        });
        match fs::hard_link(path, &aside) {
            Ok(()) => {
                // ملفٌّ عادي وحده: الصلاحية على رابطٍ رمزي تصيب هدفه خارج المجلد
                if fs::symlink_metadata(&aside).map(|m| m.is_file()).unwrap_or(false) {
                    let _ = fs::set_permissions(&aside, fs::Permissions::from_mode(0o600));
                }
                fs::remove_file(path)?;
                return Ok(aside);
            }
            // الاسم مأخوذ: بخطأ الربط نفسه، أو بخطأٍ يسبقه (المجلد يُرفض قبل النظر في الاسم)
            Err(_) if fs::symlink_metadata(&aside).is_ok() => continue,
            // ما لا يُربط صلبًا (مجلدٌ مكان الملف) يُنقل إلى الاسم الخالي
            Err(_) => {
                fs::rename(path, &aside)?;
                return Ok(aside);
            }
        }
    }
    Err(std::io::Error::new(std::io::ErrorKind::AlreadyExists, "لا اسم متاح للتنحية"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir(name: &str) -> PathBuf {
        let mut dir = std::env::temp_dir();
        dir.push(format!("nasaq-storage-{}-{}", std::process::id(), name));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn a_written_file_is_private_and_leaves_no_temp_behind() {
        let dir = temp_dir("private");
        let path = dir.join("drafts.json");
        fs::write(&path, b"old").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();

        write_private(&path, "جديد".as_bytes()).unwrap();

        assert_eq!(fs::read(&path).unwrap(), "جديد".as_bytes());
        let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "الملف مقروء لغير صاحبه: {mode:o}");
        let names: Vec<_> = fs::read_dir(&dir).unwrap().flatten().map(|e| e.file_name()).collect();
        assert_eq!(names, vec![std::ffi::OsString::from("drafts.json")], "بقي مؤقت بجوار الملف");
    }

    #[test]
    fn a_failed_write_keeps_the_old_file_whole() {
        // الوجهة مجلدٌ لا ملف: تفشل إعادة التسمية بعد اكتمال المؤقت، فيبقى
        // القديم كما هو ويُزال المؤقت
        let dir = temp_dir("failed");
        let path = dir.join("drafts.json");
        fs::create_dir(&path).unwrap();
        fs::write(path.join("inside"), b"old").unwrap();

        assert!(write_private(&path, b"new").is_err());

        assert_eq!(fs::read(path.join("inside")).unwrap(), b"old");
        let names: Vec<_> = fs::read_dir(&dir).unwrap().flatten().map(|e| e.file_name()).collect();
        assert_eq!(names, vec![std::ffi::OsString::from("drafts.json")], "بقي مؤقت بعد الفشل");
    }

    #[test]
    fn each_set_aside_takes_a_fresh_name() {
        let dir = temp_dir("aside");
        let path = dir.join("drafts.json");
        for round in 1..=3 {
            fs::write(&path, format!("تالف {round}")).unwrap();
            // ملفٌّ كُتب بغير هذه الوحدة (قديم أو منسوخ) بصلاحيةٍ أوسع
            fs::set_permissions(&path, fs::Permissions::from_mode(0o644)).unwrap();
            set_aside(&path).unwrap();
        }
        assert!(!path.exists(), "الأصل لم يُنحَّ");
        for (name, body) in [
            ("drafts.json.corrupt", "تالف 1"),
            ("drafts.json.corrupt-2", "تالف 2"),
            ("drafts.json.corrupt-3", "تالف 3"),
        ] {
            assert_eq!(fs::read_to_string(dir.join(name)).unwrap(), body, "{name}");
            let mode = fs::metadata(dir.join(name)).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode, 0o600, "{name} مقروءة لغير صاحبها: {mode:o}");
        }
    }

    #[test]
    fn a_folder_in_the_way_is_set_aside_too() {
        // الربط الصلب لا يصلح للمجلد: يُنقل إلى الاسم الخالي كما كان
        let dir = temp_dir("aside-folder");
        let path = dir.join("drafts.json");
        fs::create_dir(&path).unwrap();
        fs::write(dir.join("drafts.json.corrupt"), b"older").unwrap();

        let aside = set_aside(&path).unwrap();

        assert_eq!(aside, dir.join("drafts.json.corrupt-2"));
        assert!(aside.is_dir() && !path.exists());
        assert_eq!(fs::read(dir.join("drafts.json.corrupt")).unwrap(), b"older", "مُحيت نسخةٌ أقدم");
    }
}
