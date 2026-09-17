// هيكل النافذة الرئيسية — ما يخص النافذة نفسها لا برجًا ولا عقدًا: حقن الأيقونات
// وإعلان الجاهزية، وإظهار الألواح وطيّها، والعرض «الأصل | النتيجة»، وأقسام
// المفتّش، وطيّ شريط الأدوات عند الضيق، والقوائم. لا يعرف دالة من دوال الأبراج:
// يقرأ السمات والعناصر المعلَّمة فقط، والأبراج لا تعرفه.
(() => {
  const root = document.documentElement;
  const win = document.getElementById("window");
  const content = document.getElementById("content");
  const toolbar = document.getElementById("toolbar");
  const tauri = window.__TAURI__;

  // خارج التطبيق لا يحقن إطار النافذة اتجاه شريط العنوان، فيُفترض نظام عربي
  if (!tauri) root.dataset.preview = "";
  if (!root.dataset.titlebar) root.dataset.titlebar = "rtl";

  const px = (name) => parseFloat(getComputedStyle(root).getPropertyValue(name)) || 0;

  // ---------- الألواح: الشريط الجانبي والمفتّش ----------
  // التفضيل ما اختاره الكاتب، والظاهر يُشتق منه ومن العرض: إن ضاقت النافذة عن
  // اللوحين والمحتوى معًا طُوي الأقدم فتحًا، ويعود حين تتسع (Figma 100:1047)
  const PANELS_KEY = "nasaq-panels";
  const prefs = { sidebar: true, inspector: true, last: "inspector" };
  try {
    Object.assign(prefs, JSON.parse(localStorage.getItem(PANELS_KEY)) || {});
  } catch {
    // تفضيل تالف أو تخزين محجوب: تبقى القيم الافتراضية
  }

  function applyPanels() {
    let sidebar = prefs.sidebar;
    let inspector = prefs.inspector;
    const needed = px("--layout-sidebar") + px("--layout-inspector") + px("--layout-content-min");
    if (sidebar && inspector && window.innerWidth < needed) {
      if (prefs.last === "sidebar") inspector = false;
      else sidebar = false;
    }
    win.dataset.sidebar = sidebar ? "open" : "hidden";
    win.dataset.inspector = inspector ? "open" : "hidden";
    document.getElementById("sidebar").inert = !sidebar;
    document.getElementById("inspector").inert = !inspector;
    for (const b of document.querySelectorAll('[data-command="toggle-inspector"]')) {
      b.setAttribute("aria-pressed", String(inspector));
    }
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

  // ⌃⌘S للشريط الجانبي و⌥⌘I للمفتّش، كما في قائمة «عرض» في Figma — ولا
  // تعمل تحت ورقة مفتوحة
  document.addEventListener("keydown", (e) => {
    if (!e.metaKey || document.querySelector('[aria-modal="true"]:not([hidden])')) return;
    if (e.ctrlKey && !e.altKey && e.code === "KeyS") {
      e.preventDefault();
      togglePanel("sidebar");
    } else if (e.altKey && !e.ctrlKey && e.code === "KeyI") {
      e.preventDefault();
      togglePanel("inspector");
    }
  });

  // ---------- العرض: «الأصل | النتيجة» في العمود الواحد ----------
  function setView(view) {
    content.dataset.view = view;
    for (const seg of content.querySelectorAll("[data-view-target]")) {
      seg.setAttribute("aria-selected", String(seg.dataset.viewTarget === view));
    }
  }

  content.addEventListener("click", (e) => {
    const seg = e.target.closest("[data-view-target]");
    if (seg) setView(seg.dataset.viewTarget);
  });
  content.querySelector(".view-picker").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = content.dataset.view === "source" ? "result" : "source";
    setView(next);
    content.querySelector(`[data-view-target="${next}"]`).focus();
  });

  // بدء التنسيق أو ظهور نتيجة جديدة ينقل العمود الواحد إلى «النتيجة» — لا يرى
  // الكاتب عمودًا يعمل خلف عمود آخر
  new MutationObserver((records) => {
    for (const r of records) {
      const node = r.target.nodeType === 1 ? r.target : r.target.parentElement;
      const target = node && node.closest("[data-reveals-result]");
      if (!target || target.closest("[data-for]").dataset.for !== root.dataset.module) continue;
      if (r.type === "attributes" ? !target.hidden : target.textContent.trim()) {
        setView("result");
        return;
      }
    }
  }).observe(content.querySelector(".compare"), {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["hidden"],
  });

  // ---------- أقسام المفتّش ----------
  document.getElementById("inspector").addEventListener("click", (e) => {
    const header = e.target.closest(".section-header");
    if (header) header.setAttribute("aria-expanded", String(header.getAttribute("aria-expanded") !== "true"));
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
  // قائمة داخل النافذة بخطَّي التطبيق ومقاسات macOS 27: بنود ٢٤، سهام وEsc وReturn
  let menu = null;

  function closeMenu(restoreFocus = true) {
    if (!menu) return;
    const { el, anchor } = menu;
    menu = null;
    el.remove();
    anchor.setAttribute("aria-expanded", "false");
    if (restoreFocus) anchor.focus();
  }

  // sections: [[{ label, disabled, run }], …] — بين كل قسمين فاصل
  function openMenu(anchor, sections) {
    closeMenu(false);
    const el = document.createElement("div");
    el.className = "menu";
    el.setAttribute("role", "menu");
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
    document.body.appendChild(el);

    // تحت الزر ومحاذاة بدايته، ومحصورة داخل النافذة
    const r = anchor.getBoundingClientRect();
    const margin = 8;
    const w = el.offsetWidth;
    let left = r.right - w;
    left = Math.max(margin, Math.min(left, window.innerWidth - margin - w));
    el.style.left = left + "px";
    el.style.top = r.bottom + 4 + "px";
    el.style.maxBlockSize = Math.max(96, window.innerHeight - r.bottom - 4 - margin) + "px";

    anchor.setAttribute("aria-expanded", "true");
    menu = { el, anchor };
    // قائمة بنودها كلها معطّلة تأخذ التركيز بنفسها ليعمل Esc والسهام
    el.tabIndex = -1;
    (el.querySelector(".menu-item:not(:disabled)") || el).focus();

    el.addEventListener("keydown", (e) => {
      const items = [...el.querySelectorAll(".menu-item:not(:disabled)")];
      const i = items.indexOf(document.activeElement);
      if (e.key === "ArrowDown") {
        e.preventDefault();
        items[(i + 1) % items.length]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        items[(i - 1 + items.length) % items.length]?.focus();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeMenu();
      } else if (e.key === "Tab") {
        closeMenu(false);
      }
    });
  }

  document.addEventListener("mousedown", (e) => {
    if (menu && !menu.el.contains(e.target) && !menu.anchor.contains(e.target)) closeMenu(false);
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
    openMenu(anchor, [proxyItems([...source.querySelectorAll("button")])]);
  });

  // ---------- شريط الأدوات: الطي عند الضيق ----------
  // تُطوى المجموعات بترتيب data-collapse وتختفي التسميات بترتيب
  // data-collapse-labels حتى تبقى بين طرفي الشريط مسافة مرنة لا تقل عن ١٤٠ —
  // القيمة التي تعيد متغيرات Figma الثلاثة كما رُسمت (١٠٢٤ و٧٦٠ و٥٢٤)
  const MIN_FLEX = 140;
  const flex = toolbar.querySelector(".toolbar-flex");
  const overflowGroup = toolbar.querySelector(".overflow-group");
  const overflowButton = overflowGroup.querySelector("[data-overflow-button]");

  const activeToolbar = () => toolbar.querySelector(`.toolbar-module[data-for="${root.dataset.module}"]`);

  function layoutToolbar() {
    for (const n of toolbar.querySelectorAll("[data-collapsed]")) n.removeAttribute("data-collapsed");
    for (const n of toolbar.querySelectorAll("[data-labels-hidden]")) n.removeAttribute("data-labels-hidden");
    overflowGroup.hidden = true;
    const module = activeToolbar();
    if (!module || !toolbar.clientWidth) return;

    const steps = [
      ...[...module.querySelectorAll("[data-collapse]")].map((n) => ({ order: +n.dataset.collapse, node: n, attr: "data-collapsed" })),
      ...[...module.querySelectorAll("[data-collapse-labels]")].map((n) => ({ order: +n.dataset.collapseLabels, node: n, attr: "data-labels-hidden" })),
    ].sort((a, b) => a.order - b.order);

    for (const step of steps) {
      if (flex.getBoundingClientRect().width >= MIN_FLEX) break;
      step.node.setAttribute(step.attr, "");
      if (step.attr === "data-collapsed") overflowGroup.hidden = false;
    }
    if (menu && menu.anchor === overflowButton && overflowGroup.hidden) closeMenu(false);
  }

  overflowButton.addEventListener("click", () => {
    if (menu && menu.anchor === overflowButton) return closeMenu();
    const module = activeToolbar();
    const groups = module ? [...module.querySelectorAll("[data-collapsed]")] : [];
    openMenu(overflowButton, groups.map((g) => proxyItems([...g.querySelectorAll("button")])));
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
  new ResizeObserver(scheduleLayout).observe(toolbar);
  new MutationObserver((records) => {
    scheduleLayout();
    if (records.some((r) => r.attributeName === "data-module")) markModuleSwitch();
  }).observe(root, { attributes: true, attributeFilter: ["data-module", "data-titlebar", "data-fullscreen"] });

  // تلاشي الوحدة يعمل عند التبديل وحده، لا عند أول ظهور ولا عند كل رسم
  let switchTimer = null;
  function markModuleSwitch() {
    if (!root.hasAttribute("data-ready")) return;
    root.removeAttribute("data-module-switching");
    void root.offsetWidth; // يعيد تشغيل الحركة إن جاء تبديل قبل انتهاء السابق
    root.setAttribute("data-module-switching", "");
    clearTimeout(switchTimer);
    switchTimer = setTimeout(() => root.removeAttribute("data-module-switching"), 400);
  }
  // ظهور زر أو اختفاؤه (تصدير سابستاك، الجسر إلى نَسَق) يعيد الحساب — وزر
  // «المزيد» نفسه مستثنى لأن الحساب هو من يكتبه
  new MutationObserver((records) => {
    if (records.some((r) => r.target !== overflowGroup)) scheduleLayout();
  }).observe(toolbar, { subtree: true, attributes: true, attributeFilter: ["hidden"] });

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
        document.fonts.load('400 13px "Almarai"'),
        document.fonts.load('700 13px "Almarai"'),
        document.fonts.load('600 17px "Cairo"'),
      ]).catch(() => {})
    : Promise.resolve();

  Promise.all([icons, fonts]).then(() => {
    layoutToolbar();
    tauri?.core?.invoke("main_window_ready").catch(() => {});
    // الحركة تبدأ بعد الظهور: لا ينزلق لوح ولا تتلاشى وحدة في أول إطار
    setTimeout(() => root.setAttribute("data-ready", ""), 300);
  });
})();
