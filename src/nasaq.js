// وحدة وضع «نسق» — منطق التنسيق كاملًا: المحاور الثلاثة، التنظيف المحلي،
// نداءات النموذج، ذاكرة الجلسة والتراجع، أدوات النتيجة، بطاقة الشذرة،
// لوحة التنويعات، عدسة القراءة، وعدّاد المنصات. تستعمل عوام القشرة
// (shell.js تُحمَّل قبلها) وتصل نفسها بها بالتسجيل في ذيل هذا الملف.
// لا تعرف شيئًا عن «شَذْب» ولا تستورد منه. (انقسمت عن main.js نقلًا
// حرفيًا في المرحلة 2 — v4.2)

const inputText = el("input-text");
const outputText = el("output-text");
const outputPlaceholder = el("output-placeholder");
const formatBtn = el("format-btn");
const copyBtn = el("copy-btn");
const loading = el("loading");
const notesBox = el("notes-box");
const notesList = el("notes-list");
const rhythmFingerprint = el("rhythm-fingerprint");
const inputCount = el("input-count");
const outputCount = el("output-count");

// علاج علّة مؤشر WebKit: plaintext مع وجود نص، وisolate عند الفراغ حتى يبقى المؤشر يمينًا دائمًا
function syncCaretBidi() {
  inputText.classList.toggle("empty-bidi", !inputText.value);
}

inputText.addEventListener("input", () => {
  updateCount(inputCount, inputText.value);
  syncCaretBidi();
  // تعديل الكلمات نفسها (لا المسافات والأسطر — المفتاح مطبَّع) يبدأ جلسة جمع
  // جديدة: صيغ النص السابق غير المحفوظة تُفقد، فهي لنص لم يعد يُعمل عليه
  if (sessionKey && window.NasaqDrafts.draftKey(inputText.value) !== sessionKey) {
    resetSession();
  }
});

syncCaretBidi();

// ---------- التوجيهات الخاصة (v4.0) ----------
// خانة حرة صغيرة لقرارات تنسيق موضعية لا يغطيها زر. فارغة = السلوك القديم
// حرفيًا (بناة الرسائل في nasaq/contracts.rs يبنون رسالة مطابقة بايتًا لما
// قبلها). قيمتها تُقرأ لحظة كل نداء وتُمرَّر للنداءات الإبداعية الثلاثة —
// تنسيق فقط، لا إعادة صياغة
const directivesInput = el("custom-directives");

function currentDirectives() {
  const d = directivesInput.value.trim();
  return d || null;
}

// علاج علّة مؤشر WebKit نفسها للحقل الجديد
function syncDirectivesCaretBidi() {
  directivesInput.classList.toggle("empty-bidi", !directivesInput.value);
}
directivesInput.addEventListener("input", syncDirectivesCaretBidi);
syncDirectivesCaretBidi();

// التركيز التلقائي على الخام عند الفتح — المؤشر ينبض فور دخول الكاتب.
// (لوحة الإعدادات إن فُتحت لغياب المفتاح تنقل التركيز إليها لاحقًا بطبيعتها)
inputText.focus();

// ---------- المحاور الثلاثة: مصدر الحقيقة الوحيد ----------
// القوائم تُملأ من هذه الثوابت، والمسودات ونداءات النموذج تستعمل القيم نفسها.
// أي تعديل هنا يجب أن يطابق ثوابت nasaq/contracts.rs حرفًا بحرف
const STYLES = ["مقال", "منشور", "شذرة", "رسالة", "مخطط"];
const LEVELS = {
  CLEAN: "تنظيف فقط",
  READ: "تنسيق قراءة",
  RHYTHM: "تنسيق إيقاعي",
  RHYTHM_DOTTED: "إيقاعي منقّط",
  PUBLISH: "تجهيز للنشر",
  PLATFORM: "تنسيق منصة",
};
const LEVEL_ORDER = [
  LEVELS.CLEAN,
  LEVELS.READ,
  LEVELS.RHYTHM,
  LEVELS.RHYTHM_DOTTED,
  LEVELS.PUBLISH,
  LEVELS.PLATFORM,
];
// سابستاك وجهان تقنيًا مختلفان (المقال RTL، النوت LTR) وهما الوجهة الأولى؛
// البقية ثانوية وتبقى. المسودات القديمة باسم «سابستاك» تُعرض نوعًا قائمًا بذاته
const PLATFORMS = ["مقال سابستاك", "نوت سابستاك", "إكس", "ثريدز", "إنستغرام", "واتساب"];
const DEFAULT_LEVEL = LEVELS.READ;

// وجها سابستاك — التنويعات والتصدير وبطاقة الشذرة تُفعَّل لهما فقط.
// «سابستاك» بلا وجه هو الاسم القديم في المسودات المحفوظة — يُعامل كوجه
// المقال مطابقةً لـis_substack في nasaq/contracts.rs، فلا تفقد المسودة
// المستعادة أدواتها (الإصلاح ٢-و)
const SUBSTACK_ARTICLE = "مقال سابستاك";
const SUBSTACK_NOTE = "نوت سابستاك";
const isSubstackFace = (p) =>
  p === SUBSTACK_ARTICLE || p === SUBSTACK_NOTE || p === "سابستاك";

// خريطة سابستاك اليدوية: النموذج يضع رموز ++ / ** / --- داخل النص المعروض
// (compose_rules في nasaq/contracts.rs يحقن العقد لغير الشذرة على وجهي
// سابستاك) — هذه الملاحظة تشرحها داخل صندوق «ما تغيّر» القائم، بالشرط
// نفسه الذي يُحقن به العقد
const SUBSTACK_MARKERS_NOTE =
  "إرشادات سابستاك:\n++ = Enter (فقرة جديدة)\n** = Shift+Enter (كسر ضيق)\n--- = Divider (انتقال محوري)";

function substackMarkersRequested(style, intervention, platform) {
  return intervention === LEVELS.PLATFORM && isSubstackFace(platform) && style !== "شذرة";
}

// بصمة الإيقاع: وصف محايد منفصل عن formattedText — لا يُنسخ ولا يُحفظ لأنه
// حقل عرض مستقل لا يدخل النص أصلًا. يظهر فقط بعد نداء نموذج طازج للمستويين
// الإيقاعيين، ويُخفى فور أي تعديل محلي (يصف الظاهرة كما كانت لا كما صارت)
function showRhythmFingerprint(profile) {
  const text = (profile || "").trim();
  rhythmFingerprint.textContent = text;
  rhythmFingerprint.hidden = !text;
}

function fillSelect(sel, values, selectedValue) {
  sel.innerHTML = "";
  for (const v of values) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    if (v === selectedValue) opt.selected = true;
    sel.appendChild(opt);
  }
}

fillSelect(el("format-style"), STYLES, STYLES[0]);
fillSelect(el("intervention"), LEVEL_ORDER, DEFAULT_LEVEL);
fillSelect(el("platform"), PLATFORMS, PLATFORMS[0]);

// ---------- مستوى التدخل وقائمة المنصة ----------
const interventionSel = el("intervention");
const platformControl = el("platform-control");
const interventionHint = el("intervention-hint");
const platformSel = el("platform");
const variationsBtn = el("variations-btn");

// ---------- قائمة الهوية المنسدلة (v6.2 — مرجع التصميم) ----------
// قائمة macOS الأصلية لا تُنسّق، ولوحة الخيارات جزء من هوية المخطوطة:
// زر بحدّ رفيع وشيفرون يسارًا، ولوحة ورقية بظل ناعم بندها المختار أدكن
// وأثقل. الـselect يبقى مصدر الحقيقة (القيمة والمعرّف والقراءة البرمجية
// كما هي) ويُخفى؛ الاختيار هنا يكتب فيه ويطلق حدث change نفسه — لا يتغير
// أي منطق تحته
const identityDropdownRefreshers = [];
let openIdentityDropdownCloser = null;

function closeIdentityDropdowns() {
  if (openIdentityDropdownCloser) openIdentityDropdownCloser();
}

function refreshIdentityDropdowns() {
  for (const f of identityDropdownRefreshers) f();
}

function enhanceSelectAsDropdown(sel) {
  const wrap = sel.closest(".control");
  const labelText = wrap.querySelector("span")?.textContent || "";
  sel.hidden = true;
  sel.tabIndex = -1;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "dd-btn";
  btn.setAttribute("aria-haspopup", "listbox");
  btn.setAttribute("aria-expanded", "false");
  if (labelText) btn.setAttribute("aria-label", labelText);

  const valueSpan = document.createElement("span");
  valueSpan.className = "dd-value";
  btn.appendChild(valueSpan);
  btn.insertAdjacentHTML(
    "beforeend",
    '<svg class="dd-chevron" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="4 6 8 10.2 12 6" /></svg>'
  );

  const popup = document.createElement("div");
  popup.className = "dd-popup";
  popup.setAttribute("role", "listbox");
  popup.hidden = true;

  function rebuildOptions() {
    popup.innerHTML = "";
    for (const opt of sel.options) {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "dd-option";
      item.setAttribute("role", "option");
      item.dataset.value = opt.value;
      item.textContent = opt.textContent;
      item.setAttribute("aria-selected", String(opt.value === sel.value));
      item.addEventListener("click", () => {
        sel.value = opt.value;
        sel.dispatchEvent(new Event("change"));
        refresh();
        close();
        btn.focus();
      });
      popup.appendChild(item);
    }
  }

  function refresh() {
    const current = sel.options[sel.selectedIndex];
    valueSpan.textContent = current ? current.textContent : "";
    for (const item of popup.children) {
      item.setAttribute("aria-selected", String(item.dataset.value === sel.value));
    }
  }

  // موضعها ثابت (fixed) بمعزل عن قصّ .pane-scroll: نقيس المساحة الفعلية
  // أعلى الزر وأسفله داخل نافذة التطبيق نفسها، فتفتح للأسفل حين تتّسع
  // وللأعلى حين تضيق (قرب أسفل النافذة)، مع max-height وتمرير داخلي
  // يبقيها ضمن حدود النافذة دومًا مهما طال عدد الخيارات
  function positionPopup() {
    const margin = 8;
    const r = btn.getBoundingClientRect();
    popup.style.left = r.left + "px";
    popup.style.width = r.width + "px";
    popup.style.top = r.bottom + 4 + "px";
    popup.style.bottom = "";
    popup.style.maxHeight = "";
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const spaceAbove = r.top - margin;
    const needed = popup.scrollHeight;
    if (needed > spaceBelow && spaceAbove > spaceBelow) {
      popup.style.top = "";
      popup.style.bottom = window.innerHeight - r.top + 4 + "px";
      popup.style.maxHeight = Math.max(100, Math.floor(spaceAbove)) + "px";
    } else {
      popup.style.maxHeight = Math.max(100, Math.floor(spaceBelow)) + "px";
    }
  }

  function close() {
    popup.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    if (openIdentityDropdownCloser === close) openIdentityDropdownCloser = null;
  }

  function open() {
    closeIdentityDropdowns(); // لوحة واحدة مفتوحة في اللحظة الواحدة
    rebuildOptions();
    refresh();
    popup.hidden = false;
    positionPopup();
    btn.setAttribute("aria-expanded", "true");
    openIdentityDropdownCloser = close;
    (popup.querySelector('[aria-selected="true"]') || popup.firstChild)?.focus();
  }

  btn.addEventListener("click", () => (popup.hidden ? open() : close()));
  btn.addEventListener("keydown", (e) => {
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && popup.hidden) {
      e.preventDefault();
      open();
    }
  });

  // تنقّل لوحة المفاتيح داخل اللوحة — Escape يغلقها هي لا لوحات القشرة
  popup.addEventListener("keydown", (e) => {
    const items = [...popup.children];
    const i = items.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      items[Math.min(i + 1, items.length - 1)]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[Math.max(i - 1, 0)]?.focus();
    } else if (e.key === "Home") {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === "End") {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === "Escape") {
      e.stopPropagation();
      close();
      btn.focus();
    } else if (e.key === "Tab") {
      close();
    }
  });

  wrap.append(btn, popup);
  rebuildOptions();
  refresh();
  // أي تغيير للقيمة عبر حدث change (ولو برمجيًا) يلحق بزر العرض فورًا
  sel.addEventListener("change", refresh);
  identityDropdownRefreshers.push(refresh);
}

// نقرة خارج اللوحة المفتوحة تغلقها — مستمع واحد للقوائم الثلاث
document.addEventListener("mousedown", (e) => {
  if (openIdentityDropdownCloser && !e.target.closest(".control")) {
    closeIdentityDropdowns();
  }
});

// اللوحة ثابتة (fixed) بمعزل عن .pane-scroll فلا تتبع الزر تلقائيًا أثناء
// التمرير — إغلاقها عند أي تمرير (capture: يلتقط تمرير .pane-scroll نفسه
// رغم أن حدث scroll لا يصعد) أو عند تغيّر حجم النافذة أبسط وأسلم من إعادة
// حساب موضعها حيًّا مع كل بكسل
document.addEventListener("scroll", () => closeIdentityDropdowns(), true);
window.addEventListener("resize", () => closeIdentityDropdowns());

enhanceSelectAsDropdown(el("format-style"));
enhanceSelectAsDropdown(interventionSel);
enhanceSelectAsDropdown(platformSel);

// تلميحة سابستاك الوحيدة (لا رسالة متكررة): الفراغ في العرض راحة مراجعة،
// وما ينجو النشر هو كسر السطر — والنوت فوق ذلك لا يدعم RTL
const SUBSTACK_HINTS = {
  "مقال سابستاك": "سابستاك تبتلع السطر الفارغ عند النشر — كسر السطر هو ما ينجو، والفراغ هنا للمراجعة فقط",
  "نوت سابستاك": "النوت لا يدعم RTL (يُعرض يسارًا) ويبتلع السطر الفارغ — التنفّس بكسر السطر",
};

function syncInterventionControls() {
  const level = interventionSel.value;
  // المنصة لا تظهر ولا تعمل إلا تحت مستوى «تنسيق منصة»
  platformControl.hidden = level !== LEVELS.PLATFORM;
  // «أرِني تنويعات» لوجهة سابستاك حصرًا
  variationsBtn.hidden = !(level === LEVELS.PLATFORM && isSubstackFace(platformSel.value));
  if (level === LEVELS.PLATFORM) {
    interventionHint.textContent = SUBSTACK_HINTS[platformSel.value] || "";
  } else if (level === LEVELS.CLEAN) {
    // «تنظيف فقط» يعمل محليًا — يستحق توضيحًا لأنه يختلف عن بقية المستويات
    interventionHint.textContent = "فوري ومحلي — لا يغيّر أي كلمة";
  } else if (level === LEVELS.READ) {
    // الافتراضي — يستحق تلميحًا كبقية المستويات لا فراغًا في الصف (مطابق لقاعدته في nasaq/contracts.rs)
    interventionHint.textContent = "يقسّم الفقرات الطويلة ويضبط وقفات القراءة";
  } else if (level === LEVELS.RHYTHM) {
    interventionHint.textContent = "يوزّع النَّفَس والوقفات بعين كاتب";
  } else if (level === LEVELS.RHYTHM_DOTTED) {
    interventionHint.textContent = "يكسر عند وقفات الترقيم الحقيقية لا كل نقطة وفاصلة";
  } else if (level === LEVELS.PUBLISH) {
    interventionHint.textContent = "يرتّب النص كنسخة نهائية جاهزة للنشر";
  } else {
    interventionHint.textContent = "";
  }
}

interventionSel.addEventListener("change", syncInterventionControls);
platformSel.addEventListener("change", syncInterventionControls);
syncInterventionControls();

// ---------- تنظيف فقط: يعمل محليًا بالكامل، بلا أي طلب خارجي ----------
// إصلاح ميكانيكي مضمون: مسافات، فراغات، علامات ترقيم، أسطر زائدة — دون مساس بأي كلمة
function cleanOnly(text) {
  let t = text.replace(/\r\n?/g, "\n");

  // إزالة المحارف الخفية التي تتسرب من النسخ (مسافة صفرية، علامة الترميز)
  t = t.replace(/[​﻿]/g, "");

  // توحيد المسافات المتكررة (بما فيها المسافة الصلبة) داخل السطر الواحد
  t = t.replace(/[ \t ]+/g, " ");

  // علامات لاتينية وسط نص عربي → مقابلها العربي
  t = t.replace(/(?<=[؀-ۿ] ?),/g, "،");
  t = t.replace(/(?<=[؀-ۿ] ?);/g, "؛");
  t = t.replace(/(?<=[؀-ۿ] ?)\?/g, "؟");

  // لا مسافة قبل علامة الترقيم، وعلامة واحدة تكفي عند التكرار السهوي
  t = t.replace(/ +([،؛:.؟!…])/g, "$1");
  t = t.replace(/([،؛])\1+/g, "$1");

  // مسافة واحدة بعد العلامة إذا لحقها حرف مباشرة
  // (النقطة والنقطتان تُقيّدان بالحرف العربي حتى لا تنكسر الأرقام والروابط)
  t = t.replace(/([،؛؟!…])(?=[^\s،؛:.؟!…)»\n])/g, "$1 ");
  t = t.replace(/([.:])(?=[؀-ۿ])/g, "$1 ");

  // تشذيب أطراف كل سطر، وضغط الأسطر الفارغة المتراكمة إلى فاصل فقرة واحد
  t = t.split("\n").map((line) => line.trim()).join("\n");
  t = t.replace(/\n{3,}/g, "\n\n");

  return t.trim();
}

// ---------- التنسيق ----------
// عدّاد محاولات لكل بصمة (النص + المحاور الثلاثة): يُمرَّر للنموذج ليُنتج
// توزيعًا مختلفًا مع كل ضغطة بدل إعادة الشكل نفسه — لا cache يعيد نتيجة سابقة
const attemptCounts = new Map();

function nextAttempt(key) {
  return (attemptCounts.get(key) || 0) + 1;
}

// ما أُنتجت به النتيجة المعروضة الآن — تسجّله المسودة كما كان وقت التنسيق،
// لا كما تبدو القوائم لحظة الحفظ (قد يغيّرها المستخدم بعد ظهور النتيجة)
let lastFormatMeta = null;

// ---------- علم انشغال النداءات (v6.2 — الإصلاح ٢-أ) ----------
// نداء نموذج واحد يكتب على النتيجة في اللحظة الواحدة: «نسق» و«سطور
// أقل/أكثر» يتشاركان القفل، فلا يتسابق مستجيبان على المخرَج ولا تختلط
// ذاكرة الجلسة بين نداءين متوازيين
let modelCallActive = false;
function setModelBusy(busy) {
  modelCallActive = busy;
  formatBtn.disabled = busy;
  fewerBtn.disabled = busy;
  moreBtn.disabled = busy;
}

function currentSelection() {
  const intervention = interventionSel.value;
  return {
    style: el("format-style").value,
    intervention,
    // المنصة لا معنى لها خارج مستوى «تنسيق منصة»
    platform: intervention === LEVELS.PLATFORM ? el("platform").value : null,
  };
}

// ---------- ذاكرة الجلسة: آخر صيغة لكل نوع للنص الحالي ----------
// كل ضغطة «نسّق» ناجحة تكتب صيغتها فوق صيغة نوعها (استبدال لا تراكم)،
// و«حفظ» يودع غير المحفوظ منها دفعة واحدة تحت الأمّ. «تنظيف فقط» لا يدخلها.
let sessionKey = null;           // المفتاح المطبَّع للنص قيد العمل
let sessionOriginal = "";        // النص الخام كما كان عند أول صيغة (بلا تطبيع)
let sessionVersions = new Map(); // النوع ← { formatted، المحاور، linesAdjusted، updatedAt، saved }

// مكدس التراجع عن تعديلات النتيجة (v4.1) — عمره عمر جلسة النص:
// نص بكلمات جديدة يعني أن صور النتيجة السابقة لم تعد تخص ما يُعمل عليه
let outputUndoStack = [];

function resetSession() {
  sessionKey = null;
  sessionOriginal = "";
  sessionVersions = new Map();
  outputUndoStack = [];
}

// النوع = المنصة تحت «تنسيق منصة»، وإلا المستوى — تعريف versionType نفسه المتبع
// في العرض الهرمي. saved هي علامة «متسخة» معكوسة لكل مدخل: تُخفض عند الكتابة
// وتُرفع بعد حفظ ناجح، فلا يتكرر إيداع ما حُفظ ولا يضيع ما استُبدل بعد الحفظ
function recordSessionVersion(originalText, meta, formatted) {
  if (meta.intervention === LEVELS.CLEAN) return;
  const key = window.NasaqDrafts.draftKey(originalText);
  if (key !== sessionKey) {
    // نص بكلمات جديدة → جلسة جمع جديدة (ما لم يُحفظ من السابقة فُقد)
    resetSession();
    sessionKey = key;
    sessionOriginal = originalText;
  }
  // خريطة سابستاك اليدوية إرشاد للعرض فقط — تُجرَّد هنا نقطة اختناق واحدة
  // فلا يدخل رمز واحد المسودة كنص نهائي، أيًّا كان المسار الذي أنتج «formatted»
  sessionVersions.set(versionType(meta), {
    formatted: window.NasaqSubstackMarkers.stripSubstackMarkers(formatted),
    style: meta.style,
    intervention: meta.intervention,
    platform: meta.platform || null,
    linesAdjusted: Boolean(meta.linesAdjusted),
    updatedAt: new Date().toISOString(),
    saved: false,
  });
}

async function formatText() {
  if (modelCallActive) return; // نداء آخر يكتب على النتيجة الآن — لا تزاحم
  const text = inputText.value.trim();
  clearError();

  if (!text) {
    showError("أدخل نصًا أولًا.");
    return;
  }

  const { style, intervention, platform } = currentSelection();

  // «تنظيف فقط» محلي وفوري — لا شبكة، لا مفتاح، لا انتظار، وثابت بين الضغطات
  if (intervention === LEVELS.CLEAN) {
    pushOutputUndo(); // صورة النتيجة الحالية قبل الكتابة فوقها
    const cleaned = cleanOnly(text);
    setOutput(cleaned);
    outputPlaceholder.hidden = true;
    notesBox.hidden = true;
    showRhythmFingerprint(null);
    lastFormatMeta = { original: text, style, intervention, platform, linesAdjusted: false };
    syncResultTools();
    showToast(cleaned === text ? "النص نظيف أصلًا." : "نُظّف النص محليًا.");
    return;
  }

  // كل ضغطة محاولة جديدة برقم أعلى — التنويع الشكلي بدل إعادة الشكل نفسه
  // التوجيهات تدخل البصمة: توجيهات جديدة = عدّاد محاولات جديد لا استكمال قديم
  const directives = currentDirectives();
  const fingerprint = `${style}|${intervention}|${platform || ""}|${directives || ""}|${text}`;
  const attempt = nextAttempt(fingerprint);

  setModelBusy(true);
  loading.hidden = false;
  outputPlaceholder.hidden = true;

  try {
    const result = await invoke("format_text", {
      text,
      style,
      intervention,
      platform,
      attempt,
      directives,
    });

    attemptCounts.set(fingerprint, attempt);
    pushOutputUndo(); // قبل استبدال النتيجة والمحاور — الصورة بحالتها وقت العرض
    lastFormatMeta = { original: text, style, intervention, platform, linesAdjusted: false };
    // الصيغة الجديدة تحلّ محلّ صيغة نوعها في ذاكرة الجلسة — آخر شكل فقط يُحفظ
    recordSessionVersion(text, lastFormatMeta, result.formattedText);
    outputText.textContent = result.formattedText;
    updateCount(outputCount, result.formattedText);
    syncResultTools();

    showRhythmFingerprint(result.rhythmProfile);

    const notes = (result.notes || []).filter((n) => n && n.trim());
    if (substackMarkersRequested(style, intervention, platform)) {
      notes.push(SUBSTACK_MARKERS_NOTE);
    }
    if (notes.length) {
      notesList.innerHTML = "";
      for (const n of notes) {
        const li = document.createElement("li");
        li.textContent = n;
        notesList.appendChild(li);
      }
      notesBox.hidden = false;
    } else {
      notesBox.hidden = true;
    }
  } catch (err) {
    showError(String(err));
    if (!outputText.textContent) outputPlaceholder.hidden = false;
  } finally {
    setModelBusy(false);
    loading.hidden = true;
  }
}

formatBtn.addEventListener("click", formatText);

// اختصار ⌘+Enter — قرين زر «نسق» تمامًا: لا يعمل إن كان الزر مخفيًّا
// (وضع آخر يملأ الواجهة — الإصلاح ١-أ: كان النداء ينطلق خفيًا بلا أي أثر
// مرئي) أو معطلًا (نداء جارٍ). فحص الظهور لا يعرف الأوضاع بأسمائها —
// نسق يحكم على زره هو فحسب
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
    if (formatBtn.offsetParent === null || formatBtn.disabled) return;
    formatText();
  }
});

// خريطة سابستاك اليدوية إرشاد للعرض فقط — تُجرَّد قبل النسخ فلا يصل رمز واحد
// إلى الحافظة (خارج سابستاك النص أصلًا بلا رموز، فالتجريد بلا أثر)
copyBtn.addEventListener("click", async () => {
  const text = window.NasaqSubstackMarkers.stripSubstackMarkers(outputText.textContent);
  if (!text.trim()) {
    showToast("لا يوجد نص منسق بعد.");
    return;
  }
  if (await copyText(text)) showToast("نُسخت النتيجة");
  else showError("تعذّر النسخ إلى الحافظة.");
});

// ---------- أدوات على النص المنسّق ----------
function getOutputOrWarn() {
  const text = outputText.textContent;
  if (!text.trim()) {
    showToast("لا يوجد نص منسق بعد.");
    return null;
  }
  return text;
}

function setOutput(text) {
  outputText.textContent = text;
  updateCount(outputCount, text);
}

// ---------- التراجع عن تعديلات النتيجة (v4.1) ----------
// صورة تُدفع قبل كل كتابة فوق النتيجة (نسّق من جديد، سطور أقل/أكثر، حذف
// الفراغات، فصل الجمل، اعتماد منعطف أو تنويعة) — محلي بالكامل، استعادة عرضٍ
// وحالة فقط، ولا يمسّ منطق التنسيق ولا النص الخام
const UNDO_MAX = 20;

// لا يُحفظ إلا ما يخص النص قيد العمل: نتيجة نص سابق ما زالت معروضة لا تدخل
// المكدس — جلستها انتهت ولا معنى لاستعادتها تحت نص آخر
function pushOutputUndo() {
  const text = outputText.textContent;
  if (!text.trim() || !lastFormatMeta) return;
  const key = window.NasaqDrafts.draftKey(lastFormatMeta.original);
  if (key !== window.NasaqDrafts.draftKey(inputText.value)) return;
  outputUndoStack.push({
    text,
    meta: { ...lastFormatMeta },
    rhythm: rhythmFingerprint.hidden ? null : rhythmFingerprint.textContent,
  });
  if (outputUndoStack.length > UNDO_MAX) outputUndoStack.shift();
}

function undoOutput() {
  const snap = outputUndoStack.pop();
  if (!snap) {
    showToast("لا تعديل للتراجع عنه.");
    return;
  }
  setOutput(snap.text);
  outputPlaceholder.hidden = true;
  lastFormatMeta = snap.meta;
  showRhythmFingerprint(snap.rhythm);
  // ما يُعرض هو ما يُحفظ: الصيغة المستعادة تكتب فوق صيغة نوعها في ذاكرة
  // الجلسة («تنظيف فقط» تستثني نفسها داخل recordSessionVersion أصلًا)
  recordSessionVersion(snap.meta.original, snap.meta, snap.text);
  syncResultTools();
  showToast("استُعيدت النتيجة السابقة.");
}

el("undo-btn").addEventListener("click", undoOutput);

// ---------- «سطور أقل/أكثر»: عبر النموذج، وبالاحتياط المحلي عند تعذّره ----------
// الدالتان المحليتان النقيتان في lines.js — تُنادَيان عبر window.NasaqLines
// (لا تعِد إعلانهما بـ const هنا: دوال lines.js في النطاق العام، والتظليل يرمي
// SyntaxError يعطّل الملف كله — كما في تنبيه insideTauri أدناه)
const fewerBtn = el("fewer-lines-btn");
const moreBtn = el("more-lines-btn");

function setAdjustBusy(busy) {
  // القفل المشترك نفسه (٢-أ): تعديل الأسطر عبر النموذج يقفل «نسق» أيضًا
  setModelBusy(busy);
  loading.hidden = !busy;
}

// يعدّل كثافة أسطر النتيجة الحالية فقط — النص الأصلي في خانة الإدخال لا يُمسّ.
// خريطة سابستاك اليدوية إرشاد للعرض فقط: تُجرَّد قبل إرسال «الحالية» للنموذج
// (فلا يتعامل معها كنص يجب حفظه) وقبل المسار المحلي (فلا يُدمَج «++» مع
// سطر مجاور بالخطأ) — وجهة سابستاك تُعيد رموزًا جديدة على النتيجة المعدَّلة
// عبر عقد compose_rules نفسه، فلا يُفقَد الإرشاد إلا عند فشل الاتصال
async function adjustLines(direction) {
  if (modelCallActive) return; // «نسق» أو تعديل آخر يعمل الآن — لا تزاحم
  const rawCurrent = getOutputOrWarn();
  if (rawCurrent === null) return;
  pushOutputUndo(); // كل مسارات التعديل الثلاثة أدناه تكتب فوق النتيجة
  const current = window.NasaqSubstackMarkers.stripSubstackMarkers(rawCurrent);

  const localFallback =
    direction === "fewer" ? window.NasaqLines.fewerLinesLocal : window.NasaqLines.moreLinesLocal;
  const meta = lastFormatMeta;

  // النتيجة المعروضة صارت ناتج تعديل أسطر: تحمل وسم «± أسطر»، وتكتب فوق
  // آخر صيغة لنوعها في ذاكرة الجلسة (تحديث لا مدخل جديد — آخر شكل فقط)
  const markAdjusted = (newText) => {
    if (!lastFormatMeta) return;
    lastFormatMeta = { ...lastFormatMeta, linesAdjusted: true };
    recordSessionVersion(lastFormatMeta.original, lastFormatMeta, newText);
    syncResultTools();
  };

  // نتيجة «تنظيف فقط» أو معاينة متصفح أو نتيجة مجهولة المصدر → السلوك المحلي الحتمي
  if (!insideTauri || !meta || meta.intervention === LEVELS.CLEAN) {
    const adjusted = localFallback(current);
    setOutput(adjusted);
    markAdjusted(adjusted);
    showRhythmFingerprint(null); // تعديل محلي بلا نموذج — الوصف السابق صار غير دقيق
    return;
  }

  // رقم محاولة خاص بهذا الاتجاه وهذه البصمة — تعديل مختلف قليلًا مع كل ضغطة
  const fingerprint = `تعديل|${direction}|${meta.style}|${meta.intervention}|${meta.platform || ""}|${meta.original}`;
  const attempt = nextAttempt(fingerprint);

  setAdjustBusy(true);
  try {
    const result = await invoke("adjust_lines", {
      original: meta.original,
      current,
      style: meta.style,
      intervention: meta.intervention,
      platform: meta.platform,
      direction,
      attempt,
      directives: currentDirectives(),
    });
    attemptCounts.set(fingerprint, attempt);
    setOutput(result.formattedText);
    markAdjusted(result.formattedText);
    showRhythmFingerprint(result.rhythmProfile);
  } catch {
    // فشل الخدمة لا يخذل الزر: تعديل محلي مع إشعار خفيف
    const adjusted = localFallback(current);
    setOutput(adjusted);
    showRhythmFingerprint(null); // تعديل محلي بلا نموذج — الوصف السابق صار غير دقيق
    markAdjusted(adjusted);
    showToast("تعذّر الاتصال بالنموذج — طُبّق تعديل محلي.");
  } finally {
    setAdjustBusy(false);
  }
}

// [تنظيف]: يحذف كل الأسطر الفارغة، ويزيل الفراغات الزائدة من طرفي كل سطر،
// دون حذف أي سطر يحتوي نصًا ودون تغيير الكلمات أو الترقيم
function cleanEmptyLines() {
  const text = getOutputOrWarn();
  if (text === null) return;
  pushOutputUndo();

  const out = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line);

  setOutput(out.join("\n"));
  showRhythmFingerprint(null); // تعديل محلي بلا نموذج — الوصف السابق صار غير دقيق
  syncResultTools();
}

// [فصل الجمل]: محلي حتمي بلا نموذج (window.NasaqLines.splitSentencesLocal في
// lines.js) — يكسر بعد كل جملة، يتجاهل النقطة العشرية (3.14). يُسجَّل في
// ذاكرة الجلسة بوسم «± أسطر» كتعديل أسطر، فيصبح قابلًا للحفظ كمسودة فورًا
function splitSentences() {
  const text = getOutputOrWarn();
  if (text === null) return;
  if (!lastFormatMeta) return;
  pushOutputUndo();

  const out = window.NasaqLines.splitSentencesLocal(text);
  setOutput(out);
  showRhythmFingerprint(null); // تعديل محلي بلا نموذج — الوصف السابق صار غير دقيق
  lastFormatMeta = { ...lastFormatMeta, linesAdjusted: true };
  recordSessionVersion(lastFormatMeta.original, lastFormatMeta, out);
  syncResultTools();
}

fewerBtn.addEventListener("click", () => adjustLines("fewer"));
moreBtn.addEventListener("click", () => adjustLines("more"));
el("clean-btn").addEventListener("click", cleanEmptyLines);
el("split-sentences-btn").addEventListener("click", splitSentences);

// ---------- أدوات وجهة سابستاك على النتيجة: التصدير وبطاقة الشذرة ----------
// تُزامَن بعد كل تغيير للنتيجة، والوجهة تُقرأ من بيانات النتيجة وقت إنتاجها
// (lastFormatMeta) لا من القوائم — تغيير القوائم بعد التنسيق لا يغيّر النتيجة
const exportBtn = el("export-btn");
const fragmentCard = el("fragment-card");
const fragmentBrokenBox = el("fragment-broken");
const fragmentJoinedBox = el("fragment-joined");
let fragmentForms = null; // صورتا المنعطف للنتيجة المعروضة الآن

// وجه سابستاك الذي أُنتجت به النتيجة المعروضة، أو null لغير سابستاك
function metaSubstackFace() {
  return lastFormatMeta &&
    lastFormatMeta.intervention === LEVELS.PLATFORM &&
    isSubstackFace(lastFormatMeta.platform)
    ? lastFormatMeta.platform
    : null;
}

// ---------- عدّاد واعٍ بحدود المنصات (v4.1) ----------
// حدود بالحرف للمنصات ذات السقف فقط. عدّ إكس هنا (text.length بوحدات
// UTF-16) مطابق فعليًا لقواعد المنصة لا تقريب: العربية وتشكيلها في نطاق
// الوزن 1 عند إكس فتُحسب مفردة، والإيموجي وحدتان = وزن إكس 2 نفسه — لا
// تبدّله إلى عدّ نقاط ترميز (عدّاد «العرض» في shell.js شأن آخر ويعدّها).
// ثريدز وإنستغرام: الإيموجي يُحسب مضاعفًا فيُنذر مبكرًا — الاتجاه الآمن.
// تحذير هادئ في سطر العدّاد نفسه — لا نافذة ولا منع
const PLATFORM_LIMITS = { "إكس": 280, "ثريدز": 500, "إنستغرام": 2200 };

function syncPlatformLimitWarning() {
  outputCount.classList.remove("over-limit");
  const meta = lastFormatMeta;
  const text = outputText.textContent;
  if (!meta || meta.intervention !== LEVELS.PLATFORM || !meta.platform || !text.trim()) return;
  const limit = PLATFORM_LIMITS[meta.platform];
  if (!limit) return;

  if (meta.platform === "إكس") {
    // ناتج إكس قد يكون سلسلة مقاطع يفصلها الفراغ — العبرة بأطول مقطع لا المجموع
    const longest = Math.max(...text.split(/\n\s*\n+/).map((b) => b.trim().length));
    if (longest > limit) {
      outputCount.textContent += ` — أطول مقطع (${longest.toLocaleString("ar")}) يتجاوز حدّ إكس ${limit.toLocaleString("ar")}`;
      outputCount.classList.add("over-limit");
    }
  } else if (text.length > limit) {
    outputCount.textContent += ` — يتجاوز حدّ ${meta.platform} (${limit.toLocaleString("ar")})`;
    outputCount.classList.add("over-limit");
  }
}

function syncResultTools() {
  const face = metaSubstackFace();
  const text = outputText.textContent;
  exportBtn.hidden = !face || !text.trim();
  syncPlatformLimitWarning();

  // بطاقة الشذرة: نمط شذرة على وجهة سابستاك، وفي النص منعطف تختلف به الصورتان
  fragmentForms =
    face && lastFormatMeta.style === "شذرة" && text.trim()
      ? window.NasaqFragments.turnForms(text)
      : null;

  if (fragmentForms) {
    fragmentBrokenBox.textContent = fragmentForms.broken;
    fragmentJoinedBox.textContent = fragmentForms.joined;
    // وجه النوت يُعرض يسارًا تقليدًا لسلوك المنصة — عناصر البطاقة تبقى RTL
    const noteFace = face === SUBSTACK_NOTE;
    fragmentBrokenBox.classList.toggle("note-face", noteFace);
    fragmentJoinedBox.classList.toggle("note-face", noteFace);
    fragmentCard.hidden = false;
  } else {
    fragmentCard.hidden = true;
  }
}

// «تصدير لسابستاك»: الكسور المفردة تصل سليمة، والأسطر الفارغة تُحذف عند
// التصدير لتطابق ما سيُنشَر (المنصة تبتلعها) — العرض داخل نسق لا يُمسّ.
// الفاصل المرئي (·) محرف ينجو النشر فيُصدَّر كما هو. خريطة الرموز اليدوية
// إرشاد للعرض فقط — تُجرَّد هنا أيضًا فلا تصل رموزها لنص النشر
exportBtn.addEventListener("click", async () => {
  const text = getOutputOrWarn();
  if (text === null) return;
  const exported = window.NasaqSubstackMarkers.stripSubstackMarkers(text)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line)
    .join("\n");
  const face = metaSubstackFace() || "سابستاك";
  if (await copyText(exported)) {
    showToast(`نُسخ للنشر في ${face} — الكسور محفوظة، والأسطر الفارغة حُذفت كما سيُنشَر.`);
  } else {
    showError("تعذّر النسخ إلى الحافظة.");
  }
});

// اختيار شكل المنعطف: تحوّل تخطيطي بحت (كسر/وصل بلا أي محرف مضاف) —
// يكتب فوق صيغة نوعه في ذاكرة الجلسة كتعديل أسطر، ونسق يُري ولا يقرر
function adoptTurnForm(which) {
  if (!fragmentForms || !lastFormatMeta) return;
  pushOutputUndo();
  const chosen = which === "broken" ? fragmentForms.broken : fragmentForms.joined;
  setOutput(chosen);
  lastFormatMeta = { ...lastFormatMeta, linesAdjusted: true };
  recordSessionVersion(lastFormatMeta.original, lastFormatMeta, chosen);
  syncResultTools();
  showToast(which === "broken" ? "اعتُمدت المكسورة عند المنعطف." : "اعتُمدت الموصولة.");
}

el("adopt-broken").addEventListener("click", () => adoptTurnForm("broken"));
el("adopt-joined").addEventListener("click", () => adoptTurnForm("joined"));

// ---------- لوحة تنويعات سابستاك ----------
// ثلاث تنويعات دفعة واحدة: ثلاثة نداءات بعقد سابستاك نفسه وثلاثة أرقام
// محاولة متتالية (بذور التنويع) — تختلف في مواضع كسر السطر وتوزيع الوقفات
// والكلمات والمعنى كما هي. العدّاد مشترك مع زر «نسّق» فلا تتكرر الأشكال
const variationsOverlay = el("variations-overlay");
const variationsGrid = el("variations-grid");
const variationsFaceLabel = el("variations-face");
const regenBtn = el("regen-variations");
const ARABIC_ORDINALS = ["١", "٢", "٣"];
let variationsMeta = null; // ما وُلّدت به التنويعات المعروضة

function buildVariationColumn(index, state, payload) {
  const col = document.createElement("div");
  col.className = "variation-col";

  const num = document.createElement("div");
  num.className = "variation-num";
  num.textContent = ARABIC_ORDINALS[index];
  col.appendChild(num);

  if (state === "loading" || state === "error") {
    const s = document.createElement("div");
    s.className = "variation-status" + (state === "error" ? " error" : "");
    s.textContent = state === "error" ? String(payload) : "جارٍ التوليد…";
    col.appendChild(s);
    return col;
  }

  const t = document.createElement("div");
  t.className = "variation-text";
  // وجه النوت LTR تقليدًا للمنصة؛ المقال RTL. أزرار اللوحة وأرقامها عربية RTL دائمًا
  t.classList.toggle("note-face", variationsMeta.platform === SUBSTACK_NOTE);
  t.textContent = payload;
  col.appendChild(t);

  const adopt = document.createElement("button");
  adopt.type = "button";
  adopt.className = "adopt-btn";
  adopt.textContent = "اعتمد هذه";
  adopt.addEventListener("click", () => adoptVariation(payload));
  col.appendChild(adopt);
  return col;
}

function renderVariationColumns(states) {
  variationsGrid.innerHTML = "";
  states.forEach((s, i) => {
    if (i > 0) {
      const sep = document.createElement("div");
      sep.className = "variation-sep";
      variationsGrid.appendChild(sep);
    }
    variationsGrid.appendChild(buildVariationColumn(i, s.state, s.payload));
  });
}

async function generateVariations() {
  const text = inputText.value.trim();
  if (!text) {
    showError("أدخل نصًا أولًا.");
    return;
  }
  clearError();

  const { style, intervention, platform } = currentSelection();
  if (!isSubstackFace(platform)) return; // الزر لا يظهر أصلًا لغير سابستاك

  variationsMeta = { original: text, style, intervention, platform };
  variationsFaceLabel.textContent =
    platform === SUBSTACK_NOTE ? "— وجه النوت (يُعرض يسارًا)" : "— وجه المقال";
  renderVariationColumns([{ state: "loading" }, { state: "loading" }, { state: "loading" }]);
  variationsOverlay.hidden = false;
  regenBtn.disabled = true;
  variationsBtn.disabled = true;

  // نداء مخصص للوحة (generate_variation لا format_text): كل شق يحمل رافعة
  // كثافة كسر مختلفة بنيويًا (slot 0/1/2) فيظهر تباين حقيقي حتى على نص قصير
  // الجُمل، لا إزاحة كلمة. رقم الدفعة يتقدم بثلاث فيتنوع «ولّد ثلاثًا جديدة».
  // التوجيهات الخاصة تسري على التنويعات الثلاث كلها
  const directives = currentDirectives();
  const fingerprint = `${style}|${intervention}|${platform}|${directives || ""}|${text}`;
  const base = nextAttempt(fingerprint);
  const calls = [0, 1, 2].map((i) =>
    invoke("generate_variation", { text, style, intervention, platform, slot: i, attempt: base + i, directives })
  );
  const results = await Promise.allSettled(calls);
  attemptCounts.set(fingerprint, base + 2);

  renderVariationColumns(
    results.map((r) =>
      r.status === "fulfilled"
        ? { state: "done", payload: r.value.formattedText }
        : { state: "error", payload: r.reason }
    )
  );
  regenBtn.disabled = false;
  variationsBtn.disabled = false;
}

// «اعتمد هذه»: التنويعة تدخل المخرَج الرئيس وتصبح كأي نتيجة —
// قابلة للحفظ والتصدير وتعديل الأسطر وبطاقة الشذرة
function adoptVariation(text) {
  pushOutputUndo(); // النتيجة السابقة (إن كانت لهذا النص) تبقى قابلة للاستعادة
  setOutput(text);
  outputPlaceholder.hidden = true;
  notesBox.hidden = true;
  showRhythmFingerprint(null); // التنويعات لا تحمل بصمة إيقاع — منصة لا مستوى إيقاعي
  lastFormatMeta = {
    original: variationsMeta.original,
    style: variationsMeta.style,
    intervention: variationsMeta.intervention,
    platform: variationsMeta.platform,
    linesAdjusted: false,
  };
  recordSessionVersion(variationsMeta.original, lastFormatMeta, text);
  syncResultTools();
  closeVariations();
  showToast("اعتُمدت التنويعة وصارت النتيجة الرئيسة.");
}

function closeVariations() {
  variationsOverlay.hidden = true;
}

variationsBtn.addEventListener("click", generateVariations);
regenBtn.addEventListener("click", generateVariations);
el("close-variations").addEventListener("click", closeVariations);
variationsOverlay.addEventListener("click", (e) => {
  if (e.target === variationsOverlay) closeVariations();
});

// ---------- عدسة القراءة: معاينة عرض هاتف، للعرض فقط — لا تحرير ولا تعديل ----------
// النص كما هو حرفيًا (بما فيه رموز خريطة سابستاك إن وُجدت) — محاكاة عامة
// لعرض الهاتف لا تتبع منصة بعينها، وتحترم اتجاه النص الحالي (RTL/LTR)
const readingLensBtn = el("reading-lens-btn");
const readingLensOverlay = el("reading-lens-overlay");
const readingLensText = el("reading-lens-text");

function openReadingLens() {
  const text = getOutputOrWarn();
  if (text === null) return;
  readingLensText.textContent = text;
  // وجه النوت يُعرض يسارًا كما في المخرَج الرئيس — العدسة تعرض لا تقرر
  readingLensText.classList.toggle("note-face", metaSubstackFace() === SUBSTACK_NOTE);
  readingLensOverlay.hidden = false;
}

function closeReadingLens() {
  readingLensOverlay.hidden = true;
}

readingLensBtn.addEventListener("click", openReadingLens);
el("close-reading-lens").addEventListener("click", closeReadingLens);
readingLensOverlay.addEventListener("click", (e) => {
  if (e.target === readingLensOverlay) closeReadingLens();
});

// استعادة صيغة: النص الخام من الأمّ، والمنسّق والمحاور الثلاثة من الصيغة —
// لو ضغط «نسّق» بعدها لأنتج على الأساس نفسه. المسودة تبقى محفوظة
function restoreDraft(mother, version) {
  inputText.value = mother.original || "";
  inputText.dispatchEvent(new Event("input"));

  setOutput(version.formatted || "");
  outputPlaceholder.hidden = Boolean((version.formatted || "").trim());
  notesBox.hidden = true;
  showRhythmFingerprint(null); // المسودات لا تحفظ البصمة — لا وصف بلا نداء طازج

  const styleSel = el("format-style");
  const platformSel = el("platform");
  if ([...styleSel.options].some((o) => o.value === version.style)) styleSel.value = version.style;
  if ([...interventionSel.options].some((o) => o.value === version.intervention)) interventionSel.value = version.intervention;
  if (version.platform && [...platformSel.options].some((o) => o.value === version.platform)) platformSel.value = version.platform;
  syncInterventionControls();
  // القيم كُتبت برمجيًا لا بالنقر — أزرار قوائم الهوية تلحق بها
  refreshIdentityDropdowns();

  lastFormatMeta = {
    original: mother.original || "",
    style: version.style,
    intervention: version.intervention,
    platform: version.platform || null,
    linesAdjusted: Boolean(version.linesAdjusted),
  };
  syncResultTools();

  // بدء العمل على نص مستعاد يبدأ جلسة جمع جديدة — المستعاد محفوظ أصلًا
  // فلا يدخل الذاكرة، وما يُنتج بعده يتجمع من الصفر
  resetSession();

  closeDrafts();
  showToast("استُعيدت المسودة.");
}

// «حفظ» يودع الدفعة: آخر صيغة من كل نوع جُرّب على هذا النص منذ آخر حفظ،
// كلها تحت الأمّ المطابقة بالمفتاح المطبَّع (تُنشأ إن لم توجد) — النصف
// التخزيني في القشرة (depositDraftVersions)، وهنا نصف الجلسة فقط.
// ما حُفظ من قبل لا يُعاد إيداعه — علامة saved لكل مدخل تمنع التكرار
el("save-draft-btn").addEventListener("click", async () => {
  if (sessionVersions.size === 0) {
    showToast("لا توجد صيغة للحفظ — نسّق النص أولًا.");
    return;
  }

  const pending = [...sessionVersions.values()].filter((v) => !v.saved);
  if (pending.length === 0) {
    showToast("لا جديد ليُحفظ منذ آخر حفظ.");
    return;
  }

  const base = Date.now();
  const newVersions = pending.map((v, i) => ({
    id: base + i,
    createdAt: v.updatedAt,
    formatted: v.formatted,
    style: v.style,
    intervention: v.intervention,
    platform: v.platform,
    // ناتج «سطور أقل/أكثر» يبقى تحت نوعه الأصلي بوسم خفيف، لا نوعًا هجينًا
    linesAdjusted: v.linesAdjusted,
  }));

  try {
    await depositDraftVersions(sessionKey, sessionOriginal, newVersions);
    // خفض «متسخة» بعد نجاح الحفظ فقط — الخريطة تبقى، وما يُنتج بعدها يتجمع طبيعيًا
    for (const v of pending) v.saved = true;
    showToast(`حُفظت ${versionsCountLabel(pending.length)}.`);
  } catch (err) {
    showError(String(err));
  }
});


// ---------- وصل نسق بالقشرة ----------
// مفردات عرض المسودات من قاموس نسق: النوع = المستوى، إلا تحت «تنسيق منصة»
// فالنوع هو المنصة نفسها؛ والترتيب الثابت: المستويات ثم المنصات
function versionType(v) {
  return v.intervention === LEVELS.PLATFORM && v.platform ? v.platform : (v.intervention || "غير محدد");
}

const TYPE_ORDER = [
  LEVELS.CLEAN,
  LEVELS.READ,
  LEVELS.RHYTHM,
  LEVELS.RHYTHM_DOTTED,
  LEVELS.PUBLISH,
  ...PLATFORMS,
];

configureDraftsDisplay({ versionTypeOf: versionType, typeOrder: TYPE_ORDER });
registerRestoreHandler(restoreDraft);

// لوحتا نسق تتقدمان لوحات القشرة في الإغلاق بالمفتاح، والعدسة قبل
// التنويعات — التسجيل بالأحدث أولًا يجعل الفحص:
// [العدسة، التنويعات، المسودات، الإعدادات] كسلوك v4.1 حرفيًا
registerEscapeCloser(() => !variationsOverlay.hidden, closeVariations);
registerEscapeCloser(() => !readingLensOverlay.hidden, closeReadingLens);

// ---------- بحث في النتيجة (دالة «بحث» ضمن شريط NSQ/Toolbar الجديد) ----------
// إضافة جديدة بحتة — لا تمسّ أي دالة قائمة. قراءة فقط من outputText، والتمييز
// عبر CSS Custom Highlight API فلا تُدرَج عقد <mark> في الشجرة، فتبقى تراجع/
// تنظيف الأسطر الفارغة/فصل الجمل (التي تقرأ نصّ outputText مباشرة) بمنأى تام
// عن أي تأثير. بلا نداء نموذج ولا حفظ — عرض وتنقّل محليان فقط.
(function initOutputSearch() {
  const btn = el("output-search-btn");
  const bar = el("output-search-bar");
  const input = el("output-search-input");
  const countEl = el("output-search-count");
  const prevBtn = el("output-search-prev");
  const nextBtn = el("output-search-next");
  const closeBtn = el("output-search-close");
  if (!btn || !bar || !input) return;

  const supportsHighlight =
    typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";

  let matches = [];
  let activeIndex = -1;

  function clearHighlights() {
    if (!supportsHighlight) return;
    CSS.highlights.delete("nsq-search");
    CSS.highlights.delete("nsq-search-current");
  }

  function collectMatches(term) {
    matches = [];
    activeIndex = -1;
    if (!term) return;
    const needle = term.toLocaleLowerCase("ar");
    const walker = document.createTreeWalker(outputText, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const hay = node.data.toLocaleLowerCase("ar");
      let from = 0;
      let idx;
      while ((idx = hay.indexOf(needle, from)) !== -1) {
        const range = document.createRange();
        range.setStart(node, idx);
        range.setEnd(node, idx + needle.length);
        matches.push(range);
        from = idx + needle.length;
      }
    }
  }

  function renderHighlights() {
    if (!supportsHighlight) return;
    if (!matches.length) { clearHighlights(); return; }
    CSS.highlights.set("nsq-search", new Highlight(...matches));
    CSS.highlights.set(
      "nsq-search-current",
      new Highlight(...(activeIndex >= 0 ? [matches[activeIndex]] : []))
    );
  }

  function updateCount() {
    countEl.textContent = matches.length
      ? `${activeIndex + 1} / ${matches.length}`
      : input.value
      ? "0 / 0"
      : "";
  }

  function goTo(index) {
    if (!matches.length) return;
    activeIndex = ((index % matches.length) + matches.length) % matches.length;
    const range = matches[activeIndex];
    const container = range.startContainer.parentElement;
    if (container && container.scrollIntoView) {
      container.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    renderHighlights();
    updateCount();
  }

  function runSearch() {
    collectMatches(input.value.trim());
    renderHighlights();
    updateCount();
    if (matches.length) goTo(0);
  }

  function openSearch() {
    bar.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    input.focus();
    if (input.value) runSearch();
  }

  function closeSearch() {
    // إعادة التركيز لزر الفتح قبل الإخفاء: العنصر النشط قد يكون داخل الشريط
    // (الحقل أو أزرار التنقّل) — إخفاؤه بلا نقل التركيز يُسقط تركيز لوحة
    // المفاتيح إلى <body> فيضطر المستخدم لبدء التنقّل من رأس الصفحة (٢٫٤٫٣)
    if (bar.contains(document.activeElement)) btn.focus();
    bar.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    clearHighlights();
    matches = [];
    activeIndex = -1;
    countEl.textContent = "";
  }

  btn.addEventListener("click", () => (bar.hidden ? openSearch() : closeSearch()));
  closeBtn.addEventListener("click", closeSearch);
  input.addEventListener("input", runSearch);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      goTo(activeIndex + (e.shiftKey ? -1 : 1));
    } else if (e.key === "Escape") {
      e.preventDefault();
      closeSearch();
    }
  });
  nextBtn.addEventListener("click", () => goTo(activeIndex + 1));
  prevBtn.addEventListener("click", () => goTo(activeIndex - 1));
  registerEscapeCloser(() => !bar.hidden, closeSearch);
})();


// ---------- شريط الأدوات: طيّ الأولوية عند ضيق العرض (Priority+) ----------
// المشكلة التي يغلقها: عند أصغر عرض مسموح للنافذة (٨٠٠px) يحتاج الشريط
// ٣١٣px في صندوق ٢٦١px، فكان الفائض يختفي في شريط تمرير أفقي بلا مقبض
// مرئي (scrollbar-width: none) — أي أن أدوات تصير غير مرئية ولا شيء
// يدلّ على وجودها. الحل سلوكيّ لا مقياسيّ: الأدوات الأدنى أولوية تنتقل
// إلى قائمة «أدوات أخرى» بأسمائها، ولا يُصغَّر شيء.
(function initToolbarOverflow() {
  const toolbar = document.querySelector(".nsq-toolbar");
  const moreGroup = el("toolbar-more-group");
  const moreBtn = el("toolbar-more-btn");
  const menu = el("toolbar-overflow");
  if (!toolbar || !moreGroup || !moreBtn || !menu) return;

  // ترتيب الطيّ — الأدنى أولوية أولًا. «تراجع» و«بحث» و«نسخ» غائبة عن
  // هذه القائمة عمدًا فلا تُطوى مهما ضاق العرض
  const COLLAPSE_ORDER = [
    "more-lines-btn",
    "fewer-lines-btn",
    "split-sentences-btn",
    "clean-btn",
    "save-draft-btn",
  ];
  const items = COLLAPSE_ORDER.map((id) => el(id)).filter(Boolean);
  if (!items.length) return;

  // لقطة الترتيب الأصلي مرة واحدة: الإرجاع يعيد الإلحاق بهذا الترتيب
  // نفسه فيستحيل أن ينزاح زر عن مجموعته أو عن موضعه فيها
  const layout = [...toolbar.querySelectorAll(".toolbar-group")].map((g) => ({
    group: g,
    kids: [...g.children],
  }));

  function restoreAll() {
    for (const { group, kids } of layout) for (const k of kids) group.appendChild(k);
  }

  // مجموعة فرغت تُخفى، وفاصل لم يعد بين مجموعتين ظاهرتين يُخفى معها —
  // وإلا بقيت خطوط عائمة بلا ما تفصله
  function syncSeparators() {
    const kids = [...toolbar.children];
    for (const k of kids) {
      if (k.classList.contains("toolbar-group") && k !== moreGroup) {
        k.hidden = k.children.length === 0;
      }
    }
    const visibleGroup = (x) =>
      x.classList.contains("toolbar-group") && !x.hidden && x.children.length > 0;
    kids.forEach((k, i) => {
      if (!k.classList.contains("toolbar-divider")) return;
      k.hidden = !(
        kids.slice(0, i).some(visibleGroup) && kids.slice(i + 1).some(visibleGroup)
      );
    });
  }

  const overflows = () => toolbar.scrollWidth > toolbar.clientWidth;

  function recompute() {
    closeMenu();
    restoreAll();
    moreGroup.hidden = true;
    syncSeparators();
    // اللوحة مخفيّة (وضع شَذْب) أو لم تُرسم بعد: لا قياس له معنى
    if (!toolbar.clientWidth || !overflows()) return;
    // إظهار زر «أخرى» يوسّع الشريط بنفسه، فالقياس يلي الإظهار لا يسبقه
    moreGroup.hidden = false;
    for (const btn of items) {
      if (!overflows()) break;
      menu.appendChild(btn);
      syncSeparators();
    }
    if (!menu.children.length) moreGroup.hidden = true;
  }

  // ---------- القائمة ----------
  function positionMenu() {
    const margin = 8;
    const r = moreBtn.getBoundingClientRect();
    menu.style.top = r.bottom + 4 + "px";
    menu.style.bottom = "";
    menu.style.maxHeight = "";
    // محاذاة الحافة اليمنى للزر — القائمة تنمو يسارًا كما يقتضي RTL، ثم
    // تُلجَم داخل النافذة: الزر يقع قرب الحافة اليسرى في أضيق نافذة،
    // فالمحاذاة وحدها تدفع القائمة خارج الشاشة وتقصّ أسماء الأدوات
    menu.style.right = "";
    menu.style.left = "0px";
    const w = menu.offsetWidth;
    let left = r.right - w;
    if (left < margin) left = margin;
    if (left + w > window.innerWidth - margin) left = window.innerWidth - margin - w;
    menu.style.left = Math.max(margin, left) + "px";
    const below = window.innerHeight - r.bottom - margin;
    const above = r.top - margin;
    if (menu.scrollHeight > below && above > below) {
      menu.style.top = "";
      menu.style.bottom = window.innerHeight - r.top + 4 + "px";
      menu.style.maxHeight = Math.max(96, Math.floor(above)) + "px";
    } else {
      menu.style.maxHeight = Math.max(96, Math.floor(below)) + "px";
    }
  }

  function closeMenu() {
    if (menu.hidden) return;
    if (menu.contains(document.activeElement)) moreBtn.focus();
    menu.hidden = true;
    moreBtn.setAttribute("aria-expanded", "false");
  }

  function openMenu() {
    if (!menu.children.length) return;
    menu.hidden = false;
    positionMenu();
    moreBtn.setAttribute("aria-expanded", "true");
    menu.querySelector(".tool-btn:not(:disabled)")?.focus();
  }

  moreBtn.addEventListener("click", () => (menu.hidden ? openMenu() : closeMenu()));

  // الفعل يُنفَّذ بمستمع الزر نفسه (انتقل معه)، وهذا يغلق القائمة بعده
  menu.addEventListener("click", (e) => {
    if (e.target.closest(".tool-btn")) closeMenu();
  });

  menu.addEventListener("keydown", (e) => {
    const list = [...menu.querySelectorAll(".tool-btn:not(:disabled)")];
    const i = list.indexOf(document.activeElement);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      list[Math.min(i + 1, list.length - 1)]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      list[Math.max(i - 1, 0)]?.focus();
    } else if (e.key === "Tab") {
      closeMenu();
    }
  });

  document.addEventListener("mousedown", (e) => {
    if (!menu.hidden && !e.target.closest(".toolbar-more-group")) closeMenu();
  });
  registerEscapeCloser(() => !menu.hidden, closeMenu);

  // الرصد على رأس اللوحة وعلى عدّاد الأحرف — لا على الشريط نفسه: عرض
  // الاثنين لا تغيّره عمليات النقل، فلا حلقة رصد↔تعديل. العدّاد مرصود
  // لأن ظهور نصّه («٢٨١ حرف» بعد أول نتيجة) يقتطع من عرض الشريط دون
  // أي حدث resize، فبغيره يفيض الشريط بعد التنسيق الأول وحده
  // جدولة واحدة مكبوحة للراصدَين: rAF يجمع القياس مع دورة التخطيط، لكنه
  // لا يُستدعى أصلًا والنافذة محجوبة — فيُستبدل بتنفيذ مباشر حينها حتى
  // لا تبقى الحالة معلّقة إن تغيّر المقاس والنافذة خلف غيرها
  let queued = false;
  function scheduleRecompute() {
    if (queued) return;
    queued = true;
    const run = () => {
      queued = false;
      recompute();
    };
    if (document.hidden) run();
    else requestAnimationFrame(run);
  }

  const head = toolbar.closest(".pane-head");
  if (head && window.ResizeObserver) {
    new ResizeObserver(scheduleRecompute).observe(head);
  }

  // عدّاد الأحرف يتغيّر نصًّا لا حجمَ حاوية، فلا يبلغه ResizeObserver —
  // ورصد تغيّر نصّه لا يمكن أن يُحدث حلقة لأن recompute لا يكتب فيه أبدًا
  const count = el("output-count");
  if (count && window.MutationObserver) {
    new MutationObserver(scheduleRecompute).observe(count, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
  window.addEventListener("resize", recompute);
  recompute();
})();
