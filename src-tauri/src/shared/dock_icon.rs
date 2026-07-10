// أيقونة الدوك وقت التشغيل (تصحيح v6.3): المستخدم يختار تصميم الأيقونة من
// «المظهر» فتتبدل صورة الدوك للجلسة الجارية إلى نسخته المناسبة للوضع
// الفعّال (فاتحة/داكنة) عبر NSApplication.setApplicationIconImage.
//
// حدود صريحة: هذا يغيّر أيقونة «الدوك» فقط وأثناء تشغيل التطبيق فقط.
// أيقونة الحزمة في Finder/التطبيقات/Launchpad تأتي من icon.icns المثبتة
// وقت البناء ولا تُمسّ — إعادة كتابتها وقت التشغيل تعني تعديل حزمة
// موقّعة. الواجهة تستدعي الأمر عند الإقلاع ومع كل تبديل أيقونة أو وضع،
// فيستعيد الدوك الاختيار المحفوظ خلال لحظة من فتح التطبيق.
//
// الصور الثماني (٤ تصاميم × وضعين) مضمّنة في الثنائي من أصول nasaq-brand
// بقالب أبل (مربع دائري 824 بهوامش شفافة على لوحة 1024) — لا قراءة ملفات
// وقت التشغيل فيتطابق سلوك التطوير والحزمة حرفيًا.

#[cfg(target_os = "macos")]
mod assets {
    pub(super) const LINES_LIGHT: &[u8] = include_bytes!("../../icons/dock/lines-light.png");
    pub(super) const LINES_DARK: &[u8] = include_bytes!("../../icons/dock/lines-dark.png");
    pub(super) const NUN_LIGHT: &[u8] = include_bytes!("../../icons/dock/nun-light.png");
    pub(super) const NUN_DARK: &[u8] = include_bytes!("../../icons/dock/nun-dark.png");
    pub(super) const WEAVE_LIGHT: &[u8] = include_bytes!("../../icons/dock/weave-light.png");
    pub(super) const WEAVE_DARK: &[u8] = include_bytes!("../../icons/dock/weave-dark.png");
    pub(super) const WORDMARK_LIGHT: &[u8] = include_bytes!("../../icons/dock/wordmark-light.png");
    pub(super) const WORDMARK_DARK: &[u8] = include_bytes!("../../icons/dock/wordmark-dark.png");
}

#[tauri::command]
pub(crate) fn set_dock_icon(app: tauri::AppHandle, design: String, dark: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let bytes: &'static [u8] = match (design.as_str(), dark) {
            ("lines", false) => assets::LINES_LIGHT,
            ("lines", true) => assets::LINES_DARK,
            ("nun", false) => assets::NUN_LIGHT,
            ("nun", true) => assets::NUN_DARK,
            ("weave", false) => assets::WEAVE_LIGHT,
            ("weave", true) => assets::WEAVE_DARK,
            ("wordmark", false) => assets::WORDMARK_LIGHT,
            ("wordmark", true) => assets::WORDMARK_DARK,
            _ => return Err(format!("تصميم أيقونة مجهول: {design}")),
        };

        // تشخيص لنسخ التصحيح فقط: يثبت وصول النداء وقيمه من الواجهة —
        // stderr لا يظهر في نسخ الإصدار أصلًا
        #[cfg(debug_assertions)]
        eprintln!("[nasaq] set_dock_icon: design={design} dark={dark}");

        // AppKit يشترط الخيط الرئيس لكل ما يمس NSApplication
        app.run_on_main_thread(move || {
            use objc2::{AnyThread, MainThreadMarker};
            use objc2_app_kit::{NSApplication, NSImage};
            use objc2_foundation::NSData;

            // داخل run_on_main_thread نحن على الخيط الرئيس يقينًا، والحارس
            // احتياط لا يفشل عمليًا
            let Some(mtm) = MainThreadMarker::new() else { return };
            let data = NSData::with_bytes(bytes);
            if let Some(image) = NSImage::initWithData(NSImage::alloc(), &data) {
                // أمان: على الخيط الرئيس بعلامة mtm، والصورة NSImage صالحة
                // مملوكة (Retained) طوال النداء — شرطا الواجهة الوحيدان
                unsafe {
                    NSApplication::sharedApplication(mtm).setApplicationIconImage(Some(&image));
                }
                #[cfg(debug_assertions)]
                eprintln!("[nasaq] set_dock_icon: applied");
            } else {
                #[cfg(debug_assertions)]
                eprintln!("[nasaq] set_dock_icon: NSImage creation failed");
            }
        })
        .map_err(|e| e.to_string())?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        // منصات أخرى: لا دوك — الأمر يقبل بصمت فلا تعرف الواجهة فرقًا
        let _ = (app, design, dark);
    }

    Ok(())
}
