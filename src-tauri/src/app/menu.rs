// شريط القوائم الأصلي — مرسوم في لوحة التصميم «Menu Bar · شريط القوائم».
//
// قاعدتان من اللوحة نفسها:
// - «كل أمر في التطبيق له مكان في شريط القوائم واختصار ثابت».
// - «الفعل الرئيس ⌘↩ يصير «نسّق» في نَسَق و«افحص الشذرة» في شَذْب» — عنصر
//   واحد باختصار ثابت، واسمه يتبع الوحدة الظاهرة.
//
// شريط القوائم العلوي وحده يرسمه النظام بخط SF Arabic، فلا تُمرَّر له خطوط
// التطبيق. وقوائم النقر الأيمن ترسمها الواجهة بخطَّي المشروع (المرحلة ٧-ب).
//
// هذه قشرة: تسمّي الأوامر كما رُسمت وتبثّها، ولا تحمل منطق برج ولا عقدًا ولا
// prompt، ولا تستورد من nasaq ولا من shadhb.

use tauri::menu::{
    CheckMenuItemBuilder, Menu, MenuBuilder, MenuEvent, MenuItemBuilder, MenuItemKind,
    PredefinedMenuItem, SubmenuBuilder,
};
use tauri::{AppHandle, Emitter, Manager, Runtime};

/// الفعل الرئيس: عنصر واحد باختصار ثابت، واسمه يتبع الوحدة
pub(crate) const PRIMARY_ACTION_ID: &str = "format.primary";
pub(crate) const PRIMARY_TITLE_NASAQ: &str = "نسّق";
pub(crate) const PRIMARY_TITLE_SHADHB: &str = "افحص الشذرة";

/// الحدث الذي تسمعه الواجهة: معرّف العنصر كما هو أدناه
pub(crate) const MENU_EVENT: &str = "menu:action";

/// عناصر يرسمها النظام بسلوكها ولغتها — لا تُعاد كتابتها بأيدينا
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub(crate) enum System {
    Services,
    Hide,
    HideOthers,
    ShowAll,
    Quit,
    Undo,
    Redo,
    Cut,
    Copy,
    Paste,
    SelectAll,
    Minimize,
    Maximize,
    BringAllToFront,
    CloseWindow,
    Fullscreen,
}

#[derive(Clone, Copy, Debug)]
pub(crate) enum Entry {
    Action {
        id: &'static str,
        title: &'static str,
        accelerator: Option<&'static str>,
    },
    Check {
        id: &'static str,
        title: &'static str,
        accelerator: Option<&'static str>,
        checked: bool,
    },
    Submenu {
        id: &'static str,
        title: &'static str,
        entries: &'static [Entry],
    },
    System(System),
    Separator,
}

pub(crate) struct MenuSpec {
    pub(crate) id: &'static str,
    pub(crate) title: &'static str,
    pub(crate) entries: &'static [Entry],
}

use Entry::{Action, Check, Separator, Submenu};
use System::*;

/// شريط القوائم كما رُسم: سبع قوائم، وترتيب العناصر والفواصل كما في اللوحة
pub(crate) const MENU_BAR: &[MenuSpec] = &[
    MenuSpec {
        id: "app",
        title: "نَسَق",
        entries: &[
            Action { id: "app.about", title: "حول نَسَق", accelerator: None },
            Action { id: "app.check-updates", title: "التحقق من وجود تحديثات…", accelerator: None },
            Separator,
            Action { id: "app.settings", title: "الإعدادات…", accelerator: Some("Cmd+,") },
            Separator,
            Entry::System(Services),
            Separator,
            Entry::System(Hide),
            Entry::System(HideOthers),
            Entry::System(ShowAll),
            Separator,
            Entry::System(Quit),
        ],
    },
    MenuSpec {
        id: "file",
        title: "ملف",
        entries: &[
            Action { id: "file.new-session", title: "جلسة جديدة", accelerator: Some("Cmd+N") },
            Action { id: "file.save-draft", title: "حفظ في المسودات", accelerator: Some("Cmd+S") },
            Separator,
            Action { id: "file.export-backup", title: "تصدير نسخة احتياطية…", accelerator: None },
            Action { id: "file.import-merge", title: "استيراد ودمج…", accelerator: None },
            Separator,
            Entry::System(CloseWindow),
        ],
    },
    MenuSpec {
        id: "edit",
        title: "تحرير",
        entries: &[
            Entry::System(Undo),
            Entry::System(Redo),
            Separator,
            Entry::System(Cut),
            Entry::System(Copy),
            Entry::System(Paste),
            Entry::System(SelectAll),
            Separator,
            Action { id: "edit.copy-result", title: "نسخ النتيجة", accelerator: Some("Shift+Cmd+C") },
            Action { id: "edit.export-substack", title: "تصدير لسابستاك", accelerator: Some("Alt+Cmd+C") },
            Separator,
            Submenu {
                id: "edit.find",
                title: "بحث",
                entries: &[
                    Action { id: "edit.find.open", title: "بحث…", accelerator: Some("Cmd+F") },
                    Action { id: "edit.find.next", title: "التالي", accelerator: Some("Cmd+G") },
                    Action { id: "edit.find.previous", title: "السابق", accelerator: Some("Shift+Cmd+G") },
                ],
            },
        ],
    },
    MenuSpec {
        id: "format",
        title: "تنسيق",
        entries: &[
            Action { id: PRIMARY_ACTION_ID, title: PRIMARY_TITLE_NASAQ, accelerator: Some("Cmd+Enter") },
            Action { id: "format.variations", title: "أرِني تنويعات…", accelerator: Some("Shift+Cmd+Enter") },
            Separator,
            Action { id: "format.clean-empty-lines", title: "حذف السطور الفارغة", accelerator: Some("Alt+Cmd+Backspace") },
            Action { id: "format.break-after-period", title: "كسر بعد النقطة", accelerator: Some("Alt+Cmd+.") },
            Action { id: "format.fewer-lines", title: "سطور أقل", accelerator: Some("Cmd+[") },
            Action { id: "format.more-lines", title: "سطور أكثر", accelerator: Some("Cmd+]") },
            Separator,
            Action { id: "format.reading-lens", title: "عدسة القراءة", accelerator: Some("Alt+Cmd+R") },
        ],
    },
    MenuSpec {
        id: "view",
        title: "عرض",
        entries: &[
            Check { id: "view.module.nasaq", title: "نَسَق", accelerator: Some("Cmd+1"), checked: true },
            Check { id: "view.module.shadhb", title: "شَذْب", accelerator: Some("Cmd+2"), checked: false },
            Separator,
            Check { id: "view.pane.source", title: "الأصل", accelerator: Some("Alt+Cmd+1"), checked: false },
            Check { id: "view.pane.result", title: "النتيجة", accelerator: Some("Alt+Cmd+2"), checked: true },
            Separator,
            Action { id: "view.sidebar", title: "إظهار الشريط الجانبي", accelerator: Some("Ctrl+Cmd+S") },
            Action { id: "view.inspector", title: "إظهار المفتّش", accelerator: Some("Alt+Cmd+I") },
            Separator,
            Entry::System(Fullscreen),
        ],
    },
    MenuSpec {
        id: "window",
        title: "نافذة",
        entries: &[
            Entry::System(Minimize),
            Entry::System(Maximize),
            Separator,
            Entry::System(BringAllToFront),
        ],
    },
    MenuSpec {
        id: "help",
        title: "مساعدة",
        entries: &[
            Action { id: "help.guide", title: "مساعدة نَسَق", accelerator: None },
            Action { id: "help.project", title: "صفحة المشروع", accelerator: None },
        ],
    },
];

/// يُبنى الشريط من المواصفة أعلاه وحدها — لا عنصر يُضاف هنا بلا رسم
pub(crate) fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let mut bar = MenuBuilder::new(app);
    for spec in MENU_BAR {
        let mut submenu = SubmenuBuilder::with_id(app, spec.id, spec.title);
        submenu = fill(app, submenu, spec.entries)?;
        bar = bar.item(&submenu.build()?);
    }
    bar.build()
}

fn fill<'m, R: Runtime>(
    app: &'m AppHandle<R>,
    mut builder: SubmenuBuilder<'m, R, AppHandle<R>>,
    entries: &'static [Entry],
) -> tauri::Result<SubmenuBuilder<'m, R, AppHandle<R>>> {
    for entry in entries {
        builder = match entry {
            Separator => builder.separator(),
            Action { id, title, accelerator } => {
                let mut item =
                    MenuItemBuilder::with_id(*id, *title).enabled(starts_enabled(id));
                if let Some(accelerator) = accelerator {
                    item = item.accelerator(*accelerator);
                }
                builder.item(&item.build(app)?)
            }
            Check { id, title, accelerator, checked } => {
                let mut item = CheckMenuItemBuilder::with_id(*id, *title)
                    .checked(*checked)
                    .enabled(starts_enabled(id));
                if let Some(accelerator) = accelerator {
                    item = item.accelerator(*accelerator);
                }
                builder.item(&item.build(app)?)
            }
            Submenu { id, title, entries } => {
                let nested = SubmenuBuilder::with_id(app, *id, *title);
                builder.item(&fill(app, nested, entries)?.build()?)
            }
            Entry::System(system) => builder.item(&system_item(app, *system)?),
        };
    }
    Ok(builder)
}

fn system_item<R: Runtime>(
    app: &AppHandle<R>,
    system: System,
) -> tauri::Result<PredefinedMenuItem<R>> {
    match system {
        Services => PredefinedMenuItem::services(app, None),
        Hide => PredefinedMenuItem::hide(app, None),
        HideOthers => PredefinedMenuItem::hide_others(app, None),
        ShowAll => PredefinedMenuItem::show_all(app, None),
        Quit => PredefinedMenuItem::quit(app, None),
        Undo => PredefinedMenuItem::undo(app, None),
        Redo => PredefinedMenuItem::redo(app, None),
        Cut => PredefinedMenuItem::cut(app, None),
        Copy => PredefinedMenuItem::copy(app, None),
        Paste => PredefinedMenuItem::paste(app, None),
        SelectAll => PredefinedMenuItem::select_all(app, None),
        Minimize => PredefinedMenuItem::minimize(app, None),
        Maximize => PredefinedMenuItem::maximize(app, None),
        BringAllToFront => PredefinedMenuItem::bring_all_to_front(app, None),
        CloseWindow => PredefinedMenuItem::close_window(app, None),
        Fullscreen => PredefinedMenuItem::fullscreen(app, None),
    }
}

/// ما تنفّذه القشرة بنفسها — شأن نوافذ لا شأن برج
const SHELL_HANDLED: &[&str] = &["app.settings", "app.about"];

fn handled_here<R: Runtime>(app: &AppHandle<R>, id: &str) -> bool {
    match id {
        "app.settings" => {
            let _ = super::secondary::open_settings_handle(app);
            true
        }
        "app.about" => {
            let _ = super::secondary::open_about_handle(app);
            true
        }
        _ => false,
    }
}

/// حدث القائمة لا يُخزَّن لمستمع يلتحق متأخرًا: عنصرٌ يُنقر قبل أن توجد
/// الواجهة فعلٌ يضيع بصمت. فما تنفّذه الواجهة يبدأ معطّلًا وتفتحه هي حين
/// تجهز (كما تفعل النافذة نفسها: لا تظهر حتى تعلن الجاهزية)، وما تنفّذه
/// القشرة يبدأ مفعّلًا
fn starts_enabled(id: &str) -> bool {
    SHELL_HANDLED.contains(&id)
}

/// ما عدا ذلك يُبثّ بمعرّفه، وتلتقطه الواجهة فتنفّذه بمنطق وحدته
pub(crate) fn on_event<R: Runtime>(app: &AppHandle<R>, event: MenuEvent) {
    let id = event.id().0.as_str();
    if handled_here(app, id) {
        return;
    }
    // شريط القوائم في الماك واحد للتطبيق كله، والأمر للنافذة المركَّزة لا
    // لكل نافذة معًا — وإلا نفّذت الرئيسية أمرًا صدر ونافذة أخرى في الواجهة
    match focused_window(app) {
        Some(window) => {
            let _ = window.emit(MENU_EVENT, id);
        }
        None => {
            let _ = app.emit_to("main", MENU_EVENT, id);
        }
    }
}

/// النافذة المركَّزة بالمسار المستقر: get_focused_window خلف سمة غير مستقرة
fn focused_window<R: Runtime>(app: &AppHandle<R>) -> Option<tauri::WebviewWindow<R>> {
    app.webview_windows()
        .into_values()
        .find(|window| window.is_focused().unwrap_or(false))
}

/// معرّفا وحدتي العرض كما رُسما في اللوحة
pub(crate) const MODULE_SHADHB: &str = "shadhb";
const MODULE_ITEM_NASAQ: &str = "view.module.nasaq";
const MODULE_ITEM_SHADHB: &str = "view.module.shadhb";

/// اسم الفعل الرئيس يتبع الوحدة الظاهرة — والاسمان من اللوحة لا من الواجهة،
/// فلا يُكتب نصّ تصميم في مكانين
pub(crate) fn primary_title(module: &str) -> &'static str {
    if module.trim() == MODULE_SHADHB {
        PRIMARY_TITLE_SHADHB
    } else {
        PRIMARY_TITLE_NASAQ
    }
}

/// تبديل الوحدة: اسم الفعل الرئيس وعلامتا ⌘1 و⌘2 في نداء واحد
#[tauri::command]
pub(crate) fn set_active_module(app: AppHandle, module: String) -> Result<(), String> {
    let shadhb = module.trim() == MODULE_SHADHB;
    set_menu_state(
        app,
        vec![
            MenuUpdate {
                id: PRIMARY_ACTION_ID.to_string(),
                enabled: None,
                checked: None,
                title: Some(primary_title(&module).to_string()),
            },
            checked_only(MODULE_ITEM_NASAQ, !shadhb),
            checked_only(MODULE_ITEM_SHADHB, shadhb),
        ],
    )
}

const PANE_ITEM_SOURCE: &str = "view.pane.source";
const PANE_ITEM_RESULT: &str = "view.pane.result";
pub(crate) const PANE_SOURCE: &str = "source";

/// اللوح المعروض: الزوج محصور هنا فلا تبقى حصريّته رهنَ نداءين من الواجهة
#[tauri::command]
pub(crate) fn set_active_pane(app: AppHandle, pane: String) -> Result<(), String> {
    let source = pane.trim() == PANE_SOURCE;
    set_menu_state(
        app,
        vec![checked_only(PANE_ITEM_SOURCE, source), checked_only(PANE_ITEM_RESULT, !source)],
    )
}

fn checked_only(id: &str, checked: bool) -> MenuUpdate {
    MenuUpdate { id: id.to_string(), enabled: None, checked: Some(checked), title: None }
}

/// تعديل حالة عنصر بعد بنائه: تفعيلًا، وعلامةَ تحديد، واسمًا
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct MenuUpdate {
    id: String,
    #[serde(default)]
    enabled: Option<bool>,
    #[serde(default)]
    checked: Option<bool>,
    #[serde(default)]
    title: Option<String>,
}

#[tauri::command]
pub(crate) fn set_menu_state(app: AppHandle, updates: Vec<MenuUpdate>) -> Result<(), String> {
    let Some(menu) = app.menu() else {
        return Err("لا شريط قوائم في هذه النافذة.".to_string());
    };
    for update in updates {
        let Some(kind) = find(&menu.items().map_err(menu_error)?, &update.id) else {
            continue;
        };
        apply(&kind, &update).map_err(menu_error)?;
    }
    Ok(())
}

fn menu_error<E>(_: E) -> String {
    "تعذّر تحديث شريط القوائم.".to_string()
}

/// بحث بالعمق: العنصر قد يكون داخل قائمة فرعية (بحث)
fn find<R: Runtime>(items: &[MenuItemKind<R>], id: &str) -> Option<MenuItemKind<R>> {
    for item in items {
        if item.id().0 == id {
            return Some(item.clone());
        }
        if let Some(submenu) = item.as_submenu() {
            if let Ok(nested) = submenu.items() {
                if let Some(found) = find(&nested, id) {
                    return Some(found);
                }
            }
        }
    }
    None
}

fn apply<R: Runtime>(kind: &MenuItemKind<R>, update: &MenuUpdate) -> tauri::Result<()> {
    match kind {
        MenuItemKind::MenuItem(item) => {
            if let Some(enabled) = update.enabled {
                item.set_enabled(enabled)?;
            }
            if let Some(title) = &update.title {
                item.set_text(title)?;
            }
        }
        MenuItemKind::Check(item) => {
            if let Some(enabled) = update.enabled {
                item.set_enabled(enabled)?;
            }
            if let Some(checked) = update.checked {
                item.set_checked(checked)?;
            }
            if let Some(title) = &update.title {
                item.set_text(title)?;
            }
        }
        MenuItemKind::Submenu(item) => {
            if let Some(enabled) = update.enabled {
                item.set_enabled(enabled)?;
            }
            if let Some(title) = &update.title {
                item.set_text(title)?;
            }
        }
        // عناصر النظام يملكها النظام: لا تُعدَّل بأيدينا
        _ => {}
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;

    fn walk(entries: &'static [Entry], visit: &mut impl FnMut(&'static Entry)) {
        for entry in entries {
            visit(entry);
            if let Submenu { entries, .. } = entry {
                walk(entries, visit);
            }
        }
    }

    fn all_entries() -> Vec<&'static Entry> {
        let mut found = Vec::new();
        for spec in MENU_BAR {
            walk(spec.entries, &mut |entry| found.push(entry));
        }
        found
    }

    fn id_of(entry: &Entry) -> Option<&'static str> {
        match entry {
            Action { id, .. } | Check { id, .. } | Submenu { id, .. } => Some(id),
            _ => None,
        }
    }

    fn accelerator_of(entry: &Entry) -> Option<&'static str> {
        match entry {
            Action { accelerator, .. } | Check { accelerator, .. } => *accelerator,
            _ => None,
        }
    }

    #[test]
    fn the_bar_has_the_seven_menus_of_the_board_in_order() {
        let titles: Vec<&str> = MENU_BAR.iter().map(|m| m.title).collect();
        assert_eq!(
            titles,
            vec!["نَسَق", "ملف", "تحرير", "تنسيق", "عرض", "نافذة", "مساعدة"]
        );
    }

    #[test]
    fn every_menu_matches_the_counts_drawn_in_the_board() {
        // (المعرّف، عناصر، فواصل) كما رُسمت في اللوحة عنصرًا عنصرًا
        let drawn = [
            ("app", 8, 4),
            ("file", 5, 2),
            ("edit", 9, 3),
            ("format", 7, 2),
            ("view", 7, 3),
            ("window", 3, 1),
            ("help", 2, 0),
        ];
        for (id, items, separators) in drawn {
            let spec = MENU_BAR.iter().find(|m| m.id == id).expect(id);
            let drawn_items = spec
                .entries
                .iter()
                .filter(|e| !matches!(e, Separator))
                .count();
            let drawn_separators = spec.entries.iter().filter(|e| matches!(e, Separator)).count();
            assert_eq!(drawn_items, items, "عدد عناصر قائمة {id}");
            assert_eq!(drawn_separators, separators, "عدد فواصل قائمة {id}");
        }
    }

    #[test]
    fn no_identifier_is_used_twice() {
        let mut seen = HashSet::new();
        for spec in MENU_BAR {
            assert!(seen.insert(spec.id), "معرّف قائمة مكرّر: {}", spec.id);
        }
        for entry in all_entries() {
            if let Some(id) = id_of(entry) {
                assert!(seen.insert(id), "معرّف عنصر مكرّر: {id}");
            }
        }
    }

    #[test]
    fn no_shortcut_is_used_twice() {
        let mut seen = HashSet::new();
        for entry in all_entries() {
            if let Some(accelerator) = accelerator_of(entry) {
                assert!(seen.insert(accelerator), "اختصار مكرّر: {accelerator}");
            }
        }
    }

    #[test]
    fn every_shortcut_parses_or_it_vanishes_without_a_sound() {
        // تاوري يبتلع فشل التحليل (`parse().ok()`)، فيصير العنصر بلا اختصار
        // بلا خطأ ولا سطر في سجل: يُفحص هنا بالمحلّل نفسه
        for entry in all_entries() {
            if let Some(accelerator) = accelerator_of(entry) {
                assert!(
                    accelerator
                        .parse::<muda::accelerator::Accelerator>()
                        .is_ok(),
                    "اختصار لا يُحلَّل فيختفي بصمت: {accelerator}"
                );
            }
        }
    }

    #[test]
    fn every_identifier_the_shell_uses_exists_in_the_board() {
        let ids: Vec<&str> = all_entries().iter().filter_map(|e| id_of(e)).collect();
        for referenced in [
            PRIMARY_ACTION_ID,
            MODULE_ITEM_NASAQ,
            MODULE_ITEM_SHADHB,
            PANE_ITEM_SOURCE,
            PANE_ITEM_RESULT,
        ] {
            assert!(ids.contains(&referenced), "معرّف يناديه الكود ولا وجود له: {referenced}");
        }
        for handled in SHELL_HANDLED {
            assert!(ids.contains(handled), "عنصر تنفّذه القشرة ولا وجود له: {handled}");
        }
    }

    #[test]
    fn only_what_the_shell_executes_starts_enabled() {
        // البقية تفتحها الواجهة حين تجهز، فلا يضيع فعلٌ قبل أن يوجد سامعه
        for entry in all_entries() {
            let id = match entry {
                Action { id, .. } | Check { id, .. } => *id,
                _ => continue,
            };
            assert_eq!(
                starts_enabled(id),
                SHELL_HANDLED.contains(&id),
                "حالة البدء لـ {id}"
            );
        }
        assert!(starts_enabled("app.settings"), "الإعدادات تفتحها القشرة بنفسها");
        assert!(!starts_enabled(PRIMARY_ACTION_ID), "الفعل الرئيس يعمل بلا واجهة");
    }

    #[test]
    fn the_primary_action_is_one_item_with_a_fixed_shortcut_and_two_names() {
        let primary = all_entries()
            .into_iter()
            .find(|e| id_of(e) == Some(PRIMARY_ACTION_ID))
            .expect("الفعل الرئيس غائب");
        assert_eq!(accelerator_of(primary), Some("Cmd+Enter"));
        match primary {
            Action { title, .. } => assert_eq!(*title, PRIMARY_TITLE_NASAQ),
            _ => panic!("الفعل الرئيس ليس عنصر فعل"),
        }
        assert_ne!(PRIMARY_TITLE_NASAQ, PRIMARY_TITLE_SHADHB);
        assert!(!PRIMARY_TITLE_SHADHB.is_empty());
    }

    #[test]
    fn the_primary_name_follows_the_visible_module() {
        assert_eq!(primary_title("nasaq"), PRIMARY_TITLE_NASAQ);
        assert_eq!(primary_title(""), PRIMARY_TITLE_NASAQ);
        assert_eq!(primary_title("  shadhb  "), PRIMARY_TITLE_SHADHB);
        // وحدة لا يعرفها الشريط لا تُسمّي الفعل باسم برج آخر
        assert_eq!(primary_title("nothing"), PRIMARY_TITLE_NASAQ);
    }

    #[test]
    fn the_modules_and_panes_are_check_items_with_one_checked_each() {
        let checked: Vec<&str> = all_entries()
            .into_iter()
            .filter_map(|e| match e {
                Check { id, checked: true, .. } => Some(*id),
                _ => None,
            })
            .collect();
        assert_eq!(checked, vec!["view.module.nasaq", "view.pane.result"]);
    }

    #[test]
    fn the_shell_names_commands_but_holds_no_tower_logic() {
        // القشرة تسمّي الأمرين كما رُسما، ولا تعرف أيهما نشط: الواجهة تبدّل الاسم
        // الفحص على الشيفرة دون كتلة الاختبارات: هي نفسها تذكر الممنوع نصًّا
        let source = include_str!("menu.rs");
        let code = source.split("#[cfg(test)]").next().unwrap();
        assert!(code.contains(PRIMARY_TITLE_SHADHB));
        assert!(!code.contains("prune_text"), "القشرة تنادي نداء برج");
        assert!(!code.contains("format_text"), "القشرة تنادي نداء برج");
        assert!(!code.contains("crate::nasaq"), "القشرة تستورد من برج");
        assert!(!code.contains("crate::shadhb"), "القشرة تستورد من برج");
        // وبنيويًا لا نصيًّا: كل استيراد في الملف من تاوري أو من نوعه المحلي
        for line in code.lines().map(str::trim).filter(|l| l.starts_with("use ")) {
            assert!(
                line.starts_with("use tauri::") || line.starts_with("use Entry::") || line.starts_with("use System::"),
                "استيراد غير متوقع في القشرة: {line}"
            );
        }
    }
}
