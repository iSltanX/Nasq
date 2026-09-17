// onboarding.js — أول تشغيل: ورقة من خطوتين (Figma 255:524 و256:1155)،
// وتدفّقها المرسوم في لوحة التدفّقات (94:143): تشغيل أول ← ترحيب ← ربط
// المزوّد ← اختبار الاتصال ← نَسَق فارغ جاهز.
//
// على مستوى التطبيق لا على مستوى برج: لا تعرف نداءً نموذجيًا ولا عقدًا، ولا
// يعرفها برج إلا من بابٍ واحد — hasProvider() يسأله نَسَق قبل أن ينسّق.
//
// «لاحقًا» يُبقي التطبيق مفتوحًا عاملًا، وضغط «نسّق» بلا مزوّد يعيد فتح
// الخطوة الثانية وحدها — كما نصّ التصميم، لا الأولى من جديد.
(() => {
  const { invoke, registerEscapeCloser } = window.NasaqShell;
  const { PROVIDERS, presetFor, menuItems } = window.NasaqProviders;
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
    modelInput.value = view.model;

    const local = view.provider === "ollama";
    el("welcome-key-row").hidden = local;
    keyInput.placeholder = view.keyUnavailable
      ? "تعذّر الوصول إلى المفتاح المحفوظ"
      : view.hasApiKey
        ? KEY_MASK
        : "الصق المفتاح هنا";

    // الرابط يتبع المزوّد المختار: صفحة مفاتيحه، وللمحلي صفحة تنزيله
    const chosen = preset ? PROVIDERS[preset] : null;
    helpLink.hidden = !chosen;
    if (chosen) helpLink.textContent = chosen.keyLabel ?? "كيف أحصل على مفتاح؟";

    // «ابدأ» لا يفتح تطبيقًا بلا مزوّد: بلا مفتاح يبقى «لاحقًا» وحده الطريق
    el("welcome-next").disabled = sheet.dataset.step === "connect" && !hasProvider();
  }

  async function save(patch) {
    try {
      view = await invoke("save_settings", { patch });
      render();
      return true;
    } catch (error) {
      showConnection(String(error), "danger");
      return false;
    }
  }

  function showConnection(message, tone) {
    const status = el("welcome-connection");
    el("welcome-connection-message").textContent = message;
    el("welcome-connection-icon").setAttribute(
      "href",
      tone === "danger" ? "#xmark.octagon.16m" : "#checkmark.circle.16m"
    );
    status.dataset.tone = tone;
    status.hidden = false;
  }

  // ---------- فتح الورقة وإغلاقها ----------

  function setStep(step) {
    sheet.dataset.step = step;
    el("welcome-next").textContent = step === "welcome" ? "متابعة" : "ابدأ";
    sheet.setAttribute(
      "aria-labelledby",
      step === "welcome" ? "welcome-label" : "welcome-topbar-title"
    );
    render();
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
    if (sheet.dataset.step === "welcome") setStep("connect");
    else close();
  });

  el("welcome-skip").addEventListener("click", close);

  el("welcome-provider").addEventListener("click", () => {
    picker.open(el("welcome-provider"), menuItems(), preset, (value) => {
      const chosen = PROVIDERS[value];
      // تبديل المزوّد يحمل عنوانه ونموذجه معه، ولا يمسّ المفتاح
      el("welcome-connection").hidden = true;
      save({ provider: chosen.transport, baseUrl: chosen.baseUrl, model: chosen.model });
    });
  });

  // المفتاح يُحفظ حين يفرغ الحقل من الكتابة لا مع كل حرف، وإفراغه بعد كتابة محوٌ مقصود
  let keyTouched = false;
  keyInput.addEventListener("input", () => {
    keyTouched = true;
  });
  keyInput.addEventListener("change", async () => {
    if (!keyTouched) return;
    keyTouched = false;
    if (await save({ apiKey: keyInput.value })) keyInput.value = "";
  });
  modelInput.addEventListener("change", () => save({ model: modelInput.value.trim() }));

  el("welcome-test").addEventListener("click", async () => {
    const button = el("welcome-test");
    button.disabled = true;
    el("welcome-connection").hidden = true;
    // ما زال في الحقل نصٌّ لم يُحفظ بعد: يُحفظ أولًا، فالاختبار يختبر ما حُفظ
    if (keyTouched) {
      keyTouched = false;
      if (await save({ apiKey: keyInput.value })) keyInput.value = "";
    }
    try {
      const report = await invoke("test_connection");
      showConnection(
        report.message,
        report.connected && report.modelListed !== false ? "success" : "danger"
      );
    } catch (error) {
      showConnection(String(error), "danger");
    }
    button.disabled = false;
  });

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
