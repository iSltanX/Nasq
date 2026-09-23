// صفحة الإعدادات — تبويبان يُطبَّقان فورًا بلا زر حفظ.
//
// المفتاح لا يعبر الجسر إلى هنا: النواة تحفظه في سلسلة المفاتيح، وتخبر
// الصفحة أنه محفوظ فحسب. فالحقل يبدأ فارغًا بقناع مكان النص، ولا يُرسل منه
// شيء إلا ما يكتبه صاحبه — وإفراغه بعد كتابةٍ محوٌ مقصود. والاستثناء الوحيد
// زر العين: يطلب المفتاح بطلب صريح، ويُخفيه ما إن تغيب النافذة (المرحلة ٩).
(() => {
  const { invoke, announceReady, reportPaneHeight } = window.NasaqSecondary;
  const appearance = window.NasaqAppearance;
  const el = (id) => document.getElementById(id);

  const { PROVIDERS, presetFor, menuItems } = window.NasaqProviders;
  const { setStatus } = window.NasaqForms;
  const KEY_MASK = "••••••••••••••••••••••••";

  const tabs = [...document.querySelectorAll(".tab")];
  const panes = { general: el("pane-general"), updates: el("pane-updates") };
  const menu = el("picker-menu");

  const apiKeyInput = el("api-key");
  const revealBtn = el("reveal-key");
  const removeKeyBtn = el("remove-key");
  const saveStatus = el("save-status");
  const SAVED_NOTE = saveStatus.querySelector(".row-status-label").textContent.trim();
  const SAVED_FLASH_MS = 3000;
  const modelInput = el("model-name");
  const baseUrlInput = el("base-url");
  const providerValue = el("provider-value");
  const segments = [...document.querySelectorAll("[data-appearance-value]")];

  let view = null;
  let preset = "gemini";
  let keyTouched = false;
  // المعروض في الحقل مفتاحٌ جاء من السلسلة بزر العين، لا شيء كتبه صاحبه
  let revealedFromStore = false;
  let footerTimer = null;
  // ما جاء به «تحقق الآن» يبقى في بطاقته: حفظُ وقت التحقق يعيد الرسم، والرسم
  // لا يمحو النتيجة بوقتٍ (فحص m2). والعنوان لا يدّعي «أحدث إصدار» قبل أن يُتحقَّق
  // في هذه الجلسة: idle ← checking ← current | available | failed
  let check = { state: "idle", version: "" };
  const CHECK_TITLES = {
    idle: "تحديثات نَسَق",
    checking: "جارٍ التحقق من التحديثات…",
    current: "نَسَق قيد التشغيل بأحدث إصدار",
    failed: "تعذّر التحقق من التحديثات",
  };

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

    // الحقل الذي يكتب فيه صاحبه لا يُعاد كتابته تحت المؤشر: ما استقرّ في النواة —
    // ومنه القيمة الافتراضية لحقلٍ فرغ — يظهر حين يغادره، فلا يُلصق ما يكتبه
    // بعد السكتة بقيمةٍ ملأتها النواة (فحص m2)
    if (document.activeElement !== baseUrlInput) baseUrlInput.value = view.baseUrl;
    if (document.activeElement !== modelInput) modelInput.value = view.model;

    // المزوّد المحلي بلا مفتاح: صفّه يختفي كما يختفي اختبار المفتاح
    const local = view.provider === "ollama";
    apiKeyInput.closest(".form-row").hidden = local;
    apiKeyInput.placeholder = view.keyUnavailable
      ? "تعذّر الوصول إلى المفتاح المحفوظ"
      : view.hasApiKey
        ? KEY_MASK
        : "الصق المفتاح هنا";

    syncReveal();

    const chosen = appearance.apply(view.appearance);
    for (const segment of segments) {
      const selected = segment.dataset.appearanceValue === chosen;
      segment.setAttribute("aria-checked", String(selected));
      segment.tabIndex = selected ? 0 : -1;
    }

    el("auto-updates").setAttribute("aria-checked", String(view.autoUpdates));
    el("update-message").textContent = lastCheckLabel(view.lastUpdateCheck);
    renderCheck();
  }

  // بطاقة التحديث وتذييلها (2128:644 و2128:653، وAuto-Off 2285:2084)
  function renderCheck() {
    el("update-title").textContent =
      check.state === "available" ? `يتوفر إصدار ${window.NasaqVersion.display(check.version)}` : CHECK_TITLES[check.state];
    const state = el("updates-state");
    if (view && !view.autoUpdates) setStatus(state, "التحقق التلقائي مُعطَّل", "neutral");
    else if (check.state === "current") setStatus(state, "نظام نَسَق مُحدّث", "success");
    else setStatus(state, "التحقق التلقائي مفعَّل", "neutral");
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

  // نمط المظهر مبدّلٌ مقطّع (2128:610): مجموعة راديو بتركيز متجوّل، والسهمان يختاران
  function chooseAppearance(segment) {
    const value = segment.dataset.appearanceValue;
    appearance.apply(value);
    save({ appearance: value }).then((ok) => ok && flashSaved());
  }
  for (const segment of segments) {
    segment.addEventListener("click", () => chooseAppearance(segment));
    segment.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      const step = e.key === "ArrowLeft" ? 1 : -1;
      const next = segments[(segments.indexOf(segment) + step + segments.length) % segments.length];
      next.focus();
      chooseAppearance(next);
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && picker.isOpen()) {
      e.preventDefault();
      picker.close();
    }
  });

  // ---------- زر العين وتأكيد الحفظ (المرحلة ٩، طلب المالك) ----------
  // المالك كتب مفتاحه فرغ الحقل ولم يدرِ أنه حُفظ؛ ثم طلب أن يرى أيّ مفتاح
  // محفوظ. فالحفظ يُعلَن في حالة التذييل السطرية ثلاث ثوانٍ («تم حفظ التغييرات
  // تلقائيًا ✓» في 2128:620 هي نصّها المقيم)، والعين تُظهر المفتاح

  function flashSaved(message) {
    clearTimeout(footerTimer);
    setStatus(saveStatus, message ?? SAVED_NOTE, "success");
    if (!message) return;
    footerTimer = setTimeout(() => setStatus(saveStatus, SAVED_NOTE, "success"), SAVED_FLASH_MS);
  }

  const shown = () => apiKeyInput.type === "text";

  function syncReveal() {
    const local = view && view.provider === "ollama";
    revealBtn.hidden = local || !(view?.hasApiKey || apiKeyInput.value);
    // «إزالة المفتاح» لما في السلسلة وحده: ما يُكتب ولم يُحفظ يُمحى من حقله
    removeKeyBtn.hidden = local || !view?.hasApiKey;
    revealBtn.setAttribute("aria-pressed", String(shown()));
    const label = shown() ? "إخفاء المفتاح" : "إظهار المفتاح";
    revealBtn.title = label;
    revealBtn.setAttribute("aria-label", label);
    el("reveal-key-icon").setAttribute("href", shown() ? "#eye.slash.16r" : "#eye.16r");
  }

  // الإخفاء يعيد القناع: ما جاء من السلسلة ولم يُمسّ لا يبقى في الحقل
  function hideKey() {
    if (!shown()) return;
    apiKeyInput.type = "password";
    if (revealedFromStore) {
      apiKeyInput.value = "";
      revealedFromStore = false;
    }
    syncReveal();
  }

  revealBtn.addEventListener("click", async () => {
    if (shown()) {
      hideKey();
      return;
    }
    // مفتاحٌ مكتوب لم يُحفظ بعد يُظهره الحقل نفسه، بلا سؤال للنواة
    if (!apiKeyInput.value) {
      let stored = "";
      try {
        stored = await invoke("reveal_api_key");
      } catch (error) {
        showConnection(String(error), "danger");
        return;
      }
      // ردٌّ فارغ لا يُظهر حقلًا فارغًا كأنه المفتاح
      if (typeof stored !== "string" || !stored) return;
      apiKeyInput.value = stored;
      revealedFromStore = true;
    }
    apiKeyInput.type = "text";
    syncReveal();
  });

  // لا يبقى المفتاح ظاهرًا في نافذة غابت عن النظر
  window.addEventListener("blur", hideKey);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) hideKey();
  });

  // ---------- الحقول ----------

  // إفراغه بعد كتابة محوٌ مقصود، وما دام لم يُمسّ فلا يُرسل منه شيء
  // حفظ المفتاح يُعلَن في سطر الملاحظة بما كُتب في الحقل نفسه
  async function saveKeyNow() {
    const typed = apiKeyInput.value;
    const ok = await save({ apiKey: typed });
    if (ok) flashSaved(typed.trim() ? "حُفظ المفتاح في سلسلة المفاتيح" : "حُذف المفتاح من سلسلة المفاتيح");
    return ok;
  }
  const saveKey = debounce(saveKeyNow, TYPING_PAUSE);
  apiKeyInput.addEventListener("input", () => {
    keyTouched = true;
    // تعديل المفتاح الظاهر يجعله مفتاحًا جديدًا يكتبه صاحبه
    revealedFromStore = false;
    saveKey();
    syncReveal();
  });
  apiKeyInput.addEventListener("blur", async () => {
    if (!keyTouched) return;
    keyTouched = false;
    // القيمة لا تُمحى من الحقل إلا بعد أن يستقرّ حفظها فعلًا
    if (await saveKeyNow()) {
      apiKeyInput.value = "";
      apiKeyInput.type = "password";
      syncReveal();
    }
  });

  // «إزالة المفتاح» (2401:4159): محوٌ صريح بزرّه، وإفراغ الحقل بعد كتابة طريقه الآخر
  removeKeyBtn.addEventListener("click", async () => {
    keyTouched = false;
    revealedFromStore = false;
    apiKeyInput.value = "";
    apiKeyInput.type = "password";
    if (await save({ apiKey: "" })) flashSaved("حُذف المفتاح من سلسلة المفاتيح");
    apiKeyInput.focus();
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

  // رسالةٌ قصيرة إلى يسار الزرّ (Testing 2285:2016)، والطويلة — كردّ المزوّد — سطرًا كاملًا تحته
  // (Test-Failed 2611:5144، فحص m7-08) بدل عمودٍ ضيق يبترها
  const LONG_STATUS = 60;
  function showConnection(message, tone) {
    el("connection-status").classList.toggle("row-status-wide", String(message).length > LONG_STATUS);
    setStatus(el("connection-status"), message, tone);
    measure();
  }

  el("test-connection").addEventListener("click", async () => {
    const button = el("test-connection");
    button.disabled = true;
    // Settings / General / Testing 2285:2016 — الحالة السطرية بنوع Loading
    showConnection("جارٍ اختبار الاتصال بالمزوّد…", "loading");
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
    const show = (state, version = "") => {
      check = { state, version };
      renderCheck();
    };
    show("checking");
    try {
      const meta = await invoke("plugin:updater|check", {});
      // لا تنزيل هنا: قدرات هذه النافذة لا تملك إلا التحقق
      if (meta?.available) show("available", meta.version);
      else show("current");
      save({ lastUpdateCheck: Math.floor(Date.now() / 1000) });
    } catch {
      show("failed");
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

  // ما تحفظه نافذةٌ أخرى (ورقة الترحيب في الرئيسية) يصل حدثًا من النواة، فلا
  // تعرض هذه النافذة مزوّدًا قديمًا يُبنى عليه حفظٌ تالٍ (فحص m2)
  window.__TAURI__?.event
    ?.listen("settings:changed", (event) => {
      if (!event.payload) return;
      view = event.payload;
      render();
      measure();
    })
    .catch(() => {});

  // رقم الإصدار كما رُسم (٢٧٫٠): في بطاقة التحديث وفي تذييل «عام». و«بنية مستقرة» لإصدارٍ
  // بلا وسمٍ تجريبي وحده
  const version = window.__TAURI__?.app
    ?.getVersion?.()
    .then((value) => {
      const shown = window.NasaqVersion.display(value);
      const stable = /^\d+\.\d+\.\d+$/.test(String(value).trim());
      el("app-version").textContent = stable ? `${shown} (بنية مستقرة)` : shown;
      // الحرف والرقم في عزلٍ واحد من اليسار: وإلا رُسم «٢٧٫٠v» (فحص m7-06)
      el("footer-version").textContent = `نَسَق \u2066v${shown}\u2069`;
    })
    .catch(() => {});

  // «عرض سجل التغييرات على GitHub»: عنوان المستودع من المصدر المشترك، والفتح يمرّ
  // بالنواة — وقدرة هذه النافذة تسمح به بالاسم وحده. وموقع المؤلف في «حول»
  const links = window.NasaqLinks;
  el("open-project").addEventListener("click", () =>
    invoke("plugin:opener|open_url", { url: links.PROJECT_URL }).catch(() => {})
  );
  // سطر الصنعة في تذييل «عام»: الرابط نفسه، ونصّه عنوانُ المستودع كما في المصدر المشترك
  el("repo-label").textContent = links.PROJECT_LABEL;
  el("open-repo").addEventListener("click", () =>
    invoke("plugin:opener|open_url", { url: links.PROJECT_URL }).catch(() => {})
  );
  // «حول نَسَق» (btn-about 2401:4162): النافذة نفسها التي تفتحها قائمة التطبيق
  el("open-about").addEventListener("click", () => invoke("open_about").catch(() => {}));

  Promise.all([loaded, version ?? Promise.resolve()]).then(() => {
    setTab("general");
    announceReady();
  });
})();
