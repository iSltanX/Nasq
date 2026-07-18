// أيقونة الدوك وقت التشغيل: تتبع وضع المظهر الفعّال (فاتح/داكن) فتتبدل صورة
// الدوك للجلسة الجارية إلى نسخة أيقونة نَسَق المناسبة عبر
// NSApplication.setApplicationIconImage.
//
// حدود صريحة: هذا يغيّر أيقونة «الدوك» فقط وأثناء تشغيل التطبيق فقط.
// أيقونة الحزمة في Finder/التطبيقات/Launchpad تأتي من icon.icns المثبتة
// وقت البناء ولا تُمسّ — إعادة كتابتها وقت التشغيل تعني تعديل حزمة موقّعة.
// الواجهة تستدعي الأمر عند الإقلاع ومع كل تبديل وضع، فيستعيد الدوك النسخة
// المناسبة خلال لحظة من فتح التطبيق.
//
// الصورتان (فاتحة/داكنة) مضمّنتان في الثنائي من أيقونة نَسَق الجديدة بقالب
// أبل (مربع دائري مستمر) — لا قراءة ملفات وقت التشغيل فيتطابق سلوك التطوير
// والحزمة حرفيًا.

#[cfg(target_os = "macos")]
mod assets {
    pub(super) const NASAQ_LIGHT: &[u8] = include_bytes!("../../icons/dock/nasaq-light.png");
    pub(super) const NASAQ_DARK: &[u8] = include_bytes!("../../icons/dock/nasaq-dark.png");
}

#[tauri::command]
pub(crate) fn set_dock_icon(app: tauri::AppHandle, dark: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let bytes: &'static [u8] = if dark {
            assets::NASAQ_DARK
        } else {
            assets::NASAQ_LIGHT
        };

        // تشخيص لنسخ التصحيح فقط: يثبت وصول النداء وقيمته من الواجهة —
        // stderr لا يظهر في نسخ الإصدار أصلًا
        #[cfg(debug_assertions)]
        eprintln!("[nasaq] set_dock_icon: dark={dark}");

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
        let _ = (app, dark);
    }

    Ok(())
}
