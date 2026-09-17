// صفحة الإعدادات — تبويبان يُطبَّقان فورًا بلا زر حفظ.
//
// المفتاح لا يعبر الجسر إلى هنا: النواة تحفظه في سلسلة المفاتيح، وتخبر
// الصفحة أنه محفوظ فحسب. فالحقل يبدأ فارغًا بقناع مكان النص، ولا يُرسل منه
// شيء إلا ما يكتبه صاحبه — وإفراغه بعد كتابةٍ محوٌ مقصود.
(() => {
  const { invoke, announceReady, reportPaneHeight } = window.NasaqSecondary;
  const appearance = window.NasaqAppearance;
  const el = (id) => document.getElementById(id);

  // مزوّدات جاهزة تملأ العنوان والنموذج ولا تمسّ المفتاح. transport هي قيمة
  // provider التي تفهمها النواة: "cloud" و"anthropic" و"ollama"
  const PROVIDERS = {
    gemini: {
      label: "Gemini",
      transport: "cloud",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
      model: "gemini-2.5-flash",
    },
    openai: {
      label: "OpenAI",
      transport: "cloud",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.6-terra",
    },
    claude: {
      label: "Claude",
      transport: "anthropic",
      baseUrl: "https://api.anthropic.com",
      model: "claude-opus-5",
    },
    groq: {
      label: "Groq",
      transport: "cloud",
      baseUrl: "https://api.groq.com/openai/v1",
      model: "llama-3.3-70b-versatile",
    },
    openrouter: {
      label: "OpenRouter",
      transport: "cloud",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "google/gemini-2.5-flash",
    },
    ollama: {
      label: "‏Ollama (على جهازك)",
      transport: "ollama",
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen3:8b",
    },
  };
  // الترتيب كما في قائمة التصميم، والفاصل قبل المحلي
  const PROVIDER_ORDER = ["gemini", "openai", "claude", "groq", "openrouter", "ollama"];
  const LOCAL_PROVIDER = "ollama";
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
  let openPicker = null;

  // ---------- العرض ----------

  // الزر المطابق لإعداد محفوظ: Claude وOllama بقيمة النقل، والسحابي بمضيف
  // العنوان — والعنوان المخصّص لا يطابق مزوّدًا
  function presetFor(transport, baseUrl) {
    if (transport === "anthropic") return "claude";
    if (transport === "ollama") return "ollama";
    const url = String(baseUrl || "").toLowerCase();
    return (
      PROVIDER_ORDER.find((key) => {
        const candidate = PROVIDERS[key];
        return candidate.transport === "cloud" && url.includes(new URL(candidate.baseUrl).host);
      }) ?? null
    );
  }

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

  // الإغلاق يعيد التركيز إلى زرّه إلا حين يكون سببه نقرة في مكان آخر:
  // النقرة تعرف أين تذهب
  function closeMenu(returnFocus = true) {
    menu.hidden = true;
    menu.replaceChildren();
    if (openPicker) {
      openPicker.setAttribute("aria-expanded", "false");
      if (returnFocus) openPicker.focus();
      openPicker = null;
    }
  }

  function openMenu(picker, items, current, onPick) {
    // النقر على زرّ قائمته مفتوحة يغلقها، كما في الماك
    if (openPicker === picker) {
      closeMenu();
      return;
    }
    closeMenu();
    openPicker = picker;
    picker.setAttribute("aria-expanded", "true");
    for (const item of items) {
      if (item.separator) {
        const line = document.createElement("div");
        line.className = "menu-separator";
        menu.append(line);
        continue;
      }
      const button = document.createElement("button");
      button.type = "button";
      button.className = "menu-item";
      button.setAttribute("role", "menuitemradio");
      const active = item.value === current;
      button.setAttribute("aria-checked", String(active));
      if (active) button.dataset.active = "true";
      const label = document.createElement("span");
      label.textContent = item.label;
      const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", "#checkmark.16m");
      check.append(use);
      check.setAttribute("aria-hidden", "true");
      button.append(label, check);
      button.addEventListener("click", () => {
        closeMenu();
        onPick(item.value);
      });
      menu.append(button);
    }
    menu.hidden = false;
    picker.setAttribute("aria-controls", menu.id);
    const rect = picker.getBoundingClientRect();
    const height = menu.getBoundingClientRect().height;
    const top = Math.min(Math.max(4, rect.top - 4), window.innerHeight - height - 4);
    menu.style.insetBlockStart = `${top}px`;
    menu.style.insetInlineStart = `${Math.max(4, rect.left - 4)}px`;
    menu.querySelector(".menu-item[data-active='true'], .menu-item")?.focus();
  }

  el("provider-picker").addEventListener("click", () => {
    const items = PROVIDER_ORDER.flatMap((key) =>
      key === LOCAL_PROVIDER
        ? [{ separator: true }, { value: key, label: PROVIDERS[key].label }]
        : [{ value: key, label: PROVIDERS[key].label }]
    );
    openMenu(el("provider-picker"), items, preset, (value) => {
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

  // تنقّل القوائم كما في الماك: الأسهم بين البنود، وHome/End إلى طرفيها
  menu.addEventListener("keydown", (e) => {
    const items = [...menu.querySelectorAll(".menu-item")];
    if (!items.length) return;
    const at = items.indexOf(document.activeElement);
    const go = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 }[e.key];
    if (go === undefined) return;
    e.preventDefault();
    items[(go + items.length) % items.length].focus();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !menu.hidden) {
      e.preventDefault();
      closeMenu();
    }
  });
  document.addEventListener("pointerdown", (e) => {
    if (!menu.hidden && !menu.contains(e.target) && !openPicker?.contains(e.target)) closeMenu(false);
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
      showConnection(report.message, report.connected && report.modelListed !== false ? "success" : "danger");
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
      el("app-version").textContent = value;
    })
    .catch(() => {});

  Promise.all([loaded, version ?? Promise.resolve()]).then(() => {
    setTab("general");
    announceReady();
  });
})();
