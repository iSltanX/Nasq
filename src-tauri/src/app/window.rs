// النافذة الرئيسية وإطارها الأصلي في الماك.
//
// ما حسمته تجربة المرحلة 0 بالقياس على macOS 27:
// - شريط أدوات أصلي فارغ بنمط Unified يمنح مقاسات النظام نفسها: إشارات
//   النافذة ١٤pt على بعد ١٩pt من الأعلى والجانب وبينها ٢٣pt، وزوايا نوافذ
//   شريط الأدوات — والنقر في نطاقه يصل إلى الواجهة لا إلى عرض النظام.
// - اتجاه شريط العنوان يتبع لغة النظام الأولى لا لغة التطبيق، فتُبلَّغ به
//   الواجهة قبل أول رسم لتحجز مكان الإشارات يمينًا أو يسارًا.
// - WebKit يعلّق requestAnimationFrame ما دامت النافذة مخفية (حتى بشفافية
//   صفر)، فتعلن الواجهة جاهزيتها بعد تحميل خطوطها مباشرة، ويأتي أول إطار
//   ظاهر مرسومًا كاملًا — مثبت بتسجيل الشاشة إطارًا إطارًا.
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use tauri::window::Color;
use tauri::{TitleBarStyle, WebviewUrl, WebviewWindowBuilder};

static LAUNCHED_AT: OnceLock<Instant> = OnceLock::new();

/// يُنادى أول main() — مرجع قياس زمن الفتح في نسخ التطوير
pub(crate) fn mark_launch() {
    let _ = LAUNCHED_AT.set(Instant::now());
}

// surface/window من Figma فاتحًا وداكنًا — لون ما قد يظهر قبل رسم الواجهة
// أو على حوافها أثناء تغيير الحجم
pub(crate) const WINDOW_LIGHT: Color = Color(0xFF, 0xFF, 0xFF, 0xFF);
pub(crate) const WINDOW_DARK: Color = Color(0x1E, 0x1E, 0x1E, 0xFF);

// إن لم تعلن الواجهة جاهزيتها (خطأ في JS مثلًا) تظهر النافذة على أي حال
const SHOW_FALLBACK: Duration = Duration::from_millis(1500);

pub(crate) fn create_main_window(app: &tauri::App) -> tauri::Result<()> {
    let background = if system_prefers_dark() { WINDOW_DARK } else { WINDOW_LIGHT };
    let titlebar = if titlebar_is_rtl() { "rtl" } else { "ltr" };

    let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App(entry_page().into()))
        .initialization_script(format!("document.documentElement.dataset.titlebar = \"{titlebar}\";"))
        .title("نَسَق")
        .inner_size(1280.0, 800.0)
        .min_inner_size(760.0, 560.0)
        .title_bar_style(TitleBarStyle::Overlay)
        .hidden_title(true)
        .visible(false)
        .background_color(background)
        .center()
        .build()?;

    #[cfg(target_os = "macos")]
    macos::apply_native_chrome(&window);

    let fallback = window.clone();
    std::thread::spawn(move || {
        std::thread::sleep(SHOW_FALLBACK);
        if !fallback.is_visible().unwrap_or(true) {
            let _ = fallback.show();
            let _ = fallback.set_focus();
        }
    });
    Ok(())
}

/// الواجهة تناديه حين تُحمَّل خطوطها — لا بعد requestAnimationFrame (انظر الرأس)
#[tauri::command]
pub(crate) fn main_window_ready(window: tauri::WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
    #[cfg(debug_assertions)]
    if let Some(t0) = LAUNCHED_AT.get() {
        eprintln!("[nasaq] main window shown {} ms after launch", t0.elapsed().as_millis());
    }
}

// صفحة الدخول — متغير NSQ_ENTRY في نسخ التطوير فقط يفتح صفحة تجربة بدلها
fn entry_page() -> String {
    #[cfg(debug_assertions)]
    if let Ok(page) = std::env::var("NSQ_ENTRY") {
        return page;
    }
    "index.html".to_string()
}

pub(crate) fn titlebar_is_rtl() -> bool {
    #[cfg(target_os = "macos")]
    {
        macos::titlebar_is_rtl()
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

pub(crate) fn system_prefers_dark() -> bool {
    #[cfg(target_os = "macos")]
    {
        macos::system_prefers_dark()
    }
    #[cfg(not(target_os = "macos"))]
    {
        false
    }
}

#[cfg(target_os = "macos")]
mod macos {
    use std::ptr::NonNull;

    use block2::RcBlock;
    use objc2::runtime::AnyObject;
    use objc2::{MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{
        NSApplication, NSTitlebarSeparatorStyle, NSToolbar, NSWindow,
        NSWindowDidExitFullScreenNotification, NSWindowToolbarStyle,
        NSWindowWillEnterFullScreenNotification, NSWindowWillExitFullScreenNotification,
    };
    use objc2_foundation::{
        NSLocale, NSLocaleLanguageDirection, NSNotification, NSNotificationCenter, NSString,
    };

    /// «في العموم يكون RTL إن كانت لغة النظام الأولى RTL» — رأس AppKit لـ
    /// windowTitlebarLayoutDirection، ويُحسب هنا قبل إنشاء النافذة
    pub(super) fn titlebar_is_rtl() -> bool {
        let languages = NSLocale::preferredLanguages();
        let Some(first) = languages.firstObject() else { return false };
        NSLocale::characterDirectionForLanguage(&first) == NSLocaleLanguageDirection::RightToLeft
    }

    pub(super) fn system_prefers_dark() -> bool {
        let Some(mtm) = MainThreadMarker::new() else { return false };
        let name = NSApplication::sharedApplication(mtm).effectiveAppearance().name();
        name.to_string().contains("Dark")
    }

    pub(super) fn apply_native_chrome(window: &tauri::WebviewWindow) {
        let Some(mtm) = MainThreadMarker::new() else { return };
        let Ok(ptr) = window.ns_window() else { return };
        // أمان: NSWindow حيّة تملكها نافذة Tauri، ونحن على الخيط الرئيس (setup)
        let ns_window: &NSWindow = unsafe { &*(ptr as *const NSWindow) };

        let toolbar =
            NSToolbar::initWithIdentifier(NSToolbar::alloc(mtm), &NSString::from_str("nasaq.main"));
        ns_window.setToolbar(Some(&toolbar));
        ns_window.setToolbarStyle(NSWindowToolbarStyle::Unified);
        ns_window.setTitlebarSeparatorStyle(NSTitlebarSeparatorStyle::None);
        hide_toolbar_in_full_screen(ns_window);
    }

    /// في ملء الشاشة لا إشارات نافذة، ويغطي شريط الأدوات الأصلي أعلى الواجهة
    /// بشريط معتم — فيُخفى قبل الدخول ويعود مع الخروج (عند بدئه وعند تمامه،
    /// لأن AppKit يستعيد حالة ما قبل الدخول أثناء حركة الخروج)
    fn hide_toolbar_in_full_screen(ns_window: &NSWindow) {
        let center = NSNotificationCenter::defaultCenter();
        let window_ptr = ns_window as *const NSWindow as usize;
        for (name, visible) in [
            (unsafe { NSWindowWillEnterFullScreenNotification }, false),
            (unsafe { NSWindowWillExitFullScreenNotification }, true),
            (unsafe { NSWindowDidExitFullScreenNotification }, true),
        ] {
            let block = RcBlock::new(move |_: NonNull<NSNotification>| {
                // أمان: المراقِب مقيّد بهذه النافذة، والإشعار يصل على الخيط الرئيس وهي حيّة
                let window: &NSWindow = unsafe { &*(window_ptr as *const NSWindow) };
                if let Some(toolbar) = window.toolbar() {
                    toolbar.setVisible(visible);
                }
            });
            let object: &AnyObject = ns_window.as_ref();
            // النافذة الرئيسية تعيش بعمر التطبيق، فيبقى المراقِب معها
            let token = unsafe {
                center.addObserverForName_object_queue_usingBlock(Some(name), Some(object), None, &block)
            };
            std::mem::forget(token);
        }
    }
}
