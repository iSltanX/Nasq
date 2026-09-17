// النوافذ الثانوية — تبدأ بالإعدادات.
//
// ما حسمه القياس على macOS 27 وإطارات التصميم معًا:
// - عرض النافذة ٥٠٠pt ثابت، وهو عرض اللوح نفسه في التصميم وفي إعدادات النظام:
//   نافذة الإعدادات لا تُحجَّم ولا تُصغَّر ولا تُكبَّر.
// - هيئتها ٨٨pt: صفّ عنوان ٣٢ وشريط تبويبات ٥٦، وترسمهما الصفحة لا النظام،
//   فالعنوان مخفيّ والهيئة متراكبة.
// - وهنا فرقٌ عن النافذة الرئيسية: تلك احتاجت شريط أدوات أصليًا فارغًا لتنال
//   مقاس ١٩/١٩ لإشارات النافذة، أما الإعدادات فنافذة بلا شريط أدوات، فمقاس
//   الهيئة المتراكبة العادي (٩/٩) هو الصحيح لها — وهو ما رُسم في التصميم.
// - الارتفاع يتبع اللوح لا العكس: إعدادات النظام تغيّر ارتفاع النافذة عند
//   تبديل التبويب بحركة، والتصميم نفسه يرسم ثلاثة ارتفاعات لثلاث حالات
//   (٥٥٢٫٥ لعام، و٥٣٨ لحالة تعذّر الاتصال، و٢٧٣ للتحديثات). فالصفحة تقيس
//   لوحها وتبلّغ، والإطار يتبعها من أعلاه — لا ارتفاع مثبّت يجفّ عند أول
//   تغيير في النصوص.

use tauri::{LogicalSize, Manager, TitleBarStyle, WebviewUrl, WebviewWindowBuilder};

use super::window::{system_prefers_dark, titlebar_is_rtl, WINDOW_DARK, WINDOW_LIGHT};

pub(crate) const SETTINGS_LABEL: &str = "settings";

/// صفحة الإعدادات تأتي مع واجهة المرحلة ٥؛ الخدمة هنا جاهزة لها
const SETTINGS_PAGE: &str = "settings.html";

const SETTINGS_WIDTH: f64 = 500.0;
/// صفّ العنوان ٣٢ + شريط التبويبات ٥٦
const SETTINGS_CHROME: f64 = 88.0;
/// لوح «عام» في التصميم — ارتفاع أول فتح قبل أن تقيس الصفحة نفسها
const SETTINGS_INITIAL_PANE: f64 = 464.5;
/// ألوح لوح مرسوم (التحديثات) — أقصر ما يجوز أن تصير إليه النافذة
const SETTINGS_MIN_PANE: f64 = 185.0;
/// سقف مطلق حتى لا تطول النافذة على شاشة كبيرة بلا داعٍ
const SETTINGS_MAX_HEIGHT: f64 = 900.0;
/// وحتى على شاشة صغيرة تبقى النافذة داخل المساحة المرئية
const SCREEN_SHARE: f64 = 0.8;

/// ارتفاع النافذة من ارتفاع اللوح، محصورًا بين أقصر لوح مرسوم وسقف الشاشة.
/// دالة خالصة عمدًا: هي القرار كله، فتُختبر وحدها بلا نافذة ولا نظام.
pub(crate) fn settings_height(pane: f64, screen_visible: f64) -> f64 {
    let floor = SETTINGS_CHROME + SETTINGS_MIN_PANE;
    let ceiling = (screen_visible * SCREEN_SHARE)
        .min(SETTINGS_MAX_HEIGHT)
        .max(floor);
    // NaN أو سالب يسقط إلى أقصر لوح: max يعيد الطرف الآخر مع NaN
    let wanted = SETTINGS_CHROME + pane.max(SETTINGS_MIN_PANE);
    wanted.clamp(floor, ceiling).round()
}

fn initial_settings_height() -> f64 {
    SETTINGS_CHROME + SETTINGS_INITIAL_PANE
}

/// نافذة واحدة لكل نوع: الموجودة تُرفع وتُركَّز، ولا تُفتح ثانية
#[tauri::command]
pub(crate) fn open_settings(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(SETTINGS_LABEL) {
        let _ = window.show();
        let _ = window.unminimize();
        return window.set_focus().map_err(|_| "تعذّر إظهار نافذة الإعدادات.".to_string());
    }

    let background = if system_prefers_dark() { WINDOW_DARK } else { WINDOW_LIGHT };
    let titlebar = if titlebar_is_rtl() { "rtl" } else { "ltr" };

    WebviewWindowBuilder::new(&app, SETTINGS_LABEL, WebviewUrl::App(SETTINGS_PAGE.into()))
        .initialization_script(format!(
            "document.documentElement.dataset.titlebar = \"{titlebar}\";"
        ))
        .title("الإعدادات")
        .inner_size(SETTINGS_WIDTH, initial_settings_height())
        .resizable(false)
        .minimizable(false)
        .maximizable(false)
        .title_bar_style(TitleBarStyle::Overlay)
        .hidden_title(true)
        .visible(false)
        .background_color(background)
        .center()
        .build()
        .map_err(|_| "تعذّر فتح نافذة الإعدادات.".to_string())?;

    Ok(())
}

/// الصفحة تعلن جاهزيتها كما تفعل النافذة الرئيسية: لا إطار فارغ يسبق الرسم
#[tauri::command]
pub(crate) fn secondary_window_ready(window: tauri::WebviewWindow) {
    let _ = window.show();
    let _ = window.set_focus();
}

/// الصفحة تقيس لوحها بعد تبديل التبويب فيتبعها الإطار من حافته العليا،
/// بحركة على الماك كما في إعدادات النظام
#[tauri::command]
pub(crate) fn settings_pane_resized(window: tauri::WebviewWindow, pane: f64) -> Result<(), String> {
    let screen_visible = visible_screen_height(&window);
    let target = settings_height(pane, screen_visible);

    #[cfg(target_os = "macos")]
    if macos::resize_from_top(&window, target) {
        return Ok(());
    }

    window
        .set_size(LogicalSize::new(SETTINGS_WIDTH, target))
        .map_err(|_| "تعذّر ضبط ارتفاع نافذة الإعدادات.".to_string())
}

/// ارتفاع المساحة المرئية من شاشة النافذة — مساحة العمل لا الشاشة كاملة،
/// فشريط القوائم والدوك ليسا مكانًا لنافذة. وعند تعذّرها سقفٌ متحفّظ
fn visible_screen_height(window: &tauri::WebviewWindow) -> f64 {
    let Ok(Some(monitor)) = window.current_monitor() else {
        return SETTINGS_MAX_HEIGHT;
    };
    let scale = monitor.scale_factor();
    monitor.work_area().size.to_logical::<f64>(scale).height
}

#[cfg(target_os = "macos")]
mod macos {
    use objc2::MainThreadMarker;
    use objc2_app_kit::NSWindow;

    /// يغيّر الارتفاع مع تثبيت الحافة العليا: أصل الماك من الأسفل، فيهبط
    /// origin.y بقدر ما يرتفع height. الفرق يُحسب من المقاس الداخلي الحالي
    /// فلا يُفترض ارتفاع هيئة ثابت
    pub(super) fn resize_from_top(window: &tauri::WebviewWindow, target_inner: f64) -> bool {
        // أوامر Tauri غير المتزامنة تصل على الخيط الرئيس اليوم، لكن النمط في
        // window.rs أن يُتحقَّق لا أن يُفترض: تحويلٌ مستقبلي إلى async يكسر
        // الافتراض بصمت، وهنا يسقط إلى مسار Tauri الآمن بدل لمس AppKit
        let Some(_mtm) = MainThreadMarker::new() else { return false };
        let Ok(scale) = window.scale_factor() else { return false };
        let Ok(inner) = window.inner_size() else { return false };
        let current_inner = inner.to_logical::<f64>(scale).height;
        let delta = target_inner - current_inner;
        if delta.abs() < 0.5 {
            return true;
        }

        let Ok(ptr) = window.ns_window() else { return false };
        // أمان: NSWindow حيّة تملكها نافذة Tauri، والنداء من أمر يصل على الخيط الرئيس
        let ns_window: &NSWindow = unsafe { &*(ptr as *const NSWindow) };
        let mut frame = ns_window.frame();
        frame.size.height += delta;
        frame.origin.y -= delta;
        ns_window.setFrame_display_animate(frame, true, true);
        true
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const ROOMY_SCREEN: f64 = 1000.0;

    #[test]
    fn the_general_pane_gives_the_height_the_design_draws() {
        // ٤٦٤٫٥ لوحًا + ٨٨ هيئةً = ٥٥٢٫٥ في الإطار، و٥٥٣ نقطةً على الشاشة
        assert_eq!(settings_height(SETTINGS_INITIAL_PANE, ROOMY_SCREEN), 553.0);
    }

    #[test]
    fn the_updates_pane_gives_the_shortest_drawn_window() {
        assert_eq!(settings_height(185.0, ROOMY_SCREEN), 273.0);
    }

    #[test]
    fn the_connection_error_pane_keeps_its_own_height() {
        // حالة تعذّر الاتصال في التصميم: ٤٥٠ لوحًا = ٥٣٨
        assert_eq!(settings_height(450.0, ROOMY_SCREEN), 538.0);
    }

    #[test]
    fn a_pane_shorter_than_the_shortest_never_shrinks_the_window_further() {
        assert_eq!(settings_height(40.0, ROOMY_SCREEN), 273.0);
        assert_eq!(settings_height(0.0, ROOMY_SCREEN), 273.0);
        assert_eq!(settings_height(-200.0, ROOMY_SCREEN), 273.0);
        assert_eq!(settings_height(f64::NAN, ROOMY_SCREEN), 273.0);
    }

    #[test]
    fn a_long_pane_stops_at_four_fifths_of_the_screen() {
        assert_eq!(settings_height(2000.0, ROOMY_SCREEN), 800.0);
    }

    #[test]
    fn a_long_pane_on_a_tall_screen_stops_at_the_absolute_ceiling() {
        assert_eq!(settings_height(2000.0, 4000.0), SETTINGS_MAX_HEIGHT);
    }

    #[test]
    fn a_short_screen_never_pushes_the_window_below_the_shortest_pane() {
        // شاشة ٢٠٠pt: أربعة أخماسها أقصر من أقصر نافذة مرسومة، فالأرضية تغلب
        assert_eq!(settings_height(SETTINGS_INITIAL_PANE, 200.0), 273.0);
    }

    #[test]
    fn the_window_opens_on_the_general_pane_height() {
        assert_eq!(initial_settings_height(), 552.5);
        assert_eq!(settings_height(SETTINGS_INITIAL_PANE, ROOMY_SCREEN), 553.0);
    }
}
