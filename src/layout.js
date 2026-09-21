// هيكل النافذة الرئيسية — ما يخص النافذة نفسها لا برجًا ولا عقدًا: حقن الأيقونات
// وإعلان الجاهزية، وإظهار لوحة المسودات ولوح المراجعة، والعرض «الأصل | النتيجة»،
// وعروض اللوحة (التقرير)، وطيّ صفّ الأدوات عند الضيق، والقوائم والأوراق
// والتنبيهات والنوافذ المنبثقة داخل النافذة. لا يعرف دالة من دوال الأبراج: يقرأ السمات والعناصر
// المعلَّمة فقط، ويعطي القشرة والأبراج واجهة عامة للنوافذ (NasaqWindow) لا
// تحمل منطق أي منها.
(() => {
  const root = document.documentElement;
  const win = document.getElementById("window");
  const content = document.getElementById("content");
  const tauri = window.__TAURI__;

  // خارج التطبيق لا يحقن إطار النافذة اتجاه شريط العنوان، فيُفترض نظام عربي
  if (!tauri) root.dataset.preview = "";
  if (!root.dataset.titlebar) root.dataset.titlebar = "rtl";

  const MARGIN = 8;
  const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
  const modalOpen = () => Boolean(document.querySelector('[aria-modal="true"]:not([hidden])'));

  // ---------- الألواح: لوحة المسودات ولوح المراجعة ----------
  // التفضيل ما اختاره الكاتب. لوحة المسودات مغلقة حتى تُطلب (NsqV272: «المسودات»
  // في شريط العنوان تفتحها)، ولوح المراجعة يتبع حالة وحدته ما لم يطوِه الكاتب.
  // والمفتاح جديد: تفضيل الهيكل السابق (لوحان مفتوحان) لا يُورَّث
  const PANELS_KEY = "nasaq-panels-v272";
  const prefs = { sidebar: false, inspector: true, last: "inspector" };
  try {
    Object.assign(prefs, JSON.parse(localStorage.getItem(PANELS_KEY)) || {});
  } catch {
    // تفضيل تالف أو تخزين محجوب: تبقى القيم الافتراضية
  }

  function applyPanels() {
    const sidebar = prefs.sidebar;
    const inspector = prefs.inspector;
    // لوحٌ يُطوى والتركيز فيه يُسقطه إلى الصفحة (inert)، فيبدأ Tab من رأسها. في
    // الماك ينتقل التركيز إلى المحتوى: أول ما يقبله في العمود الظاهر (فحص m4-07)
    const leaving = [["sidebar", sidebar], ["inspector", inspector]].some(
      ([id, open]) => !open && document.getElementById(id).contains(document.activeElement)
    );
    win.dataset.sidebar = sidebar ? "open" : "hidden";
    win.dataset.inspector = inspector ? "open" : "hidden";
    document.getElementById("sidebar").inert = !sidebar;
    document.getElementById("inspector").inert = !inspector;
    if (leaving) {
      const usable = (n) => !n.disabled && n.offsetParent !== null && !n.closest("[inert]");
      const target =
        [...content.querySelectorAll("textarea")].find(usable) ||
        [...content.querySelectorAll("button, [tabindex='0']")].find(usable);
      target?.focus();
    }
    for (const b of document.querySelectorAll("[data-command][aria-pressed]")) {
      b.setAttribute("aria-pressed", String(b.dataset.command === "toggle-sidebar" ? sidebar : inspector));
    }
    window.NasaqMenu.sync();
  }

  function togglePanel(panel) {
    const visible = win.dataset[panel] === "open";
    prefs[panel] = !visible;
    if (!visible) prefs.last = panel;
    try {
      localStorage.setItem(PANELS_KEY, JSON.stringify(prefs));
    } catch {
      // تعذّر الحفظ لا يمنع التبديل في الجلسة الحالية
    }
    applyPanels();
  }

  document.addEventListener("click", (e) => {
    const command = e.target.closest("[data-command]");
    if (command) togglePanel(command.dataset.command === "toggle-sidebar" ? "sidebar" : "inspector");
  });

  // ⌃⌘S للشريط الجانبي و⌥⌘I للمفتّش، و⌥⌘1 و⌥⌘2 للأصل والنتيجة — كلها
  // مسرّعات في قائمة «عرض» الأصلية (المرحلة ٧-ب)، فلا مستمع لوحة مفاتيح هنا.
  // اسم العنصر يتبع الحالة كما في الماك: «إظهار» حين يكون مطويًا و«إخفاء»
  // حين يكون ظاهرًا — واللوحة رسمت حالة واحدة منهما
  const PANEL_ITEMS = {
    sidebar: { id: "view.sidebar", shown: "إخفاء الشريط الجانبي", hidden: "إظهار الشريط الجانبي" },
    inspector: { id: "view.inspector", shown: "إخفاء المفتّش", hidden: "إظهار المفتّش" },
  };

  for (const [panel, item] of Object.entries(PANEL_ITEMS)) {
    window.NasaqMenu.register(item.id, () => togglePanel(panel), {
      title: () => (win.dataset[panel] === "open" ? item.shown : item.hidden),
    });
  }
  window.NasaqMenu.register("view.pane.source", () => setView("source"));
  window.NasaqMenu.register("view.pane.result", () => setView("result"));

  // ---------- النافذة الأمامية ----------
  // التحديد في الشريط الجانبي يصير محايدًا حين تغادر النافذة المقدمة، كما في الماك
  const syncActive = () => root.toggleAttribute("data-inactive", !document.hasFocus());
  window.addEventListener("focus", syncActive);
  window.addEventListener("blur", syncActive);
  syncActive();

  // ---------- العرض: «الأصل | النتيجة» في العمود الواحد ----------
  function setView(view) {
    content.dataset.view = view;
    for (const seg of document.querySelectorAll("[data-view-target]")) {
      seg.setAttribute("aria-selected", String(seg.dataset.viewTarget === view));
    }
    window.NasaqMenu.setPane(view);
  }

  // مبدّل العرض في شريط النافذة لا في المحتوى (قرار المالك m5)، فالبحث عن عناصره
  // من المستند لا من المحتوى — وكان قصرُه على المحتوى يُسقط الهيكل كله حين انتقل
  const viewPicker = document.querySelector(".view-picker");
  document.addEventListener("click", (e) => {
    const seg = e.target.closest("[data-view-target]");
    if (seg) setView(seg.dataset.viewTarget);
  });
  viewPicker.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = content.dataset.view === "source" ? "result" : "source";
    setView(next);
    viewPicker.querySelector(`[data-view-target="${next}"]`).focus();
  });

  // ظهور عنصر معلَّم ينقل العمود الواحد إلى عموده: بدء التنسيق أو نتيجة جديدة
  // إلى «النتيجة»، وتنبيه فوق الأصل إلى «الأصل» — لا يرى الكاتب عمودًا يعمل خلف
  // عمود آخر. العنصر المشترك (بلا data-for) يخص الوحدة الفعّالة أيًّا كانت
  const REVEALS = [
    ["[data-reveals-result]", "result"],
    ["[data-reveals-source]", "source"],
  ];
  new MutationObserver((records) => {
    for (const r of records) {
      const node = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      for (const [selector, view] of REVEALS) {
        const target = node && node.closest(selector);
        if (!target) continue;
        const owner = target.closest("[data-for]");
        if (owner && owner.dataset.for !== root.dataset.module) continue;
        if (r.type === "attributes" ? !target.hidden : target.textContent.trim()) {
          setView(view);
          return;
        }
      }
    }
  }).observe(content.querySelector(".compare"), {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["hidden"],
  });

  // ---------- أقسام لوح المراجعة ----------
  document.getElementById("inspector").addEventListener("click", (e) => {
    const header = e.target.closest(".section-header");
    if (header) header.setAttribute("aria-expanded", String(header.getAttribute("aria-expanded") !== "true"));
  });

  // ---------- عروض اللوحة: عرضٌ يملأ اللوحة حين يُطلب (التقرير) ----------
  // الزر يسمّي عرضه بـ data-canvas-open، والعرض يُغلق بـ data-canvas-close أو Esc،
  // ويعود التركيز إلى الزر الذي فتحه. تبديل الوحدة يُغلقه: العرض يخصّ وحدته
  let canvasOpener = null;
  function setCanvas(name, opener = null) {
    if (name) content.dataset.canvas = name;
    else delete content.dataset.canvas;
    if (name) {
      canvasOpener = opener;
      content.querySelector(".canvas-view:not([hidden]) [data-canvas-close]")?.focus();
    } else if (canvasOpener && canvasOpener.isConnected && !canvasOpener.disabled) {
      canvasOpener.focus();
      canvasOpener = null;
    }
  }
  document.addEventListener("click", (e) => {
    const open = e.target.closest("[data-canvas-open]");
    if (open) return setCanvas(open.dataset.canvasOpen, open);
    if (e.target.closest("[data-canvas-close]")) setCanvas(null);
  });
  content.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !content.dataset.canvas || modalOpen()) return;
    e.preventDefault();
    setCanvas(null);
  });

  // ---------- المحرر: يتمدد مع نصه حين لا يدعم المحرك field-sizing ----------
  if (!(window.CSS && CSS.supports("field-sizing", "content"))) {
    const grow = (ta) => {
      ta.style.blockSize = "auto";
      ta.style.blockSize = ta.scrollHeight + (ta.offsetHeight - ta.clientHeight) + "px";
    };
    for (const ta of document.querySelectorAll("textarea.editor, textarea.text-area")) {
      ta.addEventListener("input", () => grow(ta));
      new ResizeObserver(() => grow(ta)).observe(ta.parentElement);
      grow(ta);
    }
  }

  // ---------- القوائم ----------
  // قائمة داخل النافذة بخطَّي التطبيق ومقاسات macOS 27: بنود ٢٤، سهام وEsc وReturn.
  // تُفتح من زر (تحته أو فوقه إن ضاقت النافذة) أو من موضع المؤشر (قائمة سياقية)
  let menu = null;

  function closeMenu(restoreFocus = true) {
    if (!menu) return;
    const { el, anchor, returnFocus, onClose } = menu;
    menu = null;
    el.remove();
    if (anchor) anchor.setAttribute("aria-expanded", "false");
    if (restoreFocus && returnFocus && returnFocus.isConnected) returnFocus.focus();
    if (onClose) onClose();
  }

  // sections: [[{ label, disabled, destructive, run }], …] — بين كل قسمين فاصل
  function buildMenu(sections, label) {
    const el = document.createElement("div");
    el.className = "menu";
    el.setAttribute("role", "menu");
    if (label) el.setAttribute("aria-label", label);
    sections.filter((s) => s.length).forEach((section, i) => {
      if (i > 0) {
        const sep = document.createElement("div");
        sep.className = "menu-separator";
        sep.setAttribute("role", "separator");
        el.appendChild(sep);
      }
      for (const item of section) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "menu-item";
        b.classList.toggle("is-destructive", Boolean(item.destructive));
        b.setAttribute("role", "menuitem");
        b.textContent = item.label;
        b.disabled = Boolean(item.disabled);
        b.addEventListener("click", () => {
          closeMenu();
          item.run();
        });
        el.appendChild(b);
      }
    });
    return el;
  }

  // تمييز واحد كما في قوائم الماك: يتبع المؤشر، والسهام تحرّكه. المفتوحة بلوحة
  // المفاتيح تبدأ ببندها الأول مميّزًا، والمفتوحة بالفأرة بلا تمييز حتى يمرّ المؤشر
  function showMenu(el, place, { anchor = null, returnFocus = null, onClose = null, keyboard = false } = {}) {
    closeMenu(false);
    dismissPopover(false);
    document.body.appendChild(el);
    place(el);
    if (anchor) anchor.setAttribute("aria-expanded", "true");
    menu = { el, anchor, returnFocus: returnFocus || anchor, onClose };
    // القائمة نفسها تأخذ التركيز حين لا بند مميّز، ليعمل Esc والسهام
    el.tabIndex = -1;
    ((keyboard && el.querySelector(".menu-item:not(:disabled)")) || el).focus();
    el.addEventListener("mousemove", (e) => {
      const item = e.target.closest(".menu-item:not(:disabled)");
      if (item && document.activeElement !== item) item.focus();
    });
    el.addEventListener("mouseleave", () => el.focus());

    el.addEventListener("keydown", (e) => {
      const items = [...el.querySelectorAll(".menu-item:not(:disabled)")];
      const i = items.indexOf(document.activeElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        items[(i + 1) % items.length]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        // بلا بند مميّز (فُتحت بالفأرة) يبدأ السهم للأعلى من آخر بند
        items[i === -1 ? items.length - 1 : (i - 1 + items.length) % items.length]?.focus();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
      } else if (e.key === "Tab") {
        closeMenu(false);
      }
    });
  }

  // تحت الزر أو فوقه، ومحاذاة بدايته (يمينه) أو نهايته (يساره) حين تطلب المرساة
  // ذلك بـ align: "end" — وتبقى داخل النافذة دائمًا
  function openMenu(anchor, sections, { align = "start", label, onClose, keyboard = false } = {}) {
    showMenu(
      buildMenu(sections, label),
      (el) => {
        const r = anchor.getBoundingClientRect();
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const left = align === "end" ? r.left : r.right - w;
        el.style.left = clamp(left, MARGIN, window.innerWidth - MARGIN - w) + "px";
        const below = window.innerHeight - r.bottom - 4 - MARGIN;
        const above = r.top - 4 - MARGIN;
        if (h > below && above > below) {
          el.style.top = Math.max(MARGIN, r.top - 4 - h) + "px";
          el.style.maxBlockSize = above + "px";
        } else {
          el.style.top = r.bottom + 4 + "px";
          el.style.maxBlockSize = Math.max(96, below) + "px";
        }
      },
      { anchor, onClose, keyboard }
    );
  }

  // قائمة سياقية: ركنها الأيمن عند المؤشر (RTL)، وتنقلب إلى فوقه أو يساره عند الحافة
  function openMenuAt(x, y, sections, { label, returnFocus, onClose, keyboard = false } = {}) {
    showMenu(
      buildMenu(sections, label),
      (el) => {
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        let left = x - w;
        if (left < MARGIN) left = x;
        let top = y;
        if (top + h > window.innerHeight - MARGIN) top = y - h;
        el.style.left = clamp(left, MARGIN, window.innerWidth - MARGIN - w) + "px";
        el.style.top = clamp(top, MARGIN, window.innerHeight - MARGIN - h) + "px";
      },
      { returnFocus, onClose, keyboard }
    );
  }

  document.addEventListener("mousedown", (e) => {
    if (menu && !menu.el.contains(e.target) && !(menu.anchor && menu.anchor.contains(e.target))) closeMenu(false);
    if (popover && !popover.el.contains(e.target) && !popover.anchor.contains(e.target)) dismissPopover(false);
  });
  window.addEventListener("blur", () => closeMenu(false));

  // عنصر يفتح قائمة من أزرار مخفية: كل بند ينقر زره الأصلي فتبقى مستمعاته كما هي
  const proxyItems = (buttons) =>
    buttons
      .filter((b) => !b.hidden)
      .map((b) => ({ label: b.getAttribute("aria-label") || b.textContent.trim(), disabled: b.disabled, run: () => b.click() }));

  document.addEventListener("click", (e) => {
    const anchor = e.target.closest("[data-menu]");
    if (!anchor) return;
    if (menu && menu.anchor === anchor) return closeMenu();
    const source = document.getElementById(anchor.dataset.menu);
    // نقرة بلا مؤشر (detail = 0) جاءت من Return أو المسافة
    openMenu(anchor, [proxyItems([...source.querySelectorAll("button")])], { align: anchor.dataset.menuAlign, keyboard: e.detail === 0 });
  });

  // ---------- الأوراق والتنبيهات: نافذة واحدة فوق النافذة ----------
  // الورقة والتنبيه خارج #window: يصير ما تحتهما خاملًا (inert) فيبقى التركيز
  // داخلهما، ويعود حيث كان عند الإغلاق. Esc وReturn يقررهما صاحب الورقة
  const modals = [];
  const focusable = (node) => node && node.isConnected && !node.disabled && node.offsetParent !== null && !node.closest("[inert]");

  // fallbackFocus: عنصر أو دالة تعيده — حين يزول ما كان عليه التركيز أو يتعطّل
  function presentModal(el, { initialFocus, fallbackFocus } = {}) {
    if (modals.some((m) => m.el === el)) return;
    closeMenu(false);
    dismissPopover(false);
    modals.push({ el, returnFocus: document.activeElement, fallbackFocus });
    win.inert = true;
    el.hidden = false;
    const target = (initialFocus && el.querySelector(initialFocus)) || el.querySelector("button:not(:disabled)") || el;
    if (target === el) el.tabIndex = -1;
    target.focus();
  }

  function dismissModal(el) {
    const i = modals.findIndex((m) => m.el === el);
    if (i === -1) return;
    const [{ returnFocus, fallbackFocus }] = modals.splice(i, 1);
    const hadFocus = el.contains(document.activeElement);
    el.hidden = true;
    if (!modals.length) win.inert = false;
    if (!hadFocus && document.activeElement !== document.body) return;
    const fallback = typeof fallbackFocus === "function" ? fallbackFocus() : fallbackFocus;
    const target = [returnFocus, fallback].find(focusable);
    if (target) target.focus();
  }

  // Tab يدور داخل الورقة المفتوحة ولا يغادرها — ولو كان التركيز على عنصر خارج
  // سلسلة Tab نفسها (عمود مركَّز بعد «أعد المحاولة» مثلًا)
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Tab" || !modals.length) return;
    const { el } = modals[modals.length - 1];
    const focusables = [...el.querySelectorAll("button:not(:disabled), [href], input:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex='-1'])")].filter((n) => n.offsetParent);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    const i = focusables.indexOf(document.activeElement);
    if (i === -1) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && i === 0) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && i === focusables.length - 1) {
      e.preventDefault();
      first.focus();
    }
  });

  // ---------- النوافذ المنبثقة ----------
  // تحت الزر بسهم يشير إلى وسطه (Figma 261:6648)، وتغلق بنقرة خارجها أو Esc
  let popover = null;
  const ARROW = 10;

  function positionPopover() {
    if (!popover) return;
    const { el, anchor } = popover;
    // المرساة اختفت (اتسعت النافذة فزال «المزيد» مثلًا): لا نافذة منبثقة بلا مرساة
    if (!anchor.isConnected || anchor.offsetParent === null) return dismissPopover(false);
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const centre = r.left + r.width / 2;
    const left = clamp(Math.round(centre - w / 2), MARGIN, window.innerWidth - MARGIN - w);
    const top = Math.round(r.bottom + 4 + ARROW);
    el.style.left = left + "px";
    el.style.top = top + "px";
    el.style.maxBlockSize = window.innerHeight - top - MARGIN + "px";
    el.style.setProperty("--arrow-x", Math.round(centre - left) + "px");
  }

  // control: الزر الذي يملك النافذة (aria-expanded) حين تُرسَم عند مرساة أخرى، كزر
  // «المزيد» الذي طُوي فيه
  function presentPopover(el, anchor, { onClose, control = anchor } = {}) {
    if (popover && popover.el === el) return dismissPopover();
    dismissPopover(false);
    closeMenu(false);
    popover = { el, anchor, control, onClose, returnFocus: document.activeElement };
    el.hidden = false;
    positionPopover();
    if (!popover) return;
    control.setAttribute("aria-expanded", "true");
    el.tabIndex = -1;
    el.focus();
  }

  function dismissPopover(restoreFocus = true) {
    if (!popover) return;
    const { el, anchor, control, onClose, returnFocus } = popover;
    popover = null;
    el.hidden = true;
    control.setAttribute("aria-expanded", "false");
    if (restoreFocus && el.contains(document.activeElement)) [control, anchor, returnFocus].find(focusable)?.focus();
    if (onClose) onClose();
  }

  window.addEventListener("resize", positionPopover);

  window.NasaqWindow = {
    showView: setView,
    openMenu,
    openMenuAt,
    presentModal,
    dismissModal,
    presentPopover,
    dismissPopover,
    isModalOpen: modalOpen,
  };

  // ---------- صفّ أدوات النتيجة: الطي عند الضيق ----------
  // الصفّ يملأ عرض لوح النتيجة، فقاعدته أن تتّسع أدواته فيه: تُطوى المجموعات
  // بترتيب data-collapse حتى لا يفيض محتواه عن حدّه، وما طُوي يصير في «⋯»
  const tools = document.getElementById("editor-tools");
  const overflowGroup = tools.querySelector(".overflow-group");
  const overflowButton = overflowGroup.querySelector("[data-overflow-button]");

  const activeToolbar = () => tools.querySelector(`.toolbar-module[data-for="${root.dataset.module}"]`);

  function layoutToolbar() {
    for (const n of tools.querySelectorAll("[data-collapsed]")) n.removeAttribute("data-collapsed");
    for (const n of tools.querySelectorAll("[data-labels-hidden]")) n.removeAttribute("data-labels-hidden");
    overflowGroup.hidden = true;
    const module = activeToolbar();
    if (!module || !content.clientWidth) return;

    const steps = [
      ...[...module.querySelectorAll("[data-collapse]")].map((n) => ({ order: +n.dataset.collapse, node: n, attr: "data-collapsed" })),
      ...[...module.querySelectorAll("[data-collapse-labels]")].map((n) => ({ order: +n.dataset.collapseLabels, node: n, attr: "data-labels-hidden" })),
    ].sort((a, b) => a.order - b.order);

    const fits = () => tools.scrollWidth <= tools.clientWidth + 1;
    for (const step of steps) {
      if (fits()) break;
      step.node.setAttribute(step.attr, "");
      if (step.attr === "data-collapsed") overflowGroup.hidden = false;
    }
    if (menu && menu.anchor === overflowButton && overflowGroup.hidden) closeMenu(false);
    // طيٌّ أو زوال «المزيد» قد يُخفي مرساة النافذة المنبثقة: تُغلق أو تتبع موضعها الجديد
    if (popover) positionPopover();
  }

  overflowButton.addEventListener("click", (e) => {
    if (menu && menu.anchor === overflowButton) return closeMenu();
    const module = activeToolbar();
    const groups = module ? [...module.querySelectorAll("[data-collapsed]")] : [];
    openMenu(overflowButton, groups.map((g) => proxyItems([...g.querySelectorAll("button")])), { keyboard: e.detail === 0 });
  });

  let queued = false;
  function scheduleLayout() {
    if (queued) return;
    queued = true;
    Promise.resolve().then(() => {
      queued = false;
      layoutToolbar();
    });
  }
  // ---------- النصّ النائب في الحقول المشتركة ----------
  // خانة النص واحدة تخدم البرجين، وكل وحدة تسمّي خامَها باسمه (Figma 108:625
  // و99:557): النصّ النائب يُقرأ من السمة الموافقة للوحدة الفعّالة، فلا يحمل
  // الهيكل اسم برج ولا نصًّا من نصوصه
  function applyModulePlaceholders() {
    for (const field of document.querySelectorAll("[data-placeholders]")) {
      const text = field.getAttribute(`data-placeholder-${root.dataset.module}`);
      if (text !== null) field.placeholder = text;
    }
  }

  new ResizeObserver(scheduleLayout).observe(content);
  new MutationObserver((records) => {
    scheduleLayout();
    if (records.some((r) => r.attributeName === "data-module")) {
      applyModulePlaceholders();
      markModuleSwitch();
      setCanvas(null);
    }
  }).observe(root, { attributes: true, attributeFilter: ["data-module", "data-titlebar", "data-fullscreen"] });

  // تلاشي الوحدة يعمل عند التبديل وحده، لا عند أول ظهور ولا عند كل رسم
  let switchTimer = null;
  function markModuleSwitch() {
    closeMenu(false);
    dismissPopover(false);
    if (!root.hasAttribute("data-ready")) return;
    root.removeAttribute("data-module-switching");
    void root.offsetWidth; // يعيد تشغيل الحركة إن جاء تبديل قبل انتهاء السابق
    root.setAttribute("data-module-switching", "");
    clearTimeout(switchTimer);
    switchTimer = setTimeout(() => root.removeAttribute("data-module-switching"), 400);
  }
  // ظهور زر أو اختفاؤه (الجسر إلى نَسَق) يعيد الحساب — وزر «المزيد» نفسه مستثنى
  // لأن الحساب هو من يكتبه
  new MutationObserver((records) => {
    if (records.some((r) => r.target !== overflowGroup)) scheduleLayout();
  }).observe(tools, { subtree: true, attributes: true, attributeFilter: ["hidden"] });

  // ---------- ملء الشاشة: لا إشارات نافذة فلا حجز لها ----------
  const currentWindow = tauri?.window?.getCurrentWindow?.();
  async function syncFullscreen() {
    if (!currentWindow) return;
    try {
      root.toggleAttribute("data-fullscreen", await currentWindow.isFullscreen());
    } catch {
      // الإذن غائب أو النافذة تُغلق: يبقى الحجز كما هو
    }
  }

  // يُسأل عن ملء الشاشة بعد أن يهدأ تغيير المقاس، ومرة أخرى بعد حركة الخروج —
  // AppKit يغيّر المقاس في بدايتها قبل أن تُعلَن نهايتها
  let fullscreenTimers = [];
  window.addEventListener("resize", () => {
    applyPanels();
    fullscreenTimers.forEach(clearTimeout);
    fullscreenTimers = [setTimeout(syncFullscreen, 150), setTimeout(syncFullscreen, 900)];
  });
  applyModulePlaceholders();
  applyPanels();
  syncFullscreen();

  // ---------- الأيقونات والجاهزية ----------
  // النافذة مخفية حتى تُحقن الأيقونات وتُحمَّل الخطوط، فيأتي أول إطار ظاهر كاملًا.
  // لا requestAnimationFrame هنا: WebKit يعلّقه ما دامت النافذة مخفية
  const icons = fetch("icons.svg")
    .then((r) => r.text())
    .then((svg) => {
      document.getElementById("sprite").innerHTML = svg;
    })
    .catch(() => {});
  const fonts = document.fonts
    ? Promise.all([
        document.fonts.load('400 16px "Almarai"'),
        document.fonts.load('700 16px "Almarai"'),
        document.fonts.load('400 14px "Cairo"'),
        document.fonts.load('500 13px "Cairo"'),
        document.fonts.load('600 13px "Cairo"'),
        document.fonts.load('700 28px "Cairo"'),
      ]).catch(() => {})
    : Promise.resolve();

  Promise.all([icons, fonts]).then(() => {
    layoutToolbar();
    tauri?.core?.invoke("main_window_ready").catch(() => {});
    // الحركة تبدأ بعد الظهور: لا ينزلق لوح ولا تتلاشى وحدة في أول إطار
    setTimeout(() => root.setAttribute("data-ready", ""), 300);
  });
})();
