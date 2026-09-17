// قشرة «نسق» المشتركة — البنية الأمامية التي لا تعرف وضعًا ولا عقدًا:
// النواة (invoke)، الإعدادات، الثيمات، المسودات (تخزينًا وعرضًا)، الحافظة،
// الرسائل، والعدّاد. الوضع النشط يصل نفسه بها عبر التسجيل (مفردات عرض
// المسودات، معالج الاستعادة، مُغلقات Escape) — القشرة لا تنادي دوال وضعٍ
// باسمها أبدًا. (انقسمت عن main.js نقلًا حرفيًا في المرحلة 2 — v4.2)

// خارج التطبيق (معاينة متصفح) تبقى الواجهة والأدوات المحلية تعمل، وتفشل أوامر النواة برسالة واضحة
const invoke = window.__TAURI__?.core?.invoke
  ?? (async () => { throw "هذه معاينة متصفح — التشغيل الكامل عبر التطبيق نفسه."; });

const el = (id) => document.getElementById(id);

// عناصر الرسائل العامة — تخصّ القشرة، وبقية العناصر لوحداتها: الرسالة العابرة
// في شريط الحالة (Figma 263:7739)، وخانات التنبيه المعلَّمة data-error-slot
const toast = el("toast");
const toastMessage = el("toast-message");
const statusStart = el("status-start");

// ---------- عدّاد شريط الحالة ----------
// «٢٠ كلمة، ١٠٤ أحرف — ٧ أسطر» بأرقام هندية كما في شريط الحالة في Figma، والأسطر
// تُعدّ للنتيجة وحدها: عدّاد الأصل «٢٠ كلمة، ١٠٤ أحرف» (Figma 99:592).
// الأحرف تُعدّ نقاط ترميز لا وحدات UTF-16 (الإصلاح ١-د): الإيموجي الواحد محرف
// واحد في العرض. عدّادات حدود المنصات في nasaq.js لها منطقها المستقل
// (عدّ إكس هناك بوحدات UTF-16 عمدًا لأنه يطابق وزن المنصة) — لا يمسّها هذا
// «ar» وحده قد يعطي أرقامًا لاتينية بحسب ICU، فالنظام الهندي صريح هنا
const arabicDigits = new Intl.NumberFormat("ar-u-nu-arab");

// تمييز العدد بآخر رتبتين: ٣–١٠ جمع (٧ أسطر، ١٠٤ أحرف)، و١١–٩٩ مفرد منصوب
// (٢٠ كلمة، ٥٨ حرفًا)، وما سواهما مفرد (١٠٠ سطر)
function countLabel(n, [one, two, few, many, single]) {
  if (n === 1) return one;
  if (n === 2) return two;
  const num = arabicDigits.format(n);
  const tail = n % 100;
  if (tail >= 3 && tail <= 10) return `${num} ${few}`;
  if (tail >= 11) return `${num} ${many}`;
  return `${num} ${single}`;
}

function updateCount(node, text, { withLines = true } = {}) {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (!words) {
    node.textContent = `${arabicDigits.format(0)} كلمة`;
    return;
  }
  const chars = [...text].length;
  const lines = text.replace(/\n+$/, "").split("\n").length;
  node.textContent =
    `${countLabel(words, ["كلمة واحدة", "كلمتان", "كلمات", "كلمة", "كلمة"])}، ` +
    countLabel(chars, ["حرف واحد", "حرفان", "أحرف", "حرفًا", "حرف"]) +
    (withLines ? ` — ${countLabel(lines, ["سطر واحد", "سطران", "أسطر", "سطرًا", "سطر"])}` : "");
}

// العدّاد يبدأ على «٠ كلمة» قبل أي كتابة، كما في الحالة الفارغة
updateCount(el("input-count"), el("input-text").value);

// ---------- التنبيه في عمود الوحدة (Figma 99:669) ----------
// الخطأ عنوان ورسالة: ما قبل « — » (أو أول جملة) عنوان وما بعدها رسالة، وتضيف
// الوحدة طمأنة (note) وفعلًا اختياريًا (action: { label, run }). لكل برج خانتاه
// (فوق الأصل وفي عمود النتيجة، معلَّمتان بـ data-for) ويكتب فيهما صاحب الخطأ
// وحده (owner) — لا الوحدة الظاهرة لحظة وصوله، فلا يعبر تنبيه برج إلى الآخر.
// والتخطيط يُظهر من الخانتين ما يناسب عموده
const errorActions = {};
const errorSlotsOf = (owner) =>
  [...document.querySelectorAll("[data-error-slot]")].filter((slot) => slot.closest("[data-for]")?.dataset.for === owner);

function splitErrorText(text) {
  const clean = String(text || "").trim().replace(/رمز (\d+)/g, (_, code) => `رمز ${arabicDigits.format(Number(code)).replace(/٬/g, "")}`);
  let cut = clean.indexOf(" — ");
  let rest = 3;
  if (cut === -1) {
    cut = clean.indexOf(". ");
    rest = 2;
  }
  if (cut === -1) return { title: clean.replace(/\.$/, ""), message: "" };
  return { title: clean.slice(0, cut).replace(/\.$/, ""), message: clean.slice(cut + rest) };
}

// زوال تنبيه يُعلَن بحدث «nasaq:error-cleared» ومعه صاحبه — ويُعلَن أيضًا حين
// يحلّ خطأ جديد محل تنبيه ظاهر لصاحبه، فتعرف الوحدة أن ما عرضته زال
function announceErrorCleared(owner) {
  document.dispatchEvent(new CustomEvent("nasaq:error-cleared", { detail: { owner } }));
}

function showError(msg, { note = "", action = null, owner = activeProduct() } = {}) {
  const { title, message } = splitErrorText(msg);
  const body = [message, note].filter(Boolean).join(" ");
  const slots = errorSlotsOf(owner);
  if (slots.some((slot) => !slot.hidden)) announceErrorCleared(owner);
  errorActions[owner] = action;
  for (const slot of slots) {
    slot.querySelector("[data-error-title]").textContent = title;
    const messageEl = slot.querySelector("[data-error-message]");
    messageEl.textContent = body;
    messageEl.hidden = !body;
    slot.querySelector("[data-error-actions]").hidden = !action;
    slot.querySelector("[data-error-action]").textContent = action ? action.label : "";
    slot.hidden = false;
  }
}

function clearError(owner = activeProduct()) {
  const slots = errorSlotsOf(owner);
  const wasShown = slots.some((slot) => !slot.hidden);
  for (const slot of slots) slot.hidden = true;
  errorActions[owner] = null;
  if (wasShown) announceErrorCleared(owner);
}

document.addEventListener("click", (e) => {
  const slot = e.target.closest("[data-error-slot]");
  if (!slot) return;
  const owner = slot.closest("[data-for]")?.dataset.for;
  const action = errorActions[owner];
  if (e.target.closest("[data-error-close]")) {
    clearError(owner);
  } else if (e.target.closest("[data-error-action]") && action) {
    clearError(owner);
    action.run();
  }
});

// ---------- الرسالة العابرة في شريط الحالة ----------
// تحلّ محل مؤشر الحالة لحظة ثم تعود (Figma 263:7739). النبرة: success لما تمّ،
// neutral لما لا جديد فيه، warning لما تمّ بطريق آخر، danger لما تعذّر
let toastTimer = null;
function showToast(text, tone = "success") {
  toastMessage.textContent = text;
  toast.dataset.tone = tone;
  toast.hidden = false;
  statusStart.setAttribute("data-feedback", "");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.hidden = true;
    statusStart.removeAttribute("data-feedback");
  }, 2000);
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

// الإعدادات مؤقتة في النافذة الرئيسية حتى تحل محلها نافذة المرحلة ٥، فيعود
// التركيز عند الإغلاق إلى ما كان عليه قبل الفتح — لا يسقط إلى <body> (٢٫٤٫٣)
let settingsReturnFocus = null;

function closeSettings() {
  if (overlay.contains(document.activeElement)) settingsReturnFocus?.focus();
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
  if (overlay.hidden) settingsReturnFocus = document.activeElement;
  overlay.hidden = false;
  if (!apiKeyInput.value) apiKeyInput.focus();
}

// ⌘, اختصار الإعدادات المعتاد في الماك
document.addEventListener("keydown", (e) => {
  if (e.metaKey && !e.ctrlKey && !e.altKey && e.key === ",") {
    e.preventDefault();
    // ورقة أو تنبيه يحجب النافذة: لا طبقة إعدادات فوقه تتنازع معه التركيز
    if (window.NasaqWindow.isModalOpen()) return;
    // مفتوحة أصلًا: لا تُعاد قراءتها فتضيع تعديلات لم تُحفظ
    if (overlay.hidden) openSettings();
  }
});

// زر الترس الصغير أسفل الشريط الجانبي في الوحدتين — بجانب ⌘، وقائمة التطبيق
for (const button of document.querySelectorAll("[data-open-settings]")) {
  button.addEventListener("click", () => {
    if (overlay.hidden) openSettings();
  });
}

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
    downloading: opt.pct != null ? "جارٍ التنزيل… " + arabicDigits.format(opt.pct) + "٪" : "جارٍ التنزيل…",
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
// اتباع النظام. data-appearance على الجذر يثبّت color-scheme في tokens.css،
// وغيابه يترك light-dark() يتبع النظام. النافذة مخفية حتى أول رسم فلا وميض.
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

// تطبيق الحالة على الجذر والأزرار دون حفظ — يُستدعى عند البدء واتباع النظام
function renderAppearance(choice) {
  if (choice === "auto") {
    document.documentElement.removeAttribute("data-appearance");
  } else {
    document.documentElement.setAttribute("data-appearance", isDarkAppearance(choice) ? "dark" : "light");
  }
  for (const mode of APPEARANCE_MODES) {
    appearanceButtons[mode].setAttribute("aria-pressed", String(mode === choice));
  }
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

// البدء: يُحترم المحفوظ (أو «تلقائي») تطبيقًا بلا حفظ، قبل أن تظهر النافذة
renderAppearance(savedAppearanceChoice());

// ---------- هوية البرج الفعّال (خريطة واحدة مُلزمة) ----------
// data-module على الجذر (يضبطه برج شَذْب وحده عند التبديل) هو مصدر الحقيقة
// الوحيد: CSS يبدّل منه الألوان والمناطق المعلَّمة بـ data-for، والقشرة تبدّل
// منه ما لا يبلغه CSS — عنوان المستند، وعنصر المحرر النائب، وهوية «حول» —
// فلا شروط متفرقة يمكن أن تتفكك. العبارتان من شعار التطبيق في Figma
const PRODUCT_IDENTITY = {
  nasaq: {
    name: "نَسَق",
    statement: "كلماتك كما هي، بنَسَقٍ أوضح",
    documentTitle: "نَسَق",
    actionLabel: "نسّق",
    editorPlaceholder: "الصق نصّك هنا أو ابدأ الكتابة مباشرة…",
  },
  shadhb: {
    name: "شَذْب",
    statement: "وظيفة تنقية الشذرات داخل نَسَق",
    documentTitle: "شَذْب — نَسَق",
    actionLabel: "افحص الشذرة",
    editorPlaceholder: "الصق الشذرة هنا أو اكتبها مباشرة…",
  },
};

const aboutNameEl = document.querySelector(".about-app-name");
const aboutStatementEl = document.querySelector(".about-tagline");
const settingsPrivacyHintEl = el("settings-privacy-hint");

function activeProduct() {
  return document.documentElement.getAttribute("data-module") === "shadhb" ? "shadhb" : "nasaq";
}

function renderProductIdentity() {
  const identity = PRODUCT_IDENTITY[activeProduct()];
  el("input-text").placeholder = identity.editorPlaceholder;
  // هوية «حول» تتبع البرج نفسه كوحدة: الاسم والعبارة
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
  attributeFilter: ["data-module"],
});
renderProductIdentity();

// ---------- المسودات: تخزين محلي بالكامل، لا يغادر الجهاز ----------
// داخل التطبيق تُحفظ في drafts.json بجوار الإعدادات، وفي معاينة المتصفح في localStorage
const DRAFTS_KEY = "nasaq-drafts";
const DRAFTS_MAX = 100; // سقف هادئ يمنع تضخم الملف — الأقدم يخرج أولًا

const draftsList = el("drafts-list");
const draftsEmpty = el("drafts-empty");
const draftsCountBadge = el("drafts-count");
const draftsSearch = el("drafts-search");
const draftsSearchClear = el("drafts-search-clear");
const draftsFooterNote = el("drafts-footer-note");

// تنبيه: لا تسمِّ هذا المتغير «isTauri» — نواة Tauri تحقن خاصية عامة بهذا الاسم،
// وإعلان const يظللها يرمي SyntaxError يعطّل الملف كله داخل التطبيق
const insideTauri = Boolean(window.__TAURI__);

// المسودات هرمية: قائمة أمّهات، لكل أمّ نصها الخام وقائمة صيغها
// (النموذج والترحيل في drafts-model.js — دوال نقية تُنادى عبر window.NasaqDrafts)
let drafts = [];

// حالة العرض: المسودات المفتوحة (تُظهر صيغها) بمفتاحها، وآخر صف كان عليه التركيز
const expandedDrafts = new Set();
let focusedRowKey = null;

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

// عدد الصيغ المحفوظة كلها — «عدد المحفوظ» الفعلي للنسخ الاحتياطي والاستيراد
function totalVersions() {
  return drafts.reduce((sum, m) => sum + m.versions.length, 0);
}

// الشارة والتذييل يعدّان المسودات نفسها كما في Figma (97:116): «٣» و«٣ مسودات
// محفوظة محلياً»، والبحث لا يغيّرهما لأنه ترشيح للعرض فقط
function updateDraftsBadge() {
  const n = drafts.length;
  draftsCountBadge.textContent = arabicDigits.format(n);
  draftsCountBadge.hidden = n === 0;
  draftsFooterNote.textContent =
    n === 0
      ? "تُحفظ على جهازك فقط"
      : n === 1
        ? "مسودة واحدة محفوظة محلياً"
        : n === 2
          ? "مسودتان محفوظتان محلياً"
          : `${countLabel(n, ["", "", "مسودات", "مسودة", "مسودة"])} محفوظة محلياً`;
}

// ---------- مفردات عرض المسودات: يحقنها الوضع النشط ----------
// نوع الصيغة مفهوم من قاموس الوضع (مستويات نسق ومنصاته)، والقشرة آلية عرض
// محايدة: الوضع يسجّل مفرداته عند تحميله، وسقوطه لا يعطّل الشريط — الاحتياط
// يعرض المستوى الخام. ترتيب الأنواع يُقبل في التسجيل، والصيغ تُعرض الأحدث أولًا
let versionTypeOf = (v) => (v && v.intervention) || "غير محدد";
let draftTypeOrder = [];

// المسودات قد تُرسم قبل أن يسجّل الوضع مفرداته (القراءة غير متزامنة) — فالتسجيل يعيد
// رسمها بمفرداته
function configureDraftsDisplay(config) {
  if (config && typeof config.versionTypeOf === "function") versionTypeOf = config.versionTypeOf;
  if (config && Array.isArray(config.typeOrder)) draftTypeOrder = config.typeOrder;
  if (drafts.length) renderDrafts();
}

// ---------- استعادة صيغة: تنفذها وحدة الوضع لا القشرة ----------
// «استعادة إلى المحرر» في قائمة القشرة، لكن الاستعادة تكتب في حالة الوضع
// (الخانات والمحاور والجلسة) — الوضع يسجّل معالجه، وغيابه لا يكسر الشريط
let restoreDraftHandler = null;
function registerRestoreHandler(fn) {
  restoreDraftHandler = fn;
}
function requestRestore(mother, version) {
  if (restoreDraftHandler) restoreDraftHandler(mother, version);
  else showToast("الاستعادة غير متاحة — وحدة الوضع لم تُحمَّل.", "danger");
}

// «صيغة واحدة / صيغتان / ٥ صيغ / ١١ صيغة» — بجمع عربي سليم وأرقام هندية
function versionsCountLabel(n) {
  return countLabel(n, ["صيغة واحدة", "صيغتان", "صيغ", "صيغة", "صيغة"]);
}

// ---------- الوقت النسبي: «١٢:٤٠»، «أمس»، «الإثنين»، ثم التاريخ ----------
const draftTimeFmt = new Intl.DateTimeFormat("ar-u-nu-arab", { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
const draftDateFmt = new Intl.DateTimeFormat("ar-u-nu-arab", { day: "numeric", month: "numeric", year: "numeric" });
const WEEKDAYS = ["الأحد", "الإثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"];

function draftStamp(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const dayStart = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((dayStart(new Date()) - dayStart(d)) / 86400000);
  if (days <= 0) return draftTimeFmt.format(d);
  if (days === 1) return "أمس";
  if (days < 7) return WEEKDAYS[d.getDay()];
  return draftDateFmt.format(d);
}

// الأحدث أولًا، والصيغ المحفوظة في اللحظة نفسها بترتيب أنواع الوضع (المستويات ثم المنصات)
function newestFirst(versions) {
  const rank = (v) => {
    const i = draftTypeOrder.indexOf(versionTypeOf(v));
    return i === -1 ? draftTypeOrder.length : i;
  };
  return [...versions].sort(
    (a, b) =>
      String(b.createdAt || "").localeCompare(String(a.createdAt || "")) ||
      rank(a) - rank(b) ||
      String(b.id).localeCompare(String(a.id))
  );
}

// «مقال، تنسيق قراءة، ٣ صيغ» — النمط والنوع حين يتفقان في كل الصيغ، ثم العدد
function draftSubtitle(mother) {
  const styles = new Set(mother.versions.map((v) => v.style).filter(Boolean));
  const types = new Set(mother.versions.map(versionTypeOf));
  const parts = [];
  if (styles.size === 1) parts.push([...styles][0]);
  if (types.size === 1) parts.push([...types][0]);
  parts.push(versionsCountLabel(mother.versions.length));
  return parts.join("، ");
}

// ---------- الصفوف (Figma 97:116): مسودة ٤٤ بسهم طي، وصيغة ٣٢ بشارة «± أسطر» ----------
function span(className, text) {
  const s = document.createElement("span");
  s.className = className;
  s.textContent = text;
  return s;
}

function buildDraftRow(mother) {
  const expanded = expandedDrafts.has(mother.key);
  const row = document.createElement("div");
  row.className = "draft-row";
  row.setAttribute("role", "treeitem");
  row.setAttribute("aria-level", "1");
  row.setAttribute("aria-expanded", String(expanded));
  row.dataset.draftKey = mother.key;
  row.tabIndex = -1;
  row.innerHTML = expanded
    ? '<svg class="icon row-disclosure" aria-hidden="true"><use href="#chevron.down.16m" /></svg>'
    : '<svg class="icon row-disclosure" aria-hidden="true"><use href="#chevron.forward.16m" /></svg>';
  row.insertAdjacentHTML("beforeend", '<svg class="icon row-icon" aria-hidden="true"><use href="#doc.text.16r" /></svg>');

  const text = span("row-text", "");
  text.append(span("row-title", window.NasaqDrafts.draftExcerpt(mother.original)), span("row-subtitle", draftSubtitle(mother)));
  const newest = newestFirst(mother.versions)[0];
  const meta = document.createElement("time");
  meta.className = "row-meta";
  if (newest) {
    meta.dateTime = newest.createdAt;
    meta.textContent = draftStamp(newest.createdAt);
  }
  row.append(text, meta);
  return row;
}

// الصيغة تحت مسودتها: يومها يحمله صف المسودة، فوقتها وحده يكفي ما دامت من اليوم
// نفسه («تنسيق إيقاعي، ١٠:١٥»)، وإلا فوقتها النسبي كاملًا
function versionStamp(version, newest) {
  const d = new Date(version.createdAt);
  const n = new Date(newest.createdAt);
  const sameDay = d.toDateString() === n.toDateString();
  return sameDay && !Number.isNaN(d.getTime()) ? draftTimeFmt.format(d) : draftStamp(version.createdAt);
}

function buildVersionRow(mother, version, newest) {
  const row = document.createElement("div");
  row.className = "version-row";
  row.setAttribute("role", "treeitem");
  row.setAttribute("aria-level", "2");
  row.dataset.draftKey = mother.key;
  row.dataset.versionId = String(version.id);
  row.tabIndex = -1;
  row.title = "انقر مرتين للاستعادة إلى المحرر";
  row.innerHTML = '<svg class="icon row-icon" aria-hidden="true"><use href="#doc.text.16r" /></svg>';
  row.append(span("row-title", `${versionTypeOf(version)}، ${versionStamp(version, newest)}`));
  // وسم خفيف على الصيغة الناتجة عن تعديل أسطر — لا نوع مستقل
  if (version.linesAdjusted) {
    const badge = span("count-badge", "± أسطر");
    badge.title = "نتجت عن «سطور أقل/أكثر»";
    row.appendChild(badge);
  }
  return row;
}

// البحث ترشيح للعرض فقط (v4.1): النص الأصلي والصيغ، ونوع التنسيق ونمطه أيضًا
// كما تعد حالة عدم التطابق («ابحث بنوع التنسيق»)
function visibleDrafts() {
  const needle = window.NasaqDrafts.draftKey(draftsSearch.value);
  if (!needle) return drafts;
  const byText = new Set(window.NasaqDrafts.filterMothers(drafts, needle));
  return drafts.filter(
    (m) => byText.has(m) || m.versions.some((v) => versionTypeOf(v).includes(needle) || String(v.style || "").includes(needle))
  );
}

function renderDrafts() {
  const hadFocus = draftsList.contains(document.activeElement);
  draftsList.innerHTML = "";
  const visible = visibleDrafts();
  const none = drafts.length === 0;
  draftsEmpty.querySelector(".empty-title").textContent = none ? "لا مسودات بعد" : "لا مسودة تطابق البحث";
  draftsEmpty.querySelector(".empty-body").textContent = none
    ? "احفظ النتيجة من شريط الأدوات لتجد النص الأصلي وصيغه هنا."
    : "جرّب كلمة أقصر أو ابحث بنوع التنسيق.";
  draftsEmpty.hidden = visible.length > 0;

  for (const m of visible) {
    draftsList.appendChild(buildDraftRow(m));
    if (!expandedDrafts.has(m.key)) continue;
    const group = document.createElement("div");
    group.className = "draft-versions";
    group.setAttribute("role", "group");
    const versions = newestFirst(m.versions);
    for (const v of versions) group.appendChild(buildVersionRow(m, v, versions[0]));
    draftsList.appendChild(group);
  }

  // تركيز لوحة المفاتيح يبقى على صفه بعد إعادة الرسم، وصف واحد يقبل Tab
  const rows = [...draftsList.querySelectorAll("[data-draft-key]")];
  const current = rows.find((r) => rowId(r) === focusedRowKey) || rows[0];
  if (current) {
    current.tabIndex = 0;
    if (hadFocus) current.focus();
  }
  updateDraftsBadge();
}

// هوية الصف للتركيز: المسودة بمفتاحها، والصيغة بمفتاح أمّها ومعرّفها
const rowId = (row) => (row.dataset.versionId === undefined ? `d:${row.dataset.draftKey}` : `v:${row.dataset.draftKey}:${row.dataset.versionId}`);

function rowTarget(row) {
  const mother = drafts.find((m) => m.key === row.dataset.draftKey);
  const { versionId } = row.dataset;
  const version = mother && versionId !== undefined ? mother.versions.find((v) => String(v.id) === versionId) : null;
  return { mother, version };
}

function toggleDraft(key) {
  if (expandedDrafts.has(key)) expandedDrafts.delete(key);
  else expandedDrafts.add(key);
  focusedRowKey = `d:${key}`;
  renderDrafts();
}

async function copyDraftText(version) {
  const ok = await copyText((version && version.formatted) || "");
  showToast(ok ? "نُسخ النص المنسّق." : "تعذّر النسخ إلى الحافظة.", ok ? "success" : "danger");
}

// ---------- القائمة السياقية (Figma 262:7061 و303:21134) ----------
// نسخ واستعادة وحذف: للمسودة تعمل على أحدث صيغها، وللصيغة على الصيغة نفسها،
// وإطار بلون الوحدة حول الصف ما دامت قائمته مفتوحة
function openRowMenu(row, x, y, keyboard = false) {
  const { mother, version } = rowTarget(row);
  if (!mother) return;
  const target = version || newestFirst(mother.versions)[0];
  row.setAttribute("data-context-target", "");
  window.NasaqWindow.openMenuAt(
    x,
    y,
    [
      [
        { label: "نسخ النص المنسّق", run: () => copyDraftText(target) },
        { label: "استعادة إلى المحرر", run: () => requestRestore(mother, target) },
      ],
      [{ label: version ? "حذف الصيغة…" : "حذف المسودة…", destructive: true, run: () => confirmDelete(mother, version) }],
    ],
    { label: version ? "الصيغة" : "المسودة", returnFocus: row, keyboard, onClose: () => row.removeAttribute("data-context-target") }
  );
}

draftsList.addEventListener("click", (e) => {
  const row = e.target.closest("[data-draft-key]");
  if (!row) return;
  focusedRowKey = rowId(row);
  if (row.classList.contains("draft-row")) toggleDraft(row.dataset.draftKey);
  else {
    for (const r of draftsList.querySelectorAll("[data-draft-key]")) r.tabIndex = r === row ? 0 : -1;
    row.focus();
  }
});

draftsList.addEventListener("dblclick", (e) => {
  const row = e.target.closest(".version-row");
  if (!row) return;
  const { mother, version } = rowTarget(row);
  if (version) requestRestore(mother, version);
});

draftsList.addEventListener("contextmenu", (e) => {
  const row = e.target.closest("[data-draft-key]");
  if (!row) return;
  e.preventDefault();
  focusedRowKey = rowId(row);
  openRowMenu(row, e.clientX, e.clientY);
});

// لوحة المفاتيح كقائمة الماك الهرمية: الأسهم تتنقل، واليسار يفتح واليمين يطوي
// (اتجاه عربي)، وReturn أو المسافة تفتح المسودة، وReturn على الصيغة أو ⇧F10 يفتح قائمة الصف
draftsList.addEventListener("keydown", (e) => {
  const row = e.target.closest("[data-draft-key]");
  if (!row) return;
  const rows = [...draftsList.querySelectorAll("[data-draft-key]")];
  const i = rows.indexOf(row);
  const move = (next) => {
    if (!next) return;
    e.preventDefault();
    for (const r of rows) r.tabIndex = r === next ? 0 : -1;
    focusedRowKey = rowId(next);
    next.focus();
  };
  const isDraft = row.classList.contains("draft-row");
  const expanded = row.getAttribute("aria-expanded") === "true";
  if (e.key === "ArrowDown") move(rows[i + 1]);
  else if (e.key === "ArrowUp") move(rows[i - 1]);
  else if (e.key === "ArrowLeft" && isDraft && !expanded) {
    e.preventDefault();
    toggleDraft(row.dataset.draftKey);
  } else if (e.key === "ArrowRight") {
    if (isDraft && expanded) {
      e.preventDefault();
      toggleDraft(row.dataset.draftKey);
    } else if (!isDraft) {
      move(rows.slice(0, i).reverse().find((r) => r.classList.contains("draft-row")));
    }
  } else if (isDraft && (e.key === "Enter" || e.key === " ")) {
    e.preventDefault();
    toggleDraft(row.dataset.draftKey);
  } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10") || (!isDraft && e.key === "Enter")) {
    // الاستعادة تستبدل ما في المحرر: بلوحة المفاتيح تمرّ بقائمة الصف لا بضغطة واحدة
    e.preventDefault();
    const r = row.getBoundingClientRect();
    openRowMenu(row, r.right - 12, r.bottom, true);
  }
});

// ---------- البحث: زر مسح يظهر مع النص، وEsc يمسح ----------
draftsSearch.addEventListener("input", () => {
  draftsSearchClear.hidden = !draftsSearch.value;
  renderDrafts();
});
draftsSearchClear.addEventListener("click", () => {
  draftsSearch.value = "";
  draftsSearch.dispatchEvent(new Event("input"));
  draftsSearch.focus();
});
draftsSearch.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !draftsSearch.value) return;
  e.preventDefault();
  e.stopPropagation();
  draftsSearchClear.click();
});

// ---------- الحذف بتنبيه في وسط النافذة (Figma 263:7635 و303:21344) ----------
// «إلغاء» يأخذ التركيز فلا يحذف Return شيئًا، وEsc يلغي
const deleteAlert = el("delete-alert");
let pendingDelete = null;

function confirmDelete(mother, version) {
  pendingDelete = { key: mother.key, versionId: version ? version.id : null };
  el("delete-alert-title").textContent = version
    ? `حذف صيغة «${versionTypeOf(version)}»؟`
    : `حذف «${window.NasaqDrafts.draftExcerpt(mother.original)}»؟`;
  el("delete-alert-message").textContent = version
    ? "ستُحذف هذه الصيغة من جهازك، ولا يمكن التراجع عن ذلك."
    : "ستُحذف المسودة وصيغها المحفوظة من جهازك، ولا يمكن التراجع عن ذلك.";
  window.NasaqWindow.presentModal(deleteAlert, {
    initialFocus: "#delete-alert-cancel",
    fallbackFocus: () => draftsList.querySelector('[tabindex="0"]') || draftsSearch,
  });
}

function closeDeleteAlert() {
  pendingDelete = null;
  window.NasaqWindow.dismissModal(deleteAlert);
}

el("delete-alert-cancel").addEventListener("click", closeDeleteAlert);
el("delete-alert-confirm").addEventListener("click", async () => {
  const request = pendingDelete;
  closeDeleteAlert();
  const mother = request && drafts.find((m) => m.key === request.key);
  if (!mother) return;
  if (request.versionId === null) {
    await deleteDraft(mother);
  } else {
    const version = mother.versions.find((v) => v.id === request.versionId);
    if (version) await deleteVersion(mother, version);
  }
});

// حذف صيغة: تُزال من أمّها فقط، وإن فرغت الأمّ من كل صيغها حُذفت كاملة.
// الأرقام لا تُخزَّن فتُعاد بلا فجوات تلقائيًا في العرض التالي
async function deleteVersion(mother, version) {
  mother.versions = mother.versions.filter((v) => v.id !== version.id);
  if (mother.versions.length === 0) {
    drafts = drafts.filter((m) => m.key !== mother.key);
    expandedDrafts.delete(mother.key);
  }
  focusedRowKey = `d:${mother.key}`;
  try {
    await persistDrafts();
  } catch {
    renderDrafts();
    showToast("تعذّر تحديث ملف المسودات.", "danger");
    return;
  }
  renderDrafts();
  showToast("حُذفت الصيغة.");
}

// حذف المسودة كاملة بصيغها — لقطة تراجع إن فشلت الكتابة كما في الإيداع
async function deleteDraft(mother) {
  const snapshot = JSON.stringify(drafts);
  drafts = drafts.filter((m) => m.key !== mother.key);
  expandedDrafts.delete(mother.key);
  focusedRowKey = null;
  try {
    await persistDrafts();
  } catch {
    drafts = JSON.parse(snapshot);
    renderDrafts();
    showToast("تعذّر تحديث ملف المسودات.", "danger");
    return;
  }
  renderDrafts();
  showToast("حُذفت المسودة.");
}

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

// المسودات تعيش في الشريط الجانبي فلا لوحة تُغلق: بعد استعادة صيغة يُعاد رسم
// الشريط، ويبقى التركيز حيث نقر الكاتب
function closeDrafts() {
  renderDrafts();
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
    showToast("لا توجد مسودات للنسخ الاحتياطي بعد.", "neutral");
    return;
  }
  const fileName = `nasaq-drafts-${backupStamp()}.json`;
  if (insideTauri) {
    try {
      const saved = await invoke("export_drafts", { fileName });
      showToast(`حُفظت النسخة في التنزيلات: ${saved}`);
    } catch (err) {
      showError(String(err), { owner: "nasaq" });
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
    showError("ملف النسخة غير صالح (ليس JSON) — لم يتغير شيء في مسوداتك.", { owner: "nasaq" });
    return;
  }

  const { mothers } = window.NasaqDrafts.migrateDrafts(raw);
  const merged = window.NasaqDrafts.mergeImportedDrafts(drafts, mothers);
  if (merged.added === 0) {
    showToast("لا جديد في النسخة — كل ما فيها محفوظ أصلًا.", "neutral");
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
    showToast(`بلغت المسودات سقفها (${arabicDigits.format(DRAFTS_MAX)}) — لم يُستورد جديد.`, "warning");
    return;
  }
  try {
    await persistDrafts();
    renderDrafts();
    showToast(
      actualAdded < merged.added
        ? `استُوردت ${versionsCountLabel(actualAdded)} — والسقف (${arabicDigits.format(DRAFTS_MAX)}) أسقط الباقي.`
        : `استُوردت ${versionsCountLabel(actualAdded)}.`,
      actualAdded < merged.added ? "warning" : "success"
    );
  } catch (err) {
    drafts = JSON.parse(snapshot);
    updateDraftsBadge();
    showError(String(err), { owner: "nasaq" });
  }
});

// ---------- Escape يغلق اللوحة المفتوحة: سجل مُغلقات بالأولوية ----------
// كل ضغطة تغلق لوحة واحدة. التسجيل بـ unshift: الأحدث تسجيلًا يُفحص أولًا،
// فالوضع (يُحمَّل بعد القشرة) تتقدم لوحاته لوحات القشرة: [لوحات الوضع…، الإعدادات]
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
registerEscapeCloser(() => !deleteAlert.hidden, closeDeleteAlert);

// تحميل المسودات المحفوظة عند فتح التطبيق — تُعرض في الشريط الجانبي فورًا
(async () => {
  drafts = await loadDraftsFromStore();
  renderDrafts();
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

// ---------- الجسر الوحيد بين البرجين ----------
// نصٌّ اعتمده وضع آخر يصير خامًا لنسق كنصٍّ جديد تمامًا: حدث الإدخال نفسه
// الذي يطلقه اللصق — فجلسة نسق تتصفّر بطبيعتها (كلمات جديدة = جلسة جديدة).
// كل عبور آخر بين الوضعين ممنوع — من لم يمرّ من هنا فهو خرق للعزل
function sendToNasaq(text) {
  const input = el("input-text");
  input.value = String(text || "");
  input.dispatchEvent(new Event("input"));
  input.focus();
}

// مفتاح شَذْب: صمّام أمان للبرج لا وعدٌ بواجهة سابقة —
// localStorage["nasaq-shadhb"] = "off" يخفي شَذْب كليًا (المبدّل ومناطقه
// وأوامره) فيعمل التطبيق على نَسَق وحده. الافتراضي مفعَّل، والدرع في
// shadhb.js يبقى فوقه: تعطّل البرج معزول أيضًا بلا إطفاء يدوي
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
  // تنسيق الأعداد المشترك: النظام الهندي صريحًا، وجمعٌ عربي سليم بتمييز
  // الرتبتين الأخيرتين — واحد لكل ما يُعرض في الوحدتين
  formatNumber: (n) => arabicDigits.format(n),
  countLabel,
  // تنبيهات شَذْب في خانتيه هو، أيًّا كانت الوحدة الظاهرة حين يصل الخطأ
  showError: (msg, options = {}) => showError(msg, { ...options, owner: "shadhb" }),
  clearError: () => clearError("shadhb"),
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
