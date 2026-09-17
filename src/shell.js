// قشرة «نسق» المشتركة — البنية الأمامية التي لا تعرف وضعًا ولا عقدًا:
// النواة (invoke)، الإعدادات، الثيمات، المسودات (تخزينًا وعرضًا)، الحافظة،
// الرسائل، والعدّاد. الوضع النشط يصل نفسه بها عبر التسجيل (مفردات عرض
// المسودات، معالج الاستعادة، مُغلقات Escape) — القشرة لا تنادي دوال وضعٍ
// باسمها أبدًا. (انقسمت عن main.js نقلًا حرفيًا في المرحلة 2 — v4.2)

// خارج التطبيق (معاينة متصفح) تبقى الواجهة والأدوات المحلية تعمل، وتفشل أوامر النواة برسالة واضحة
const invoke = window.__TAURI__?.core?.invoke
  ?? (async () => { throw "هذه معاينة متصفح — التشغيل الكامل عبر التطبيق نفسه."; });

const el = (id) => document.getElementById(id);

// عنصرا الرسائل العامان — يخصّان القشرة، وبقية العناصر لوحداتها.
// كل حاوية تحمل أيقونة تشريح ثابتة + عنصر رسالة فرعي (15 — Content &
// Feedback: Alert/Toast) — النص يُكتب في الفرعي فلا يمحو الأيقونة
const errorBar = el("error-bar");
const errorBarMessage = el("error-bar-message");
const toast = el("toast");
const toastMessage = el("toast-message");

// ---------- عدّاد الأحرف ----------
// عدّ نقاط الترميز لا وحدات UTF-16 (الإصلاح ١-د): الإيموجي الواحد محرف
// واحد في العرض. عدّادات حدود المنصات في nasaq.js لها منطقها المستقل
// (عدّ إكس هناك بوحدات UTF-16 عمدًا لأنه يطابق وزن المنصة) — لا يمسّها هذا
function updateCount(node, text) {
  const n = [...text].length;
  node.textContent = n ? `${n} حرف` : "";
}

// ---------- عرض الخطأ ----------
function showError(msg) {
  errorBarMessage.textContent = msg;
  errorBar.hidden = false;
}

function clearError() {
  errorBar.hidden = true;
  errorBarMessage.textContent = "";
}

// ---------- رسالة التنبيه ----------
let toastTimer = null;
function showToast(text) {
  toastMessage.textContent = text;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toast.hidden = true), 1800);
}

// ---------- النسخ ----------
// نص عادي UTF-8 مباشرة عبر Clipboard API، وعند تعذّره نلجأ لنواة التطبيق
async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      await invoke("copy_to_clipboard", { text });
    }
    return true;
  } catch {
    try {
      await invoke("copy_to_clipboard", { text });
      return true;
    } catch {
      return false;
    }
  }
}

// ---------- الإعدادات ----------
const overlay = el("settings-overlay");
const apiKeyField = el("api-key-field");
const apiKeyInput = el("api-key");
const baseUrlInput = el("base-url");
const modelInput = el("model-name");
const settingsMsg = el("settings-msg");
const ollamaTestRow = el("ollama-test-row");
const ollamaTestBtn = el("ollama-test-btn");

// مزوّدات جاهزة — تملأ Base URL وModel Name فقط، ولا تمسّ المفتاح.
// transport قيمة provider التي تُحفظ ويفهمها النقل: "cloud" (متوافق مع
// OpenAI)، "anthropic" (واجهة Messages الأصلية لـ Claude)، "ollama" (محلي)
const PROVIDERS = {
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    model: "gemini-2.5-flash",
    transport: "cloud",
  },
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5.6-terra",
    transport: "cloud",
  },
  claude: {
    baseUrl: "https://api.anthropic.com",
    model: "claude-opus-5",
    transport: "anthropic",
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    transport: "cloud",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    model: "google/gemini-2.5-flash",
    transport: "cloud",
  },
  ollama: {
    baseUrl: "http://127.0.0.1:11434",
    model: "qwen3:8b",
    transport: "ollama",
  },
};

const DEFAULTS = PROVIDERS.gemini;
const providerButtons = document.querySelectorAll(".provider-btn");

// المزوّد المختار حاليًا في لوحة الإعدادات: selectedProvider قيمة النقل
// ("cloud" أو "anthropic" أو "ollama") وتقود إظهار/إخفاء حقل API Key وزر
// اختبار الاتصال؛ وselectedPreset مفتاح الزر المضاء في PROVIDERS (أو null
// لعنوان مخصّص)، ومنه تُملأ الحقول الفارغة عند الحفظ
let selectedProvider = "cloud";
let selectedPreset = "gemini";

// الزر المطابق لإعداد محفوظ: Claude وOllama بقيمة النقل نفسها، والسحابي
// بمضيف Base URL — والعنوان المخصّص لا يضيء زرًا
function presetFor(provider, baseUrl) {
  if (provider === "anthropic") return "claude";
  if (provider === "ollama") return "ollama";
  const url = String(baseUrl || "").toLowerCase();
  return (
    Object.keys(PROVIDERS).find(
      (key) => PROVIDERS[key].transport === "cloud" && url.includes(new URL(PROVIDERS[key].baseUrl).host)
    ) ?? null
  );
}

function selectProvider(provider, preset) {
  selectedProvider = provider;
  selectedPreset = preset;
  const isOllama = provider === "ollama";
  apiKeyField.hidden = isOllama;
  ollamaTestRow.hidden = !isOllama;
  for (const btn of providerButtons) {
    btn.setAttribute("aria-pressed", String(btn.dataset.provider === preset));
  }
}

function showSettingsMsg(text, isError) {
  settingsMsg.textContent = text;
  settingsMsg.classList.toggle("error", Boolean(isError));
  settingsMsg.hidden = false;
}

function closeSettings() {
  // إعادة التركيز لزر الفتح — الإخفاء بلا نقل تركيز يُسقطه إلى <body>
  // (٢٫٤٫٣ ترتيب التركيز)؛ نفس الحارس المطبَّق على شريط البحث في nasaq.js
  if (overlay.contains(document.activeElement)) el("settings-btn").focus();
  overlay.hidden = true;
  settingsMsg.hidden = true;
}

async function openSettings() {
  let s = {};
  try {
    s = (await invoke("load_settings")) || {};
  } catch {
    // إن تعذّرت القراءة تُملأ الحقول بالقيم الافتراضية أدناه
  }
  apiKeyInput.value = s.apiKey || "";
  baseUrlInput.value = s.baseUrl || DEFAULTS.baseUrl;
  modelInput.value = s.model || DEFAULTS.model;
  apiKeyInput.type = "password";
  el("toggle-key").textContent = "إظهار";
  const provider = s.provider === "ollama" || s.provider === "anthropic" ? s.provider : "cloud";
  selectProvider(provider, presetFor(provider, baseUrlInput.value));
  settingsMsg.hidden = true;
  switchTab("general");
  overlay.hidden = false;
  if (!apiKeyInput.value) apiKeyInput.focus();
}

el("settings-btn").addEventListener("click", openSettings);

// الإغلاق: يغلق فقط، بلا حفظ وبلا مسح قيم
el("close-settings").addEventListener("click", closeSettings);

overlay.addEventListener("click", (e) => {
  if (e.target === overlay) closeSettings();
});

// أزرار المزوّدات
for (const btn of providerButtons) {
  btn.addEventListener("click", () => {
    const p = PROVIDERS[btn.dataset.provider];
    if (!p) return;
    baseUrlInput.value = p.baseUrl;
    modelInput.value = p.model;
    selectProvider(p.transport, btn.dataset.provider);
    settingsMsg.hidden = true;
  });
}

el("toggle-key").addEventListener("click", () => {
  const hidden = apiKeyInput.type === "password";
  apiKeyInput.type = hidden ? "text" : "password";
  el("toggle-key").textContent = hidden ? "إخفاء" : "إظهار";
});

el("save-settings").addEventListener("click", async () => {
  const apiKey = apiKeyInput.value.trim();
  if (selectedProvider !== "ollama" && !apiKey) {
    showSettingsMsg("أدخل مفتاح المزود أولًا.", true);
    return;
  }

  // الحقل الفارغ يُملأ من الزر المختار — فلا يسقط إعداد OpenAI أو Claude إلى
  // قيم Gemini بصمت؛ وGemini يبقى لعنوان سحابي مخصّص فقط كما كان
  const providerDefaults = PROVIDERS[selectedPreset] ?? DEFAULTS;
  const baseUrl = baseUrlInput.value.trim() || providerDefaults.baseUrl;
  const model = modelInput.value.trim() || providerDefaults.model;
  baseUrlInput.value = baseUrl;
  modelInput.value = model;

  try {
    await invoke("save_settings", {
      settings: { apiKey, baseUrl, model, provider: selectedProvider },
    });
    showSettingsMsg("حُفظت الإعدادات محليًا.");
    setTimeout(closeSettings, 600);
  } catch (err) {
    showSettingsMsg(String(err), true);
  }
});

// اختبار اتصال Ollama المحلي — يفحص الحقول الحالية (قد تكون غير محفوظة بعد)
// عبر GET /api/tags، ولا يرسل أي نص ولا يتصل بأي مزوّد سحابي
ollamaTestBtn.addEventListener("click", async () => {
  const baseUrl = baseUrlInput.value.trim() || PROVIDERS.ollama.baseUrl;
  const model = modelInput.value.trim() || PROVIDERS.ollama.model;
  const originalLabel = ollamaTestBtn.textContent;
  ollamaTestBtn.disabled = true;
  ollamaTestBtn.textContent = "جارٍ الاختبار…";
  settingsMsg.hidden = true;
  try {
    const msg = await invoke("test_ollama_connection", { baseUrl, model });
    showSettingsMsg(msg, false);
  } catch (err) {
    showSettingsMsg(String(err), true);
  } finally {
    ollamaTestBtn.disabled = false;
    ollamaTestBtn.textContent = originalLabel;
  }
});

// ---------- تبويبات لوحة الإعدادات ----------
// ثلاثة تبويبات على نمط واحد: زر/جسم لكل اسم، وswitchTab تُظهر واحدًا
// وتُخفي الباقي — «حول» (المرحلة 2 من خطة التحديثات) يتبع النمط نفسه
// حرفيًا، بلا أي منطق إضافي أو تفريع خاص
const TABS = {
  general: { btn: el("tab-general-btn"), body: el("tab-general") },
  appearance: { btn: el("tab-appearance-btn"), body: el("tab-appearance") },
  about: { btn: el("tab-about-btn"), body: el("tab-about") },
};

function switchTab(name) {
  for (const [key, { btn, body }] of Object.entries(TABS)) {
    const active = key === name;
    body.hidden = !active;
    btn.classList.toggle("active", active);
    btn.setAttribute("aria-selected", String(active));
  }
  settingsMsg.hidden = true;
}

for (const [name, { btn }] of Object.entries(TABS)) {
  btn.addEventListener("click", () => switchTab(name));
}

// ---------- نظام التحديث التلقائي (v8.2.0) ----------
// آلة حالات حقيقية فوق أوامر plugin:updater الرسمية حصرًا: فحص → تنزيل
// (بقناة تقدّم) → تثبيت → إعادة تشغيل آمنة عبر plugin:process|restart. لا
// مُنزِّل مخصّص ولا تنفيذ يدويّ للملفات ولا إضعاف للتحقّق — الإضافة تتحقّق
// من توقيع minisign داخليًّا قبل التثبيت. الأخطاء تُعرَض برسائل عربية
// موجزة، وتفاصيلها التقنية في console (التطوير) دون تسريب أي سرّ أو مسار.
const updCheckBtn = el("update-check-btn");
const updDownloadBtn = el("update-download-btn");
const updInstallBtn = el("update-install-btn");
const updStatusText = el("update-status-text");
const updProgress = el("update-progress");
const updProgressBar = el("update-progress-bar");

let updBusy = false; // يمنع الازدواج: فحص/تنزيل/تثبيت متزامن
let updRid = null; // معرّف مورد التحديث المتاح (من الفحص)
let updBytesRid = null; // معرّف مورد البايتات (من التنزيل)
let updVersion = null;
let updDownloaded = 0;
let updTotal = 0;

function updToggle(node, show) {
  node.hidden = !show;
}

// الحالات: idle / checking / no-update / available / downloading /
// downloaded / installing / restart / error-{check,download,install} / web
function setUpdateState(state, opt = {}) {
  updToggle(updCheckBtn, state === "idle" || state === "no-update" || state === "error-check" || state === "web");
  updToggle(updDownloadBtn, state === "available" || state === "error-download");
  updToggle(updInstallBtn, state === "downloaded" || state === "error-install");
  updToggle(updProgress, state === "downloading");
  updCheckBtn.disabled = updBusy;
  updDownloadBtn.disabled = updBusy;
  updInstallBtn.disabled = updBusy;
  const v = opt.version || updVersion || "";
  const messages = {
    idle: "التحديث التلقائي مُفعّل.",
    checking: "جارٍ البحث…",
    "no-update": "لا توجد تحديثات — لديك أحدث إصدار.",
    available: "يتوفر الإصدار " + v,
    downloading: opt.pct != null ? "جارٍ التنزيل… " + opt.pct + "٪" : "جارٍ التنزيل…",
    downloaded: "تم تنزيل التحديث.",
    installing: "جارٍ التثبيت…",
    restart: "سيُعاد تشغيل نَسَق لإكمال التحديث…",
    "error-check": "تعذّر البحث عن تحديث.",
    "error-download": "تعذّر تنزيل التحديث.",
    "error-install": "تعذّر تثبيت التحديث.",
    web: "التحديث التلقائي متاح داخل التطبيق فقط.",
  };
  updStatusText.textContent = messages[state] != null ? messages[state] : "";
}

// فحص يدويّ: check يعيد بيانات التحديث إن توفّر إصدار أحدث، وإلا null
async function updaterCheck() {
  if (updBusy) return;
  if (!window.__TAURI__) {
    setUpdateState("web");
    return;
  }
  updBusy = true;
  setUpdateState("checking");
  try {
    const meta = await invoke("plugin:updater|check", {});
    updBusy = false;
    if (meta && meta.rid != null) {
      updRid = meta.rid;
      updVersion = meta.version;
      updBytesRid = null;
      setUpdateState("available", { version: meta.version });
    } else {
      setUpdateState("no-update");
    }
  } catch (e) {
    updBusy = false;
    console.error("[updater] check failed", e);
    setUpdateState("error-check");
  }
}

// تنزيل مع تقدّم حقيقيّ عبر قناة الأحداث (Started/Progress/Finished)
async function updaterDownload() {
  if (updBusy || updRid == null) return;
  updBusy = true;
  updDownloaded = 0;
  updTotal = 0;
  updProgressBar.style.width = "0%";
  setUpdateState("downloading", { pct: 0 });
  try {
    const channel = new window.__TAURI__.core.Channel();
    channel.onmessage = (msg) => {
      if (!msg) return;
      if (msg.event === "Started") {
        updTotal = (msg.data && msg.data.contentLength) || 0;
      } else if (msg.event === "Progress") {
        updDownloaded += (msg.data && msg.data.chunkLength) || 0;
        if (updTotal) {
          const pct = Math.min(100, Math.round((updDownloaded / updTotal) * 100));
          updProgressBar.style.width = pct + "%";
          setUpdateState("downloading", { pct });
        }
      }
    };
    updBytesRid = await invoke("plugin:updater|download", { rid: updRid, onEvent: channel });
    updBusy = false;
    updProgressBar.style.width = "100%";
    setUpdateState("downloaded");
  } catch (e) {
    updBusy = false;
    console.error("[updater] download failed", e);
    setUpdateState("error-download");
  }
}

// تثبيت ثم إعادة تشغيل آمنة — لا حالة «مثبَّت» كاذبة قبل إعادة التشغيل
async function updaterInstall() {
  if (updBusy || updRid == null || updBytesRid == null) return;
  updBusy = true;
  setUpdateState("installing");
  try {
    await invoke("plugin:updater|install", { updateRid: updRid, bytesRid: updBytesRid });
    setUpdateState("restart");
    await invoke("plugin:process|restart", {});
    // لا يُتوقَّع الوصول هنا — التطبيق يُعاد تشغيله بأمر restart أعلاه
  } catch (e) {
    updBusy = false;
    console.error("[updater] install failed", e);
    setUpdateState("error-install");
  }
}

updCheckBtn.addEventListener("click", updaterCheck);
updDownloadBtn.addEventListener("click", updaterDownload);
updInstallBtn.addEventListener("click", updaterInstall);
setUpdateState("idle");

// رابط صفحة المشروع (تبويب «حول»): في وضع الويب المؤطّر يعمل الرابط طبيعيًا
// (target="_blank"). وداخل التطبيق نمنع مغادرة نافذة نَسَق ونفتح الرابط في
// المتصفح الافتراضي عبر مُشغّل Tauri الرسمي (plugin:opener|open_url) —
// الصلاحية مقيّدة بنطاق github.com في القدرات
const aboutProjectLink = el("about-project-link");
if (aboutProjectLink) {
  aboutProjectLink.addEventListener("click", (e) => {
    if (window.__TAURI__) {
      e.preventDefault();
      invoke("plugin:opener|open_url", { url: aboutProjectLink.href }).catch(() => {});
    }
  });
}

// ---------- المظهر: فاتح / داكن / تلقائي ----------
// خيار واحد محفوظ بثلاث قيم فقط. «تلقائي» (وهو الافتراضي عند غياب أي
// اختيار) يتبع مظهر النظام حيًّا؛ «فاتح»/«داكن» يثبّتان يدويًا ويوقفان
// اتباع النظام. data-appearance="dark" على الجذر يقود اللوحة الليلية،
// وغيابه نهار — بالقرار نفسه الذي رسمه سكربت الرأس المبكر فلا وميض.
const APPEARANCE_KEY = "nasaq-appearance-choice";
const APPEARANCE_MODES = ["light", "dark", "auto"];

const appearanceButtons = {
  light: el("appearance-light-btn"),
  dark: el("appearance-dark-btn"),
  auto: el("appearance-auto-btn"),
};

// ترحيل هادئ: مفاتيح الهوية القديمة (العائلة اللونية، الأيقونة، ومفتاح
// المظهر التلقائي الأقدم) لم تعد تُقرأ — تُمحى مرة واحدة عند الإقلاع فلا
// يبقى لها أثر، دون أن يتعطّل التطبيق بقيمة متقادمة محفوظة
for (const staleKey of ["nasaq-theme", "nasaq-logo", "nasaq-appearance"]) {
  try {
    localStorage.removeItem(staleKey);
  } catch {
    // تعذّر المحو لا يضر — المفاتيح القديمة لا تُقرأ أصلًا
  }
}

// الاختيار المحفوظ إن كان من الثلاثة، وإلا «تلقائي» (بما فيه غياب المفتاح
// أو قيمة قديمة تالفة) فلا يفسد مفتاح متقادم مسارَ اتباع النظام
function savedAppearanceChoice() {
  try {
    const v = localStorage.getItem(APPEARANCE_KEY);
    return APPEARANCE_MODES.includes(v) ? v : "auto";
  } catch {
    return "auto";
  }
}

const systemDarkQuery = window.matchMedia
  ? window.matchMedia("(prefers-color-scheme: dark)")
  : null;

function systemPrefersDark() {
  return Boolean(systemDarkQuery && systemDarkQuery.matches);
}

// الوضع الليلي فعّال؟ «تلقائي» يسأل النظام، وإلا فالاختيار الصريح
function isDarkAppearance(choice) {
  return choice === "dark" || (choice === "auto" && systemPrefersDark());
}

// أيقونة الدوك الفعلية (داخل التطبيق فقط): أمر Rust يبدّل صورة الدوك
// للجلسة إلى أيقونة نَسَق بنسختها المناسبة للوضع الفعّال (فاتح/داكن).
// أيقونة الحزمة في Finder/Launchpad تبقى أيقونة البناء. في معاينة
// المتصفح يفشل النداء بصمت فلا أثر له
function updateDockIcon(dark) {
  if (!window.__TAURI__) return;
  invoke("set_dock_icon", { dark }).catch(() => {});
}

// تطبيق الحالة على الجذر والأزرار دون حفظ — يُستدعى عند البدء واتباع النظام
function renderAppearance(choice) {
  const dark = isDarkAppearance(choice);
  if (dark) {
    document.documentElement.setAttribute("data-appearance", "dark");
  } else {
    document.documentElement.removeAttribute("data-appearance");
  }
  for (const mode of APPEARANCE_MODES) {
    appearanceButtons[mode].setAttribute("aria-pressed", String(mode === choice));
  }
  updateDockIcon(dark);
}

// اختيار يدوي (من أي زر): يطبّق ويحفظ، فيثبت التطبيق على المختار
function applyAppearanceChoice(choice) {
  renderAppearance(choice);
  try {
    localStorage.setItem(APPEARANCE_KEY, choice);
  } catch {
    // تعذّر الحفظ لا يمنع التبديل في الجلسة الحالية
  }
}

for (const mode of APPEARANCE_MODES) {
  appearanceButtons[mode].addEventListener("click", () => applyAppearanceChoice(mode));
}

// تبدّل مظهر النظام أثناء التشغيل يتبعه التطبيق ما دام الاختيار «تلقائي» —
// addListener بديل الإصدارات الأقدم من WebKit عن addEventListener
if (systemDarkQuery) {
  const followSystem = () => {
    if (savedAppearanceChoice() === "auto") renderAppearance("auto");
  };
  if (systemDarkQuery.addEventListener) systemDarkQuery.addEventListener("change", followSystem);
  else if (systemDarkQuery.addListener) systemDarkQuery.addListener(followSystem);
}

// البدء: يُحترم المحفوظ (أو «تلقائي») تطبيقًا بلا حفظ، وبالقرار نفسه الذي
// رسمه سكربت الرأس المبكر فلا وميض ولا اختلاف بين البدء والحالة النهائية
renderAppearance(savedAppearanceChoice());

// ---------- هوية البرج الفعّال (خريطة واحدة مُلزمة) ----------
// data-mode على الجذر (يضبطه برج شَذْب وحده عند التبديل) هو مصدر الحقيقة
// الوحيد، والقشرة تراقبه فتبدّل الاسم والعبارة وعنوان المستند معًا — مع
// العلامة والألوان اللتين يبدّلهما CSS من السمة نفسها — فلا شروط متفرقة
// يمكن أن تتفكك ولا رأس مختلط الهوية. عبارة شَذْب من ملفات الهوية المرجعية
// (زوج الأدوار في IdentitySection)، لا اختراع هنا
const PRODUCT_IDENTITY = {
  nasaq: {
    name: "نَسَق",
    statement: "البوابة الأخيرة قبل النشر",
    documentTitle: "نَسَق",
    actionLabel: "نسق",
  },
  shadhb: {
    name: "شَذْب",
    statement: "وظيفة تنقية الشذرات داخل نَسَق",
    documentTitle: "شَذْب — نَسَق",
    actionLabel: "افحص الشذرة",
  },
};

const productNameEl = document.querySelector(".app-title");
const productStatementEl = document.querySelector(".app-subtitle");
const aboutNameEl = document.querySelector(".about-app-name");
const aboutStatementEl = document.querySelector(".about-tagline");
const settingsPrivacyHintEl = el("settings-privacy-hint");

function activeProduct() {
  return document.documentElement.getAttribute("data-mode") === "shadhb" ? "shadhb" : "nasaq";
}

function renderProductIdentity() {
  const identity = PRODUCT_IDENTITY[activeProduct()];
  productNameEl.textContent = identity.name;
  productStatementEl.textContent = identity.statement;
  // هوية «حول» تتبع البرج نفسه كوحدة: الاسم والعبارة (والعلامة عبر CSS)
  aboutNameEl.textContent = identity.name;
  aboutStatementEl.textContent = identity.statement;
  settingsPrivacyHintEl.textContent =
    `أزرار المزوّدات تملأ الرابط واسم النموذج فقط ولا تغيّر المفتاح. ` +
    `يُحفظ كل شيء محليًا على جهازك فقط، ولا يُرسل أي نص إلا عند ضغط «${identity.actionLabel}».`;
  document.title = identity.documentTitle;
}

// المراقبة على السمة نفسها لا على من يضبطها — فلا استيراد متبادل بين البرجين
new MutationObserver(renderProductIdentity).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ["data-mode"],
});
renderProductIdentity();

// ---------- المسودات: تخزين محلي بالكامل، لا يغادر الجهاز ----------
// داخل التطبيق تُحفظ في drafts.json بجوار الإعدادات، وفي معاينة المتصفح في localStorage
const DRAFTS_KEY = "nasaq-drafts";
const DRAFTS_MAX = 100; // سقف هادئ يمنع تضخم الملف — الأقدم يخرج أولًا

const draftsOverlay = el("drafts-overlay");
const draftsList = el("drafts-list");
const draftsEmpty = el("drafts-empty");
const draftsCountBadge = el("drafts-count");
const draftsSearch = el("drafts-search");

// تنبيه: لا تسمِّ هذا المتغير «isTauri» — نواة Tauri تحقن خاصية عامة بهذا الاسم،
// وإعلان const يظللها يرمي SyntaxError يعطّل الملف كله داخل التطبيق
const insideTauri = Boolean(window.__TAURI__);

// المسودات هرمية: قائمة أمّهات، لكل أمّ نصها الخام وقائمة صيغها
// (النموذج والترحيل في drafts-model.js — دوال نقية تُنادى عبر window.NasaqDrafts)
let drafts = [];

// حالة العرض الهرمي: أمّ مفتوحة ← نوع مفتوح ← صيغة مفتوحة
let expandedMotherKey = null;
let expandedTypeName = null;
let openVersionId = null;

async function loadDraftsFromStore() {
  let raw = [];
  if (insideTauri) {
    try {
      raw = await invoke("load_drafts");
    } catch {
      raw = [];
    }
  } else {
    try {
      raw = JSON.parse(localStorage.getItem(DRAFTS_KEY)) || [];
    } catch {
      raw = [];
    }
  }

  // الترحيل من المسطّح إلى الهرمي يحدث هنا مرة واحدة عند أول قراءة:
  // المتطابقات (بعد التطبيع) تُجمَّع تحت أمّ واحدة، ولا تُفقد أي مسودة قائمة
  const { mothers, changed } = window.NasaqDrafts.migrateDrafts(raw);
  if (changed && mothers.length) {
    drafts = mothers;
    try {
      await persistDrafts();
    } catch {
      // تعذّر كتابة الترحيل لا يمنع العرض — سيُعاد الترحيل في الجلسة القادمة
    }
  }
  return mothers;
}

async function persistDrafts() {
  if (insideTauri) {
    await invoke("save_drafts", { drafts });
  } else {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  }
}

// الشارة تعدّ الصيغ المحفوظة كلها لا الأمّهات — هي «عدد المحفوظ» الفعلي
function totalVersions() {
  return drafts.reduce((sum, m) => sum + m.versions.length, 0);
}

function updateDraftsBadge() {
  const total = totalVersions();
  draftsCountBadge.textContent = String(total);
  draftsCountBadge.hidden = total === 0;
}

const draftDateFmt = new Intl.DateTimeFormat("ar", {
  dateStyle: "medium",
  timeStyle: "short",
});

// ---------- مفردات عرض المسودات: يحقنها الوضع النشط ----------
// نوع الصيغة وترتيب الأنواع مفاهيم من قاموس الوضع (مستويات نسق ومنصاته)،
// والقشرة آلية عرض محايدة: الوضع يسجّل مفرداته عند تحميله، وسقوطه لا
// يعطّل اللوحة — الاحتياط يعرض المستوى الخام بلا ترتيب خاص
let versionTypeOf = (v) => (v && v.intervention) || "غير محدد";
let draftTypeOrder = [];

function configureDraftsDisplay(config) {
  if (config && typeof config.versionTypeOf === "function") versionTypeOf = config.versionTypeOf;
  if (config && Array.isArray(config.typeOrder)) draftTypeOrder = config.typeOrder;
}

function orderedTypes(mother) {
  const present = new Set(mother.versions.map(versionTypeOf));
  const known = draftTypeOrder.filter((t) => present.has(t));
  // نوع قديم غير معروف (مسودة من إصدار سابق) يُلحق في الآخر ولا يُفقد
  const unknown = [...present].filter((t) => !draftTypeOrder.includes(t));
  return [...known, ...unknown];
}

// ---------- استعادة صيغة: تنفذها وحدة الوضع لا القشرة ----------
// زر «استعادة إلى الواجهة» في القشرة، لكن الاستعادة تكتب في حالة الوضع
// (الخانات والمحاور والجلسة) — الوضع يسجّل معالجه، وغيابه لا يكسر اللوحة
let restoreDraftHandler = null;
function registerRestoreHandler(fn) {
  restoreDraftHandler = fn;
}
function requestRestore(mother, version) {
  if (restoreDraftHandler) restoreDraftHandler(mother, version);
  else showToast("الاستعادة غير متاحة — وحدة الوضع لم تُحمَّل.");
}

// «صيغة واحدة / صيغتان / ٥ صيغ» — بجمع عربي سليم وأرقام عربية
function versionsCountLabel(n) {
  if (n === 1) return "صيغة واحدة";
  if (n === 2) return "صيغتان";
  const num = n.toLocaleString("ar");
  return n <= 10 ? `${num} صيغ` : `${num} صيغة`;
}

function mkToolBtn(label) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "tool-btn";
  b.textContent = label;
  return b;
}

// شارة «± أسطر» على الصيغة الناتجة عن تعديل أسطر — وسم خفيف لا نوع مستقل
function mkLinesBadge() {
  const b = document.createElement("span");
  b.className = "lines-badge";
  b.textContent = "± أسطر";
  b.title = "نتجت عن «سطور أقل/أكثر»";
  return b;
}

// الحذف بتأكيد على خطوتين بدل نافذة نظام — النمط المتبع في التطبيق كله
function armTwoStepDelete(btn, onConfirm) {
  let confirmTimer = null;
  btn.addEventListener("click", () => {
    if (!btn.classList.contains("confirming")) {
      btn.classList.add("confirming");
      btn.textContent = "تأكيد الحذف";
      confirmTimer = setTimeout(() => {
        btn.classList.remove("confirming");
        btn.textContent = "حذف";
      }, 3000);
      return;
    }
    clearTimeout(confirmTimer);
    onConfirm();
  });
}

// حذف صيغة: تُزال من أمّها فقط، وإن فرغت الأمّ من كل صيغها حُذفت كاملة.
// الأرقام لا تُخزَّن فتُعاد بلا فجوات تلقائيًا في العرض التالي
async function deleteVersion(mother, version) {
  mother.versions = mother.versions.filter((v) => v.id !== version.id);
  if (mother.versions.length === 0) {
    drafts = drafts.filter((m) => m.key !== mother.key);
    if (expandedMotherKey === mother.key) expandedMotherKey = null;
  }
  openVersionId = null;
  try {
    await persistDrafts();
  } catch {
    showToast("تعذّر تحديث ملف المسودات.");
  }
  renderDrafts();
  showToast("حُذفت الصيغة.");
}

// ---------- الطبقة 3: تفصيل الصيغة ----------
// النص الأصلي حاضر على مستوى الأمّ فلا يُكرَّر هنا — المنسّق وأزراره فقط
function buildVersionDetail(mother, version) {
  const detail = document.createElement("div");
  detail.className = "version-detail";

  const t = document.createElement("div");
  t.className = "draft-text";
  t.textContent = version.formatted || "";
  detail.appendChild(t);

  const actions = document.createElement("div");
  actions.className = "draft-actions";

  const copyB = mkToolBtn("نسخ النص المنسّق");
  copyB.addEventListener("click", async () => {
    showToast((await copyText(version.formatted || "")) ? "نُسخ النص المنسّق." : "تعذّر النسخ إلى الحافظة.");
  });

  const restoreB = mkToolBtn("استعادة إلى الواجهة");
  restoreB.addEventListener("click", () => requestRestore(mother, version));

  const deleteB = mkToolBtn("حذف");
  deleteB.classList.add("danger");
  armTwoStepDelete(deleteB, () => deleteVersion(mother, version));

  actions.append(copyB, restoreB, deleteB);
  detail.appendChild(actions);
  return detail;
}

// ---------- الطبقة 2: الأنواع داخل الأمّ ----------
function buildTypeSection(mother, type, versions) {
  const section = document.createElement("div");
  section.className = "type-section";

  const sorted = window.NasaqDrafts.sortVersions(versions);
  const single = sorted.length === 1;

  const typeBtn = document.createElement("button");
  typeBtn.type = "button";
  typeBtn.className = "type-btn";

  const name = document.createElement("span");
  name.textContent = type;
  typeBtn.appendChild(name);

  if (single) {
    // نوع بصيغة واحدة: الضغط على اسمه يفتح تفصيلها مباشرة
    if (sorted[0].linesAdjusted) typeBtn.appendChild(mkLinesBadge());
    typeBtn.classList.toggle("open", openVersionId === sorted[0].id);
    typeBtn.addEventListener("click", () => {
      openVersionId = openVersionId === sorted[0].id ? null : sorted[0].id;
      expandedTypeName = openVersionId === null ? null : type;
      renderDrafts();
    });
    section.appendChild(typeBtn);
    if (openVersionId === sorted[0].id) {
      section.appendChild(buildVersionDetail(mother, sorted[0]));
    }
    return section;
  }

  // نوع بعدة صيغ (حفظات من جلسات مختلفة على النص نفسه): الضغط يفتح قائمة
  // «صيغة ١/٢/٣» بترتيب وقت الحفظ (الأقدم = ١)
  const count = document.createElement("span");
  count.className = "chip";
  count.textContent = versionsCountLabel(sorted.length);
  typeBtn.appendChild(count);
  typeBtn.classList.toggle("open", expandedTypeName === type);
  typeBtn.addEventListener("click", () => {
    expandedTypeName = expandedTypeName === type ? null : type;
    openVersionId = null;
    renderDrafts();
  });
  section.appendChild(typeBtn);

  if (expandedTypeName === type) {
    const list = document.createElement("div");
    list.className = "version-list";
    sorted.forEach((v, i) => {
      const vBtn = document.createElement("button");
      vBtn.type = "button";
      vBtn.className = "version-btn";
      vBtn.classList.toggle("open", openVersionId === v.id);

      const label = document.createElement("span");
      label.textContent = `صيغة ${(i + 1).toLocaleString("ar")}`;
      vBtn.appendChild(label);
      if (v.linesAdjusted) vBtn.appendChild(mkLinesBadge());

      const date = document.createElement("time");
      date.className = "draft-date";
      date.textContent = draftDateFmt.format(new Date(v.createdAt));
      vBtn.appendChild(date);

      vBtn.addEventListener("click", () => {
        openVersionId = openVersionId === v.id ? null : v.id;
        renderDrafts();
      });
      list.appendChild(vBtn);
      if (openVersionId === v.id) {
        list.appendChild(buildVersionDetail(mother, v));
      }
    });
    section.appendChild(list);
  }

  return section;
}

// ---------- الطبقة 1: بطاقة الأمّ ----------
function buildMotherCard(mother) {
  const card = document.createElement("article");
  card.className = "draft-card";
  const isOpen = expandedMotherKey === mother.key;

  // رأس الأمّ: مقتطف النص الخام + عدد الصيغ + تاريخ أحدثها، والنقر يفتح/يطوي
  const summary = document.createElement("button");
  summary.type = "button";
  summary.className = "draft-summary";
  summary.title = isOpen ? "طيّ المسودة" : "عرض صيغ المسودة";

  const excerpt = document.createElement("div");
  excerpt.className = "draft-excerpt";
  excerpt.textContent = window.NasaqDrafts.draftExcerpt(mother.original);

  const meta = document.createElement("div");
  meta.className = "draft-meta";
  const count = document.createElement("span");
  count.className = "chip";
  count.textContent = versionsCountLabel(mother.versions.length);
  meta.appendChild(count);

  const sorted = window.NasaqDrafts.sortVersions(mother.versions);
  const newest = sorted[sorted.length - 1];
  if (newest) {
    const date = document.createElement("time");
    date.className = "draft-date";
    date.textContent = draftDateFmt.format(new Date(newest.createdAt));
    meta.appendChild(date);
  }

  summary.append(excerpt, meta);
  summary.addEventListener("click", () => {
    expandedMotherKey = isOpen ? null : mother.key;
    expandedTypeName = null;
    openVersionId = null;
    renderDrafts();
  });
  card.appendChild(summary);

  if (isOpen) {
    const body = document.createElement("div");
    body.className = "draft-texts";

    // النص الأصلي مرة واحدة على مستوى الأمّ — لا يتكرر داخل كل صيغة
    const box = document.createElement("div");
    const h = document.createElement("h3");
    h.textContent = "النص الأصلي";
    const t = document.createElement("div");
    t.className = "draft-text";
    t.textContent = mother.original || "";
    box.append(h, t);
    body.appendChild(box);

    const types = document.createElement("div");
    types.className = "type-list";
    for (const type of orderedTypes(mother)) {
      const versions = mother.versions.filter((v) => versionTypeOf(v) === type);
      types.appendChild(buildTypeSection(mother, type, versions));
    }
    body.appendChild(types);
    card.appendChild(body);
  }

  return card;
}

function renderDrafts() {
  draftsList.innerHTML = "";
  // البحث ترشيح للعرض فقط (v4.1) — القائمة المخزنة والشارة لا تتأثران
  const visible = window.NasaqDrafts.filterMothers(drafts, draftsSearch.value);
  draftsEmpty.textContent =
    drafts.length === 0 ? "لا توجد مسودات محفوظة بعد." : "لا مسودة تطابق البحث.";
  draftsEmpty.hidden = visible.length > 0;
  for (const m of visible) {
    draftsList.appendChild(buildMotherCard(m));
  }
  updateDraftsBadge();
}

// كتابة في البحث تعيد الرسم مرشَّحًا، وتطوي المفتوح كي لا يبقى تفصيل
// مفتوح لأمّ اختفت من العرض
draftsSearch.addEventListener("input", () => {
  expandedMotherKey = null;
  expandedTypeName = null;
  openVersionId = null;
  renderDrafts();
});

// إيداع دفعة صيغ تحت أمّها بالمفتاح المطبَّع (تُنشأ إن لم توجد) — النصف
// التخزيني لزر «حفظ»: الوضع يجهّز الصيغ من جلسته وينادي هنا، والقشرة
// تودِع وتثبّت وتعيد الرسم. لقطة تراجع داخلية عند فشل الكتابة فلا تبقى
// الذاكرة مخالفة للملف، والخطأ يُرمى للمنادي ليقرر رسالته
async function depositDraftVersions(key, original, newVersions) {
  const snapshot = JSON.stringify(drafts);
  const existing = drafts.find((m) => m.key === key);
  if (existing) {
    existing.versions.push(...newVersions);
    // الأمّ ذات النشاط الأحدث تتصدر القائمة
    drafts = [existing, ...drafts.filter((m) => m.key !== key)];
  } else {
    drafts.unshift({
      key,
      original,
      createdAt: new Date().toISOString(),
      versions: newVersions,
    });
    if (drafts.length > DRAFTS_MAX) drafts.length = DRAFTS_MAX;
  }
  try {
    await persistDrafts();
  } catch (err) {
    drafts = JSON.parse(snapshot);
    updateDraftsBadge();
    throw err;
  }
  renderDrafts();
}

// فتح لوحة المسودات وإغلاقها — الفتح يبدأ ببحث فارغ (عرض كامل)
function openDrafts() {
  expandedMotherKey = null;
  expandedTypeName = null;
  openVersionId = null;
  draftsSearch.value = "";
  renderDrafts();
  draftsOverlay.hidden = false;
}

function closeDrafts() {
  if (draftsOverlay.contains(document.activeElement)) el("drafts-btn").focus();
  draftsOverlay.hidden = true;
}

// ---------- النسخة الاحتياطية: تصدير واستيراد المسودات (v4.1) ----------
// التصدير نسخ لملف drafts.json كما هو (المسودات تُحفظ فور كل تغيير فالملف
// مطابق للذاكرة)، والاستيراد دمج لا استبدال: يمر بالترحيل نفسه فيقبل النسخ
// القديمة المسطّحة، والمطابق يُتخطى — فشل القراءة أو الحفظ لا يمس المحفوظ
function backupStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

el("export-drafts-btn").addEventListener("click", async () => {
  if (totalVersions() === 0) {
    showToast("لا توجد مسودات للنسخ الاحتياطي بعد.");
    return;
  }
  const fileName = `nasaq-drafts-${backupStamp()}.json`;
  if (insideTauri) {
    try {
      const saved = await invoke("export_drafts", { fileName });
      showToast(`حُفظت النسخة في التنزيلات: ${saved}`);
    } catch (err) {
      showError(String(err));
    }
  } else {
    // معاينة المتصفح: تنزيل مباشر من بيانات الجلسة
    const blob = new Blob([JSON.stringify(drafts, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("نُزّلت نسخة المسودات.");
  }
});

const importDraftsInput = el("import-drafts-input");
el("import-drafts-btn").addEventListener("click", () => importDraftsInput.click());
importDraftsInput.addEventListener("change", async () => {
  const file = importDraftsInput.files && importDraftsInput.files[0];
  importDraftsInput.value = ""; // ليقبل اختيار الملف نفسه مرة أخرى لاحقًا
  if (!file) return;

  let raw;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    showError("ملف النسخة غير صالح (ليس JSON) — لم يتغير شيء في مسوداتك.");
    return;
  }

  const { mothers } = window.NasaqDrafts.migrateDrafts(raw);
  const merged = window.NasaqDrafts.mergeImportedDrafts(drafts, mothers);
  if (merged.added === 0) {
    showToast("لا جديد في النسخة — كل ما فيها محفوظ أصلًا.");
    return;
  }

  // لقطة للتراجع إن فشل الحفظ — كما في مسار «حفظ» تمامًا
  const snapshot = JSON.stringify(drafts);
  // العدد المعلَن يُحسب بعد قصّ السقف لا قبله (الإصلاح ٢-د): الأمّهات
  // المستوردة تُلحق في ذيل القائمة والقصّ يطالها أولًا — لا تُعلن الرسالة
  // صيغًا أسقطها السقف بصمت
  const beforeTotal = totalVersions();
  drafts = merged.mothers;
  if (drafts.length > DRAFTS_MAX) drafts.length = DRAFTS_MAX;
  const actualAdded = totalVersions() - beforeTotal;
  if (actualAdded === 0) {
    drafts = JSON.parse(snapshot);
    showToast(`بلغت المسودات سقفها (${DRAFTS_MAX}) — لم يُستورد جديد.`);
    return;
  }
  try {
    await persistDrafts();
    renderDrafts();
    showToast(
      actualAdded < merged.added
        ? `استُوردت ${versionsCountLabel(actualAdded)} — والسقف (${DRAFTS_MAX}) أسقط الباقي.`
        : `استُوردت ${versionsCountLabel(actualAdded)}.`
    );
  } catch (err) {
    drafts = JSON.parse(snapshot);
    updateDraftsBadge();
    showError(String(err));
  }
});

el("drafts-btn").addEventListener("click", openDrafts);
el("close-drafts").addEventListener("click", closeDrafts);
draftsOverlay.addEventListener("click", (e) => {
  if (e.target === draftsOverlay) closeDrafts();
});

// ---------- Escape يغلق اللوحة المفتوحة: سجل مُغلقات بالأولوية ----------
// كل ضغطة تغلق لوحة واحدة. التسجيل بـ unshift: الأحدث تسجيلًا يُفحص أولًا،
// فالوضع (يُحمَّل بعد القشرة) تتقدم لوحاته لوحات القشرة. ترتيب تسجيل
// القشرة هنا مقصود: الإعدادات ثم المسودات ← فيصير الفحص النهائي
// [لوحات الوضع…، المسودات، الإعدادات] كسلوك v4.1 حرفيًا
const escapeClosers = [];
function registerEscapeCloser(isOpen, close) {
  escapeClosers.unshift({ isOpen, close });
}
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  for (const c of escapeClosers) {
    if (c.isOpen()) {
      c.close();
      return;
    }
  }
});
registerEscapeCloser(() => !overlay.hidden, closeSettings);
registerEscapeCloser(() => !draftsOverlay.hidden, closeDrafts);

// تحميل المسودات المحفوظة عند فتح التطبيق
(async () => {
  drafts = await loadDraftsFromStore();
  updateDraftsBadge();
})();

// إن لم يكن هناك مفتاح محفوظ، افتح الإعدادات عند أول تشغيل (داخل التطبيق فقط)
if (window.__TAURI__) {
  (async () => {
    try {
      const s = await invoke("load_settings");
      if (!s.apiKey) openSettings();
    } catch {
      openSettings();
    }
  })();
}

// ---------- الجسر الوحيد بين الوضعين (v4.4) ----------
// نصٌّ اعتمده وضع آخر يصير خامًا لنسق كنصٍّ جديد تمامًا: حدث الإدخال نفسه
// الذي يطلقه اللصق — فجلسة نسق تتصفّر بطبيعتها (كلمات جديدة = جلسة جديدة).
// كل عبور آخر بين الوضعين ممنوع — من لم يمرّ من هنا فهو خرق للعزل
function sendToNasaq(text) {
  const input = el("input-text");
  input.value = String(text || "");
  input.dispatchEvent(new Event("input"));
  input.focus();
}

// مفتاح شَذْب (v4.4): المرحلة 4 مرحلة الظهور فالافتراضي مفعَّل، ومفتاح
// الإطفاء الموعود منذ المرحلة 2 باقٍ: localStorage["nasaq-shadhb"] = "off"
// يخفي الوضع كليًا فتعود الواجهة مطابقة لـ v4.3 حرفيًا — بتر بلا جراحة
function readShadhbFlag() {
  try {
    return (localStorage.getItem("nasaq-shadhb") || "on") !== "off";
  } catch {
    return true;
  }
}

// ---------- واجهة القشرة الرسمية ----------
// العقد الأمامي بين القشرة والأوضاع: نسق يستعمل عوام القشرة مباشرة (ملفان
// في نطاق عام واحد)، أما «شَذْب» فيستهلك هذا الكائن حصرًا ولا يلمس دوال
// نسق ولا حالته — وجسر sendToNasaq معبره الوحيد إلى خانة النص
window.NasaqShell = {
  el,
  invoke,
  insideTauri,
  showToast,
  showError,
  clearError,
  copyText,
  updateCount,
  sendToNasaq,
  flags: { shadhbEnabled: readShadhbFlag() },
  registerEscapeCloser,
  drafts: {
    configureDisplay: configureDraftsDisplay,
    registerRestoreHandler,
    deposit: depositDraftVersions,
    count: totalVersions,
  },
};
