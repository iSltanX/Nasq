// onboarding.js — أول تشغيل: ورقة من خطوتين (NsqV272: Welcome 2008:2 وProvider-Setup
// 2009:28)، وتدفّقها المرسوم: تشغيل أول ← ترحيب ← ربط المزوّد ← اختبار الاتصال
// (Testing 2009:97) ← نجاح (2009:115) فـ«ابدأ»، أو فشلٌ بأحد ثلاثة: مفتاح مرفوض
// (2009:134) ونموذج غير متوفر (2009:165) يعودان إلى النموذج بحالةٍ سطرية تحت حقلهما،
// وتعذُّر اتصال (2009:195) بشاشته.
//
// على مستوى التطبيق لا على مستوى برج: لا تعرف نداءً نموذجيًا ولا عقدًا، ولا
// يعرفها برج إلا من بابٍ واحد — hasProvider() يسأله نَسَق قبل أن ينسّق.
//
// «لاحقًا» يُبقي التطبيق مفتوحًا عاملًا، وضغط «نسّق» بلا مزوّد يعيد فتح
// الخطوة الثانية وحدها — كما نصّ التصميم، لا الأولى من جديد.
(() => {
  const { invoke, registerEscapeCloser } = window.NasaqShell;
  const { PROVIDERS, presetFor, menuItems, hostOf, isLocalHost } = window.NasaqProviders;
  const { setStatus } = window.NasaqForms;
  const el = (id) => document.getElementById(id);

  const sheet = el("welcome-sheet");
  const keyInput = el("welcome-key");
  const modelInput = el("welcome-model");
  const providerValue = el("welcome-provider-value");
  const helpLink = el("welcome-help");

  const KEY_MASK = "••••••••••••••••••••••••";

  // ما تعرفه الورقة عن الإعدادات: نسخة الواجهة نفسها التي تعيدها النواة،
  // بلا مفتاح قط — hasApiKey يكفي لتقنيع الحقل
  let view = null;
  let preset = "gemini";
  let opened = false;
  // نتيجة آخر اختبار ما دامت تخصّ ما في النموذج: "" أو key-rejected أو model-unavailable
  let result = { verdict: "", message: "" };
  // الاختبار لا يُقطع في النواة؛ «إلغاء» يُسقط نتيجته حين تصل
  let testRun = 0;

  // عنوان الخطوة الثانية ووصفها يتبعان حالها
  const CONNECT_COPY = {
    setup: {
      title: "إعداد مزوّد التنسيق",
      subtitle: "لتفعيل مستويات التنسيق المتقدمة وشَذْب، اربط مزوّدًا بمفتاحك الخاص، أو نموذجًا على جهازك عبر \u2066Ollama\u2069.",
    },
    saved: {
      title: "المفتاح محفوظ",
      subtitle: "مفتاحك محفوظ في سلسلة المفاتيح على هذا الجهاز. اختبر الاتصال للتأكد من عمله.",
    },
    local: {
      title: "نموذج محلي عبر \u2066Ollama\u2069",
      subtitle: "تم تحديد خيار التشغيل المحلي بالكامل. نَسَق سيتصل بخادمك الداخلي مباشرة.",
    },
    remote: {
      title: "نموذج عبر \u2066Ollama\u2069",
      subtitle: "نَسَق سيتصل بخادم \u2066Ollama\u2069 على العنوان المحفوظ في الإعدادات.",
    },
    "model-unavailable": {
      title: "نموذج غير متوافق",
      subtitle: "قُبل مفتاح واجهة البرمجة، ولكن النموذج المختار غير متوفر لدى هذا المزوّد.",
    },
  };
  const FALLBACK = {
    "key-rejected": "المفتاح مرفوض — تحقق من صلاحيته ورصيد الحساب",
    "model-unavailable": "النموذج غير متوفر لهذا المزوّد — يرجى اختيار نموذج آخر",
  };

  const picker = window.NasaqForms.attachPicker(el("welcome-picker-menu"));

  // مزوّد صالح للعمل: محليٌّ لا يحتاج مفتاحًا، وسحابيٌّ يحتاجه
  function hasProvider() {
    if (!view) return false;
    return view.provider === "ollama" ? true : view.hasApiKey;
  }

  function render() {
    if (!view) return;
    preset = presetFor(view.provider, view.baseUrl);
    providerValue.textContent = preset ? PROVIDERS[preset].label : "مخصّص";
    // الحقل الذي يكتب فيه صاحبه لا يُعاد كتابته تحت المؤشر (فحص m2)
    if (document.activeElement !== modelInput) modelInput.value = view.model;

    const local = view.provider === "ollama";
    el("welcome-key-row").hidden = local;
    // المحلي بلا مفتاح، فلا ملاحظةَ عن حفظه
    el("welcome-key-note").hidden = local;
    keyInput.placeholder = view.keyUnavailable
      ? "تعذّر الوصول إلى المفتاح المحفوظ"
      : view.hasApiKey
        ? KEY_MASK
        : "الصق المفتاح هنا";

    // الرابط يتبع المزوّد المختار: صفحة مفاتيحه، وللمحلي صفحة تنزيله
    const chosen = preset ? PROVIDERS[preset] : null;
    helpLink.hidden = !chosen;
    if (chosen) helpLink.textContent = chosen.keyLabel ?? "كيف أحصل على مفتاح؟";

    // بطاقة «تشغيل محلي بالكامل» لخادمٍ على هذا الجهاز وحده: عنوانٌ بعيد لا يُوعَد بها
    const onDevice = local && isLocalHost(view.baseUrl);
    el("welcome-local-card").hidden = !onDevice;
    el("welcome-model-label").textContent = local ? "النموذج النشط في \u2066Ollama\u2069" : "النموذج المفضل";

    // مفتاحٌ رُفض لا يُقال عنه «محفوظ… اختبره»: تعود الشاشة إلى عنوان الإعداد كما في 2009:134
    const copy =
      CONNECT_COPY[result.verdict] ??
      CONNECT_COPY[
        local ? (onDevice ? "local" : "remote") : view.hasApiKey && result.verdict !== "key-rejected" ? "saved" : "setup"
      ];
    el("welcome-topbar-title").textContent = copy.title;
    el("welcome-subtitle").textContent = copy.subtitle;
    setStatus(el("welcome-key-status"), result.verdict === "key-rejected" ? result.message : "", "danger");
    setStatus(el("welcome-model-status"), result.verdict === "model-unavailable" ? result.message : "", "danger");

    renderFooter();
  }

  // صفّ الأزرار بحسب الخطوة. الفعل الأساسي في الخطوة الثانية «اختبر الاتصال»، ولا يُختبر
  // ما ليس فيه مزوّد: مفتاحٌ محفوظ أو مكتوبٌ في الحقل، أو مزوّد محلي
  function renderFooter() {
    const step = sheet.dataset.step;
    const retry = step === "failed" || (step === "connect" && Boolean(result.verdict));
    const next = el("welcome-next");
    next.hidden = step === "testing";
    next.textContent =
      step === "welcome" ? "متابعة" : step === "success" ? "ابدأ" : retry ? "أعد الاختبار" : "اختبر الاتصال";
    next.disabled = step === "connect" && !(hasProvider() || keyInput.value.trim());
    const skip = el("welcome-skip");
    skip.hidden = step === "testing" || step === "success";
    skip.textContent = retry ? "تخطي الآن" : "لاحقًا";
    el("welcome-cancel").hidden = step !== "testing";
    el("welcome-back").hidden = !retry;
    if (retry) sheet.dataset.footer = "split";
    else delete sheet.dataset.footer;
  }

  // ما يتغيّر في النموذج يُسقط نتيجة اختبارٍ سبقه: الخطأ المعروض يخصّ ما اختُبر
  async function save(patch) {
    try {
      view = await invoke("save_settings", { patch });
      result = { verdict: "", message: "" };
      render();
      return true;
    } catch (error) {
      showFailure(String(error));
      return false;
    }
  }

  function showFailure(detail) {
    const host = view ? hostOf(view.baseUrl) : "";
    el("welcome-failed-detail").textContent =
      detail || `فشلت محاولة الاتصال بـ \u2066${host}\u2069. يرجى التحقق من الشبكة أو إعدادات جدار الحماية.`;
    setStep("failed");
  }

  // ---------- فتح الورقة وإغلاقها ----------

  const STEP_TITLES = {
    welcome: "welcome-label",
    connect: "welcome-topbar-title",
    testing: "welcome-testing-title",
    success: "welcome-success-title",
    failed: "welcome-failed-title",
  };

  function setStep(step) {
    sheet.dataset.step = step;
    sheet.setAttribute("aria-labelledby", STEP_TITLES[step]);
    render();
    renderFooter();
    // الزرّ الذي كان عليه التركيز قد اختفى مع خطوته: يعود إلى أول ظاهرٍ في صفّ الأزرار
    const focused = document.activeElement;
    if (opened && (!sheet.contains(focused) || focused.offsetParent === null)) focusFooter();
  }

  function focusFooter() {
    const order = ["welcome-next", "welcome-cancel", "welcome-skip"];
    const target = order.map(el).find((button) => !button.hidden && !button.disabled);
    target?.focus();
  }

  function open(step) {
    if (opened) {
      setStep(step);
      return;
    }
    opened = true;
    setStep(step);
    window.NasaqWindow.presentModal(sheet, { initialFocus: "#welcome-next" });
  }

  function close() {
    if (!opened) return;
    opened = false;
    picker.close(false);
    window.NasaqWindow.dismissModal(sheet);
  }

  // ---------- الأزرار ----------

  el("welcome-next").addEventListener("click", () => {
    const step = sheet.dataset.step;
    if (step === "welcome") setStep("connect");
    else if (step === "success") close();
    else runTest();
  });

  el("welcome-skip").addEventListener("click", close);

  // «السابق»: من شاشة التعذّر إلى النموذج، ومن النموذج إلى الترحيب
  el("welcome-back").addEventListener("click", () => {
    const step = sheet.dataset.step;
    result = { verdict: "", message: "" };
    setStep(step === "failed" ? "connect" : "welcome");
  });
  el("welcome-provider-settings").addEventListener("click", () => setStep("connect"));
  el("welcome-cancel").addEventListener("click", cancelTest);

  function cancelTest() {
    testRun += 1;
    setStep("connect");
  }

  el("welcome-provider").addEventListener("click", () => {
    picker.open(el("welcome-provider"), menuItems(), preset, (value) => {
      const chosen = PROVIDERS[value];
      // تبديل المزوّد يحمل عنوانه ونموذجه معه، ولا يمسّ المفتاح
      save({ provider: chosen.transport, baseUrl: chosen.baseUrl, model: chosen.model });
    });
  });

  // المفتاح يُحفظ حين يفرغ الحقل من الكتابة لا مع كل حرف، وإفراغه بعد كتابة محوٌ مقصود
  let keyTouched = false;
  // العين تُظهر ما كُتب في الحقل وحده؛ المفتاح المحفوظ لا يُطلب من النواة هنا (زرّه في الإعدادات)
  const revealBtn = el("welcome-reveal");
  function syncReveal() {
    if (!keyInput.value) keyInput.type = "password";
    const shown = keyInput.type === "text";
    revealBtn.hidden = !keyInput.value;
    revealBtn.setAttribute("aria-pressed", String(shown));
    const label = shown ? "إخفاء المفتاح" : "إظهار المفتاح";
    revealBtn.title = label;
    revealBtn.setAttribute("aria-label", label);
    el("welcome-reveal-icon").setAttribute("href", shown ? "#eye.slash.16r" : "#eye.16r");
  }
  revealBtn.addEventListener("click", () => {
    keyInput.type = keyInput.type === "text" ? "password" : "text";
    syncReveal();
  });

  keyInput.addEventListener("input", () => {
    keyTouched = true;
    syncReveal();
    renderFooter();
  });
  keyInput.addEventListener("change", async () => {
    if (!keyTouched) return;
    keyTouched = false;
    if (await save({ apiKey: keyInput.value })) keyInput.value = "";
    syncReveal();
  });
  modelInput.addEventListener("change", () => save({ model: modelInput.value.trim() }));

  async function runTest() {
    // ما زال في الحقل نصٌّ لم يُحفظ بعد: يُحفظ أولًا، فالاختبار يختبر ما حُفظ
    if (keyTouched) {
      keyTouched = false;
      if (!(await save({ apiKey: keyInput.value }))) return;
      keyInput.value = "";
      syncReveal();
    }
    if (!hasProvider()) return;
    const run = ++testRun;
    result = { verdict: "", message: "" };
    el("welcome-testing-host").textContent = hostOf(view.baseUrl);
    setStep("testing");
    let verdict = "unreachable";
    let message = "";
    try {
      const report = await invoke("test_connection");
      verdict = window.NasaqProviders.connectionVerdict(report);
      message = report?.message ?? "";
    } catch (error) {
      message = String(error);
    }
    // أُلغي أثناء الانتظار: نتيجته لا تُعرض
    if (run !== testRun) return;
    if (verdict === "works") setStep("success");
    else if (verdict === "unreachable") showFailure(message);
    else {
      result = { verdict, message: message || FALLBACK[verdict] };
      setStep("connect");
    }
  }

  // صفحة المفاتيح لدى المزوّد نفسه — نطاقاتها مسموحة بالاسم في القدرة
  helpLink.addEventListener("click", () => {
    const chosen = preset ? PROVIDERS[preset] : null;
    if (chosen) invoke("plugin:opener|open_url", { url: chosen.keyUrl }).catch(() => {});
  });

  // Esc: القائمة أولًا. ثم الورقة — ولكن في الخطوة الثانية وحدها، لأن Esc في
  // الماك هو زر الإلغاء، والخطوة الأولى لا زرَّ إلغاء فيها («متابعة» وحدها).
  // والمخرج قائم على كل حال: خطوةٌ واحدة إلى «لاحقًا»
  // والتسجيل يضع الأحدث أولًا، فالورقة تُسجَّل قبل قائمتها لتُفحص بعدها
  registerEscapeCloser(() => opened && sheet.dataset.step === "connect", close);
  // وأثناء الاختبار Esc هو «إلغاء»، وفي شاشة التعذّر هو «تخطي الآن»
  registerEscapeCloser(() => opened && sheet.dataset.step === "testing", cancelTest);
  registerEscapeCloser(() => opened && sheet.dataset.step === "failed", close);
  registerEscapeCloser(() => picker.isOpen(), () => picker.close());

  // ---------- الإقلاع ----------

  // الإعدادات تصل من القشرة التي حمّلتها أصلًا: لا نداء ثانيًا، ولا اعتماد
  // على ترتيب تحميل الملفات — الوعد ينتظرنا لا نحن ننتظر السطور
  window.NasaqShell.settingsReady.then((loaded) => {
    if (!loaded) return; // تعذّر تحميل الإعدادات: لا نفترض أنه أول تشغيل
    view = loaded;
    render();
    // أول تشغيل: لا مزوّد عامل بعد، فالورقة من أولها
    if (!hasProvider()) open("welcome");
  });

  // ما يُحفظ في نافذة الإعدادات يصل هنا حدثًا من النواة: الورقة تتبعه، فلا
  // تمنع التنسيق عمّن أضاف مفتاحه هناك أو اختار مزوّدًا محليًا (فحص m2)
  window.__TAURI__?.event
    ?.listen("settings:changed", (event) => {
      if (!event.payload) return;
      view = event.payload;
      render();
    })
    .catch(() => {});

  window.NasaqOnboarding = {
    hasProvider,
    // نَسَق ينادي هذه قبل أن ينسّق: بلا مزوّد تُفتح الخطوة الثانية ويُمنع الفعل
    requireProvider() {
      if (hasProvider()) return true;
      open("connect");
      return false;
    },
  };
})();
