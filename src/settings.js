// صفحة الإعدادات — تبويبان يُطبَّقان فورًا بلا زر حفظ.
//
// المفتاح لا يعبر الجسر إلى هنا: النواة تحفظه في سلسلة المفاتيح، وتخبر
// الصفحة أنه محفوظ فحسب. فالحقل يبدأ فارغًا بقناع مكان النص، ولا يُرسل منه
// شيء إلا ما يكتبه صاحبه — وإفراغه بعد كتابةٍ محوٌ مقصود.
(() => {
  const { invoke, announceReady, reportPaneHeight } = window.NasaqSecondary;
  const appearance = window.NasaqAppearance;
  const el = (id) => document.getElementById(id);

  const { PROVIDERS, presetFor, menuItems } = window.NasaqProviders;
  const KEY_MASK = "••••••••••••••••••••••••";

  const tabs = [...document.querySelectorAll(".tab")];
  const panes = { general: el("pane-general"), updates: el("pane-updates") };
  const windowTitle = el("window-title");
  const menu = el("picker-menu");

  const apiKeyInput = el("api-key");
  const modelInput = el("model-name");
  const baseUrlInput = el("base-url");
  const providerValue = el("provider-value");
  const appearanceValue = el("appearance-value");

  let view = null;
  let preset = "gemini";
  let keyTouched = false;

  // ---------- العرض ----------

  function lastCheckLabel(seconds) {
    if (!seconds) return "لم يحدث بعد";
    const when = new Date(seconds * 1000);
    const time = when.toLocaleTimeString("ar-u-nu-arab", { hour: "2-digit", minute: "2-digit" });
    const sameDay = when.toDateString() === new Date().toDateString();
    if (sameDay) return `اليوم، ${time}`;
    const date = when.toLocaleDateString("ar-u-nu-arab", { day: "numeric", month: "long" });
    return `${date}، ${time}`;
  }

  function render() {
    if (!view) return;
    preset = presetFor(view.provider, view.baseUrl);
    providerValue.textContent = preset ? PROVIDERS[preset].label : "مخصّص";

    baseUrlInput.value = view.baseUrl;
    modelInput.value = view.model;

    // المزوّد المحلي بلا مفتاح: صفّه يختفي كما يختفي اختبار المفتاح
    const local = view.provider === "ollama";
    apiKeyInput.closest(".form-row").hidden = local;
    apiKeyInput.placeholder = view.keyUnavailable
      ? "تعذّر الوصول إلى المفتاح المحفوظ"
      : view.hasApiKey
        ? KEY_MASK
        : "الصق المفتاح هنا";

    appearanceValue.textContent = appearance.LABELS[appearance.apply(view.appearance)];

    el("auto-updates").setAttribute("aria-checked", String(view.autoUpdates));
    el("update-message").textContent = lastCheckLabel(view.lastUpdateCheck);
    el("update-status").hidden = false;
  }

  async function save(patch) {
    try {
      view = await invoke("save_settings", { patch });
      render();
      measure();
      return true;
    } catch (error) {
      showConnection(String(error), "danger");
      return false;
    }
  }

  // التطبيق فوري فعلًا: ما يُكتب يُحفظ بعد سكتة قصيرة لا عند مغادرة الحقل
  // وحدها — فإغلاق النافذة بعد الكتابة مباشرة لا يُضيّع ما كُتب
  function debounce(fn, ms) {
    let timer = null;
    const run = (...args) => {
      clearTimeout(timer);
      timer = null;
      fn(...args);
    };
    const schedule = (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => run(...args), ms);
    };
    schedule.now = run;
    return schedule;
  }

  const TYPING_PAUSE = 400;

  // ---------- التبويبان ----------

  function setTab(name) {
    for (const tab of tabs) {
      const selected = tab.dataset.tab === name;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      panes[tab.dataset.tab].hidden = !selected;
      if (selected) windowTitle.textContent = tab.querySelector("span").textContent;
    }
    measure();
  }

  // الإطار يتبع اللوح: يُقاس الظاهر منهما
  function measure() {
    reportPaneHeight(Object.values(panes).find((pane) => !pane.hidden));
  }

  for (const tab of tabs) {
    tab.addEventListener("click", () => setTab(tab.dataset.tab));
    tab.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const step = e.key === "ArrowLeft" ? 1 : -1;
      const index = tabs.indexOf(tab);
      const next = tabs[(index + step + tabs.length) % tabs.length];
      next.focus();
      setTab(next.dataset.tab);
    });
  }

  // ---------- قائمة الاختيار ----------

  const picker = window.NasaqForms.attachPicker(menu);
  const openMenu = picker.open;

  el("provider-picker").addEventListener("click", () => {
    openMenu(el("provider-picker"), menuItems(), preset, (value) => {
      const chosen = PROVIDERS[value];
      // تبديل المزوّد يحمل عنوانه ونموذجه معه، ولا يمسّ المفتاح
      save({ provider: chosen.transport, baseUrl: chosen.baseUrl, model: chosen.model });
    });
  });

  el("appearance-picker").addEventListener("click", () => {
    const items = appearance.VALUES.map((value) => ({ value, label: appearance.LABELS[value] }));
    openMenu(el("appearance-picker"), items, view?.appearance ?? "auto", (value) => {
      appearance.apply(value);
      save({ appearance: value });
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && picker.isOpen()) {
      e.preventDefault();
      picker.close();
    }
  });

  // ---------- الحقول ----------

  // إفراغه بعد كتابة محوٌ مقصود، وما دام لم يُمسّ فلا يُرسل منه شيء
  const saveKey = debounce(() => save({ apiKey: apiKeyInput.value }), TYPING_PAUSE);
  apiKeyInput.addEventListener("input", () => {
    keyTouched = true;
    saveKey();
  });
  apiKeyInput.addEventListener("blur", async () => {
    if (!keyTouched) return;
    keyTouched = false;
    // القيمة لا تُمحى من الحقل إلا بعد أن يستقرّ حفظها فعلًا
    if (await save({ apiKey: apiKeyInput.value })) apiKeyInput.value = "";
  });

  const saveModel = debounce(() => save({ model: modelInput.value.trim() }), TYPING_PAUSE);
  modelInput.addEventListener("input", saveModel);
  modelInput.addEventListener("change", () => saveModel.now());

  const saveBaseUrl = debounce(() => save({ baseUrl: baseUrlInput.value.trim() }), TYPING_PAUSE);
  baseUrlInput.addEventListener("input", saveBaseUrl);
  baseUrlInput.addEventListener("change", () => saveBaseUrl.now());

  el("auto-updates").addEventListener("click", async () => {
    const button = el("auto-updates");
    const was = button.getAttribute("aria-checked") === "true";
    button.setAttribute("aria-checked", String(!was));
    // فشل الحفظ يعيد المفتاح إلى ما كان: لا يبقى ظاهرًا ما لم يُحفظ
    if (!(await save({ autoUpdates: !was }))) button.setAttribute("aria-checked", String(was));
  });

  // ---------- اختبار الاتصال ----------

  function showConnection(message, tone) {
    const status = el("connection-status");
    el("connection-message").textContent = message;
    el("connection-icon").setAttribute(
      "href",
      tone === "danger" ? "#xmark.octagon.16m" : "#checkmark.circle.16m"
    );
    status.dataset.tone = tone;
    status.hidden = false;
    measure();
  }

  el("test-connection").addEventListener("click", async () => {
    const button = el("test-connection");
    button.disabled = true;
    el("connection-status").hidden = true;
    try {
      const report = await invoke("test_connection");
      showConnection(report.message, window.NasaqProviders.connectionWorks(report) ? "success" : "danger");
    } catch (error) {
      showConnection(String(error), "danger");
    }
    button.disabled = false;
  });

  // ---------- التحديثات ----------

  el("check-updates").addEventListener("click", async () => {
    const button = el("check-updates");
    button.disabled = true;
    el("update-message").textContent = "جارٍ التحقق…";
    try {
      const meta = await invoke("plugin:updater|check", {});
      // لا تنزيل هنا: قدرات هذه النافذة لا تملك إلا التحقق
      el("update-message").textContent = meta?.available
        ? `يتوفر إصدار ${meta.version}`
        : "أنت على أحدث إصدار";
      save({ lastUpdateCheck: Math.floor(Date.now() / 1000) });
    } catch {
      el("update-message").textContent = "تعذّر التحقق من التحديثات";
    }
    button.disabled = false;
  });

  // ---------- الإقلاع ----------

  const loaded = invoke("load_settings")
    .then((loadedView) => {
      view = loadedView;
      render();
    })
    .catch(() => {});

  // رقم الإصدار كما رُسم: لاتينيّ، فهو معرّف لا عدد يُقرأ
  const version = window.__TAURI__?.app
    ?.getVersion?.()
    .then((value) => {
      el("app-version").textContent = window.NasaqVersion.display(value);
    })
    .catch(() => {});

  // المستودع وموقع المؤلف: نصوصهما وعناوينهما من المصدر المشترك، والفتح يمرّ
  // بالنواة — وقدرة هذه النافذة تسمح بالعنوانين بالاسم وحدهما
  const links = window.NasaqLinks;
  const openUrl = (url) => invoke("plugin:opener|open_url", { url }).catch(() => {});
  el("project-url").textContent = links.PROJECT_LABEL;
  el("open-project").addEventListener("click", () => openUrl(links.PROJECT_URL));
  const site = el("site-link");
  site.textContent = links.SITE_LABEL;
  site.addEventListener("click", () => openUrl(links.SITE_URL));

  Promise.all([loaded, version ?? Promise.resolve()]).then(() => {
    setTab("general");
    announceReady();
  });
})();
