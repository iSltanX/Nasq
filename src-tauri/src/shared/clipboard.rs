// الحافظة عبر pbcopy وpbpaste — جزء من الأساس المشترك.
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

/// سقف متحفّظ: الحافظة قد تحمل ملفًا ضخمًا، ولا يُقرأ إلى الذاكرة بلا حدّ
const CLIPBOARD_LIMIT: usize = 16 * 1024 * 1024;

/// اللصق من الحافظة عبر النواة لا عبر WebKit: قراءة الحافظة من الويب-فيو
/// تستدعي مطالبة إذن في الماك عند كل لصق، وقوائم السياق تحتاجها بلا مطالبة
#[tauri::command]
pub(crate) fn read_from_clipboard() -> Result<String, String> {
    let output = std::process::Command::new("pbpaste")
        .env("LANG", "en_US.UTF-8")
        .env("LC_ALL", "en_US.UTF-8")
        .output()
        .map_err(|_| "تعذّر الوصول إلى الحافظة.".to_string())?;
    if !output.status.success() {
        return Err("تعذّرت قراءة الحافظة.".to_string());
    }
    clipboard_text(output.stdout)
}

/// التحويل وحده — يُختبر بلا لمس حافظة الجهاز
fn clipboard_text(bytes: Vec<u8>) -> Result<String, String> {
    if bytes.len() > CLIPBOARD_LIMIT {
        return Err("محتوى الحافظة أكبر من أن يُلصق.".to_string());
    }
    // محتوى غير نصّي (صورة مثلًا) يعود فارغًا من pbpaste، وبايتات غير سليمة
    // تُبدَّل بمحرف بديل بدل أن يفشل اللصق كله
    Ok(String::from_utf8_lossy(&bytes).into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_and_plain_text_come_back_as_they_are() {
        assert_eq!(clipboard_text(Vec::new()).unwrap(), "");
        assert_eq!(clipboard_text("نصّ عربي".as_bytes().to_vec()).unwrap(), "نصّ عربي");
    }

    #[test]
    fn broken_bytes_do_not_fail_the_whole_paste() {
        let mut bytes = "نصّ".as_bytes().to_vec();
        bytes.push(0xFF);
        let text = clipboard_text(bytes).unwrap();
        assert!(text.starts_with("نصّ"), "ضاع النص السليم بسبب بايت فاسد");
    }

    #[test]
    fn an_oversized_clipboard_is_refused_not_read() {
        let huge = vec![b'a'; CLIPBOARD_LIMIT + 1];
        assert!(clipboard_text(huge).is_err(), "قُرئ محتوى بلا حدّ");
        let at_limit = vec![b'a'; CLIPBOARD_LIMIT];
        assert!(clipboard_text(at_limit).is_ok(), "رُفض ما هو عند الحدّ تمامًا");
    }
}
