// وحدة وضع «نسق» — منطق التنسيق كاملًا: المحاور الثلاثة، التنظيف المحلي،
// نداءات النموذج، ذاكرة الجلسة والتراجع، أدوات النتيجة، بطاقة الشذرة،
// ورقة التنويعات، عدسة القراءة، وعدّاد المنصات، وآلة حالات العرض. تستعمل
// عوام القشرة (shell.js تُحمَّل قبلها) وتصل نفسها بها بالتسجيل في ذيل هذا
// الملف. لا تعرف شيئًا عن «شَذْب» ولا تستورد منه. (انقسمت عن main.js نقلًا
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
  // عدّاد الأصل كلمات وأحرف فقط، والأسطر للنتيجة (Figma 99:592)
  updateCount(inputCount, inputText.value, { withLines: false });
  syncCaretBidi();
  // تعديل الكلمات نفسها (لا المسافات والأسطر — المفتاح مطبَّع) يبدأ جلسة جمع
  // جديدة: صيغ النص السابق غير المحفوظة تنتظر «حفظ» (heldVersions)
  if (sessionKey && window.NasaqDrafts.draftKey(inputText.value) !== sessionKey) {
    resetSession();
  }
  renderState();
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

// ---------- القائمة المنبثقة فوق الـ select ----------
// زر Popup Button من Figma (القيمة يمينًا والسهم المزدوج يسارًا) وقائمة داخل
// النافذة بخطَّي التطبيق وعلامة اختيار. الـselect يبقى مصدر الحقيقة (القيمة
// والمعرّف والقراءة البرمجية كما هي) ويُخفى؛ الاختيار هنا يكتب فيه ويطلق حدث
// change نفسه — لا يتغير أي منطق تحته
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
    '<svg class="icon" aria-hidden="true"><use href="#chevron.up.chevron.down.16m" /></svg>'
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
      item.innerHTML = '<svg class="icon menu-check" aria-hidden="true"><use href="#checkmark.16r" /></svg>';
      item.append(opt.textContent);
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

// تلميح واحد لكل مستوى تدخل، وتحت «تنسيق منصة» لكل منصة — نصوصه كما في لوحة
// Figma «نَسَق / Inspector · نصوص التلميحات» (303:8263). لا يَعِد التلميح بما لا
// يضمنه العقد: «الكلمات كما هي» للمستويات التي يمنع عقدها تغيير الكلمات منعًا
// باتًا (تنظيف، منقّط)؛ و«قراءة» يسمح عقده بالضرورة القصوى، و«إيقاعي» و«للنشر»
// يسمحان بعناوين عند الحاجة، فلا تَعِد بها
const LEVEL_HINTS = {
  [LEVELS.CLEAN]: "تنظيف: مسافات وعلامات ترقيم على جهازك، بلا نموذج — الكلمات كما هي.",
  [LEVELS.READ]: "قراءة: فقرات أقصر ووقفات أوضح لعين القارئ.",
  [LEVELS.RHYTHM]: "إيقاعي: فراغات تتنفس بين الجمل وكسر عند المنعطف.",
  [LEVELS.RHYTHM_DOTTED]: "منقّط: كسر عند الوقفات الحقيقية لا عند كل فاصلة — الكلمات كما هي.",
  [LEVELS.PUBLISH]: "للنشر: فقرات مضبوطة وترقيم سليم كنسخة نهائية.",
};
const PLATFORM_HINTS = {
  "مقال سابستاك": "عند النشر تبتلع سابستاك السطر الفارغ ويبقى كسر السطر.",
  "نوت سابستاك": "يعرض النوت النص من اليسار ويبتلع السطر الفارغ، فيبقى كسر السطر.",
  "إكس": "مقاطع قصيرة مكثّفة تناسب منشورات إكس.",
  "ثريدز": "فقرات متوسطة القِصَر تتدرّج مقطعًا بعد مقطع.",
  "إنستغرام": "أسطر قصيرة وفراغات أوضح، والجملة المحورية في سطر مستقل.",
  "واتساب": "فقرات قصيرة مريحة للقراءة على الهاتف، كرسالة.",
};

function syncInterventionControls() {
  const level = interventionSel.value;
  // المنصة لا تظهر ولا تعمل إلا تحت مستوى «تنسيق منصة»
  platformControl.hidden = level !== LEVELS.PLATFORM;
  // «أرِني تنويعات» لوجهة سابستاك حصرًا
  variationsBtn.hidden = !(level === LEVELS.PLATFORM && isSubstackFace(platformSel.value));
  interventionHint.textContent =
    level === LEVELS.PLATFORM ? PLATFORM_HINTS[platformSel.value] || "" : LEVEL_HINTS[level] || "";
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
  t = t.replace(/[ \t\u00A0]+/g, " ");

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
// ذاكرة الجلسة بين نداءين متوازيين. آلة الحالات تُظهر القفل: «نسّق» في حالة
// تحميل، والأدوات والإعدادات معطّلة، وهيكل نائب مكان النتيجة
let modelCallActive = false;
function setModelBusy(busy) {
  modelCallActive = busy;
  if (busy) closeIdentityDropdowns();
  renderState();
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

// صيغٌ لم تُحفظ لنصوصٍ تُركت (تغيّرت كلماتها، أو استُعيدت مسودة فوقها): لا تسقط
// بصمت، ولا تُحفظ بلا إذن — تنتظر «حفظ» التالي فيودعها كلًّا تحت أمّه
// (فحص m2-15). و«جلسة جديدة» وحدها تمحوها، وهي تستأذن قبل ذلك
let heldVersions = []; // [{ key، original، entries: [صيغ الجلسة غير المحفوظة] }]

function resetSession() {
  const pending = [...sessionVersions.values()].filter((v) => !v.saved);
  if (sessionKey && pending.length) {
    const held = heldVersions.find((h) => h.key === sessionKey);
    if (held) held.entries.push(...pending);
    else heldVersions.push({ key: sessionKey, original: sessionOriginal, entries: pending });
  }
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
    // نص بكلمات جديدة → جلسة جمع جديدة (وما لم يُحفظ من السابقة ينتظر «حفظ»)
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

// آخر نداء «نسّق» تعذّر وتنبيهه ظاهر — تُخفضه القشرة حين يُغلق التنبيه
let formatFailed = false;

async function formatText() {
  if (modelCallActive) return; // نداء آخر يكتب على النتيجة الآن — لا تزاحم
  const text = inputText.value.trim();
  clearError("nasaq");
  formatFailed = false;

  if (!text) {
    showError("أدخل نصًا أولًا.", { owner: "nasaq" });
    return;
  }

  const { style, intervention, platform } = currentSelection();

  // «تنظيف فقط» محلي وفوري — لا شبكة، لا مفتاح، لا انتظار، وثابت بين الضغطات
  if (intervention === LEVELS.CLEAN) {
    pushOutputUndo(); // صورة النتيجة الحالية قبل الكتابة فوقها
    const cleaned = cleanOnly(text);
    setOutput(cleaned);
    notesBox.hidden = true;
    showRhythmFingerprint(null);
    lastFormatMeta = { original: text, style, intervention, platform, linesAdjusted: false };
    syncResultTools();
    if (cleaned === text) showToast("النص نظيف أصلًا.", "neutral");
    else showToast("نُظّف النص محليًا.");
    return;
  }

  // ما بعد هذا السطر يحتاج مزوّدًا. بلا مزوّد تُفتح خطوة «اربط نموذجًا» بدل
  // خطأ اتصالٍ غامض — كما نصّ التصميم: «ويعيد «نسّق» فتح الخطوة الثانية».
  // و«تنظيف فقط» فوقه لأنه محلي لا يحتاج شيئًا
  if (window.NasaqOnboarding && !window.NasaqOnboarding.requireProvider()) return;

  // كل ضغطة محاولة جديدة برقم أعلى — التنويع الشكلي بدل إعادة الشكل نفسه
  // التوجيهات تدخل البصمة: توجيهات جديدة = عدّاد محاولات جديد لا استكمال قديم
  const directives = currentDirectives();
  const fingerprint = `${style}|${intervention}|${platform || ""}|${directives || ""}|${text}`;
  const attempt = nextAttempt(fingerprint);

  setModelBusy(true);

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
    // التنبيه داخل عمود النتيجة يطمئن أن النص لم يتغيّر ويعرض «أعد المحاولة»
    // (Figma 103:11832) — رسائل النواة التي تطمئن بنفسها لا تُكرَّر طمأنتها
    const message = String(err);
    showError(message, {
      owner: "nasaq",
      note: message.includes("نصّك") ? "" : "نصّك لم يتغيّر.",
      action: { label: "أعد المحاولة", run: formatText },
    });
    // بعد العرض: تنبيه نسق سابق حلّ محله هذا أعلن زواله، والحالة الآن لهذا الفشل
    formatFailed = true;
  } finally {
    setModelBusy(false);
  }
}

formatBtn.addEventListener("click", formatText);

// ⌘↩ صار مسرّع «الفعل الرئيس» في القائمة الرابعة (المرحلة ٧-ب)، فلا مستمع
// لوحة مفاتيح له. والشرطان القديمان لم يزولا بل انتقلا إلى السجلّ: زرّ «نسّق»
// نفسه مصدر الحالة (مخفيًّا أو معطّلًا = أمرًا معطّلًا)، ولا ينفَّذ أمرٌ تحت ورقة
window.NasaqMenu.register("format.primary", formatText, { button: formatBtn, owner: "nasaq" });

// خريطة سابستاك اليدوية إرشاد للعرض فقط — تُجرَّد قبل النسخ فلا يصل رمز واحد
// إلى الحافظة (خارج سابستاك النص أصلًا بلا رموز، فالتجريد بلا أثر)
copyBtn.addEventListener("click", async () => {
  const text = window.NasaqSubstackMarkers.stripSubstackMarkers(outputText.textContent);
  if (!text.trim()) {
    showToast("لا يوجد نص منسق بعد.", "neutral");
    return;
  }
  if (await copyText(text)) showToast("نُسخت النتيجة");
  else showToast("تعذّر النسخ إلى الحافظة.", "danger");
});

// ونسخ تحديدٍ يمسّ النتيجة أو العدسة أو التنويعات بـ ⌘C، أو سحبه إلى خارج النافذة،
// يمرّ بالتجريد نفسه — خريطة الرموز إرشاد للعرض فقط لا تصل الحافظة من أي طريق.
// «يمسّ» لا «يبدأ فيها»: تحديد يمتد إليها من خارجها (⌘A) يُجرَّد كذلك، والتجريد
// لا يغيّر نصًا بلا رموز. والمخفي منها لا يُحسب — WebKit يحسب التحديد على بنية
// الصفحة، فلا يُجرَّد نسخُ وحدةٍ أخرى لأن نتيجة نَسَق مخفية تحته
const MARKED_TEXT = "#output-text, #reading-lens-text, .variation-text";
function markedSelectionText() {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed) return null;
  const touches = [...document.querySelectorAll(MARKED_TEXT)].some(
    (node) => node.offsetParent !== null && selection.containsNode(node, true)
  );
  return touches ? window.NasaqSubstackMarkers.stripSubstackMarkers(selection.toString()) : null;
}
document.addEventListener("copy", (e) => {
  const text = markedSelectionText();
  if (text === null || !e.clipboardData) return;
  e.clipboardData.setData("text/plain", text);
  e.preventDefault();
});
// السحب: التحديد نفسه لا عنصرٌ آخر قابل للسحب — من أي موضع فيه بدأ
document.addEventListener("dragstart", (e) => {
  const text = markedSelectionText();
  if (text === null || !e.dataTransfer || !document.getSelection().containsNode(e.target, true)) return;
  e.dataTransfer.clearData();
  e.dataTransfer.setData("text/plain", text);
});

// ---------- أدوات على النص المنسّق ----------
function getOutputOrWarn() {
  const text = outputText.textContent;
  if (!text.trim()) {
    showToast("لا يوجد نص منسق بعد.", "neutral");
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
    showToast("لا تعديل للتراجع عنه.", "neutral");
    return;
  }
  setOutput(snap.text);
  lastFormatMeta = snap.meta;
  showRhythmFingerprint(snap.rhythm);
  // ما يُعرض هو ما يُحفظ: الصيغة المستعادة تكتب فوق صيغة نوعها في ذاكرة
  // الجلسة («تنظيف فقط» تستثني نفسها داخل recordSessionVersion أصلًا)
  recordSessionVersion(snap.meta.original, snap.meta, snap.text);
  syncResultTools();
  showToast("استُعيدت النتيجة السابقة.");
}

const undoBtn = el("undo-btn");
undoBtn.addEventListener("click", undoOutput);

// ---------- «سطور أقل/أكثر»: عبر النموذج، وبالاحتياط المحلي عند تعذّره ----------
// الدالتان المحليتان النقيتان في lines.js — تُنادَيان عبر window.NasaqLines
// (لا تعِد إعلانهما بـ const هنا: دوال lines.js في النطاق العام، والتظليل يرمي
// SyntaxError يعطّل الملف كله — كما في تنبيه insideTauri أدناه)
const fewerBtn = el("fewer-lines-btn");
const moreBtn = el("more-lines-btn");

function setAdjustBusy(busy) {
  // القفل المشترك نفسه (٢-أ): تعديل الأسطر عبر النموذج يقفل «نسق» أيضًا،
  // والهيكل النائب يظهر مكان النتيجة كما في التنسيق
  setModelBusy(busy);
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
    renderState();
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
  } catch (err) {
    // فشل الخدمة لا يخذل الزر: تعديل محلي مع إشعار خفيف يسمّي السبب كما قالته
    // النواة (مفتاح، رصيد، حدّ، مهلة…) لا «تعذّر الاتصال» لكل سبب (فحص m3-07)
    const adjusted = localFallback(current);
    setOutput(adjusted);
    showRhythmFingerprint(null); // تعديل محلي بلا نموذج — الوصف السابق صار غير دقيق
    markAdjusted(adjusted);
    const reason = String(err || "").split(" — ")[0].trim().replace(/\.$/, "") || "تعذّر الاتصال بالنموذج";
    showToast(`${reason} — طُبّق تعديل محلي.`, "warning");
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

// [إضافة سطور فارغة] (المرحلة ٩، مواصفة المالك): محلي حتمي بلا نموذج — سطر
// فارغ واحد بين كل سطرين (window.NasaqLines.addBlankLinesLocal). يعمل على
// النص الحالي: النتيجة إن كانت لهذا النص، وإلا الأصل. على النتيجة يدخل مكدس
// تراجعها كأخواته؛ وعلى الأصل يُدرج إدراجًا أصليًا فيتراجع عنه ⌘Z الحقل نفسه
function addBlankLines() {
  const resultIsCurrent =
    Boolean(outputText.textContent.trim()) &&
    Boolean(lastFormatMeta) &&
    window.NasaqDrafts.draftKey(lastFormatMeta.original) === window.NasaqDrafts.draftKey(inputText.value);

  if (resultIsCurrent) {
    const text = outputText.textContent;
    const out = window.NasaqLines.addBlankLinesLocal(text);
    if (out === text) {
      showToast("بين الأسطر سطر فارغ أصلًا.", "neutral");
      return;
    }
    pushOutputUndo();
    setOutput(out);
    showRhythmFingerprint(null); // تعديل محلي بلا نموذج — الوصف السابق صار غير دقيق
    lastFormatMeta = { ...lastFormatMeta, linesAdjusted: true };
    recordSessionVersion(lastFormatMeta.original, lastFormatMeta, out);
    syncResultTools();
    return;
  }

  const text = inputText.value;
  if (!text.trim()) return;
  const out = window.NasaqLines.addBlankLinesLocal(text);
  if (out === text) {
    showToast("بين الأسطر سطر فارغ أصلًا.", "neutral");
    return;
  }
  // تحديد الكل ثم إدراجٌ عبر محرّر WebKit: يدخل سجلّ تراجع الحقل ويطلق
  // حدث input كالكتابة تمامًا — تعيين value مباشرة يمحو ذلك السجلّ
  inputText.focus();
  inputText.setSelectionRange(0, text.length);
  if (!document.execCommand("insertText", false, out)) {
    inputText.value = out;
    inputText.dispatchEvent(new Event("input"));
  }
  inputText.setSelectionRange(0, 0);
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

const cleanBtn = el("clean-btn");
const addBlankBtn = el("add-blank-lines-btn");
const splitBtn = el("split-sentences-btn");
fewerBtn.addEventListener("click", () => adjustLines("fewer"));
moreBtn.addEventListener("click", () => adjustLines("more"));
cleanBtn.addEventListener("click", cleanEmptyLines);
addBlankBtn.addEventListener("click", addBlankLines);
splitBtn.addEventListener("click", splitSentences);

// ---------- أدوات وجهة سابستاك على النتيجة: التصدير وبطاقة الشذرة ----------
// تُزامَن بعد كل تغيير للنتيجة، والوجهة تُقرأ من بيانات النتيجة وقت إنتاجها
// (lastFormatMeta) لا من القوائم — تغيير القوائم بعد التنسيق لا يغيّر النتيجة
const exportBtn = el("export-btn");
const fragmentCard = el("fragment-card");
const fragmentBrokenBox = el("fragment-broken");
const fragmentJoinedBox = el("fragment-joined");
let fragmentForms = null; // صورتا المنعطف للنتيجة المعروضة الآن
// الشكل المعتمد للنتيجة المعروضة { which، text، snapshot } — snapshot صورة التراجع التي
// دفعها الاعتماد (أو null إن لم يدفع). يزول القرار حين تتغير النتيجة بطريق آخر أو
// تُسحب صورته من المكدس، ولو كان الشكل المعتمد هو المعروض أصلًا فلم يتغير النص
let turnDecision = null;

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
      outputCount.textContent += ` — أطول مقطع (${arabicDigits.format(longest)}) يتجاوز حدّ إكس ${arabicDigits.format(limit)}`;
      outputCount.classList.add("over-limit");
    }
  } else if (text.length > limit) {
    outputCount.textContent += ` — يتجاوز حدّ ${meta.platform} (${arabicDigits.format(limit)})`;
    outputCount.classList.add("over-limit");
  }
}

function syncResultTools() {
  const face = metaSubstackFace();
  const text = outputText.textContent;
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
  }
  // القرار يخص نصًا بعينه: نتيجة تغيّرت بطريق آخر (تنسيق، تراجع، أسطر) تعيد السؤال
  if (
    turnDecision &&
    (!fragmentForms || turnDecision.text !== text || (turnDecision.snapshot && !outputUndoStack.includes(turnDecision.snapshot)))
  ) {
    turnDecision = null;
  }
  renderState();
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
    showToast("تعذّر النسخ إلى الحافظة.", "danger");
  }
});

// اختيار شكل المنعطف: تحوّل تخطيطي بحت (كسر/وصل بلا أي محرف مضاف) —
// يكتب فوق صيغة نوعه في ذاكرة الجلسة كتعديل أسطر، ونسق يُري ولا يقرر
function adoptTurnForm(which) {
  if (!fragmentForms || !lastFormatMeta) return;
  const topBefore = outputUndoStack[outputUndoStack.length - 1];
  pushOutputUndo();
  const chosen = which === "broken" ? fragmentForms.broken : fragmentForms.joined;
  setOutput(chosen);
  lastFormatMeta = { ...lastFormatMeta, linesAdjusted: true };
  recordSessionVersion(lastFormatMeta.original, lastFormatMeta, chosen);
  const top = outputUndoStack[outputUndoStack.length - 1];
  turnDecision = { which, text: chosen, snapshot: top !== topBefore ? top : null };
  syncResultTools();
  showToast(which === "broken" ? "اعتُمدت المكسورة عند المنعطف." : "اعتُمدت الموصولة.");
}

el("adopt-broken").addEventListener("click", () => adoptTurnForm("broken"));
el("adopt-joined").addEventListener("click", () => adoptTurnForm("joined"));
// «تراجع عن القرار»: يسحب صورة الاعتماد نفسها إن بقيت أعلى المكدس فتعود النتيجة التي
// سبقته، وإلا يرفع القرار وحده — لا يسحب صورة أقدم لا علاقة لها بالقرار
function revertTurnDecision() {
  if (!turnDecision) return;
  const { snapshot } = turnDecision;
  turnDecision = null;
  if (snapshot && outputUndoStack[outputUndoStack.length - 1] === snapshot) undoOutput();
  else syncResultTools();
}
el("revert-broken").addEventListener("click", revertTurnDecision);
el("revert-joined").addEventListener("click", revertTurnDecision);

// ---------- ورقة تنويعات سابستاك (Figma 259:6142 و259:6483) ----------
// ثلاث تنويعات دفعة واحدة: ثلاثة نداءات بعقد سابستاك نفسه وثلاثة أرقام
// محاولة متتالية (بذور التنويع) — تختلف في مواضع كسر السطر وتوزيع الوقفات
// والكلمات والمعنى كما هي. العدّاد مشترك مع زر «نسّق» فلا تتكرر الأشكال.
// لكل عمود حالته (جارٍ التوليد، جاهز، تعذّر) و«أعد المحاولة» لعموده وحده
const variationsOverlay = el("variations-sheet"); // الاسم باقٍ: حارس العزل يثبت وصلة Esc به
const variationsGrid = el("variations-grid");
const variationsTitle = el("variations-title");
const regenBtn = el("regen-variations");
const VARIATION_TITLES = ["التنويع الأول", "التنويع الثاني", "التنويع الثالث"];
let variationsMeta = null; // ما وُلّدت به التنويعات المعروضة
let variationStates = [];  // لكل عمود { state: generating | ready | failed، payload }
let variationsBatch = 0;   // دفعة جديدة تُسقط نتائج الدفعة السابقة المتأخرة

const variationsGenerating = () => variationStates.some((s) => s.state === "generating");

// الدفعة المعروضة وُلّدت لما في المحرر والمفتّش الآن؟
function variationInputsCurrent() {
  if (!variationsMeta) return false;
  const { style, intervention, platform } = currentSelection();
  const m = variationsMeta;
  return (
    m.original === inputText.value.trim() &&
    m.style === style &&
    m.intervention === intervention &&
    m.platform === platform &&
    m.directives === currentDirectives()
  );
}

function buildVariationColumn(index, state, payload) {
  const col = document.createElement("article");
  col.className = "variation";
  col.dataset.state = state;
  col.tabIndex = -1;
  col.setAttribute("aria-labelledby", `variation-title-${index}`);
  col.setAttribute("aria-busy", String(state === "generating"));

  const header = document.createElement("header");
  header.className = "variation-header";
  const title = document.createElement("h3");
  title.id = `variation-title-${index}`;
  title.className = "variation-title";
  title.textContent = VARIATION_TITLES[index];
  const tag = document.createElement("span");
  tag.className = "tag";
  tag.dataset.tone = state === "ready" ? "success" : state === "failed" ? "danger" : "neutral";
  tag.textContent = state === "ready" ? "جاهز" : state === "failed" ? "تعذّر" : "جارٍ التوليد";
  header.append(title, tag);
  col.appendChild(header);

  const body = document.createElement("div");
  body.className = "variation-body";
  if (state === "generating") {
    body.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 5; i++) body.appendChild(document.createElement("span")).className = "skeleton-line";
  } else if (state === "failed") {
    body.innerHTML = '<svg class="icon icon-20 variation-failed-icon" aria-hidden="true"><use href="#xmark.octagon.20r" /></svg>';
    const message = document.createElement("p");
    message.className = "variation-message";
    message.textContent = splitErrorText(payload).title || "انقطع الاتصال بالنموذج";
    const retry = document.createElement("button");
    retry.type = "button";
    retry.className = "button button-secondary";
    retry.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#arrow.clockwise.16m" /></svg>';
    retry.append("أعد المحاولة");
    retry.addEventListener("click", () => retryVariation(index));
    body.append(message, retry);
  } else {
    const t = document.createElement("div");
    t.className = "variation-text selectable";
    // وجه النوت LTR تقليدًا للمنصة؛ المقال RTL. أزرار الورقة وعناوينها عربية RTL دائمًا
    t.classList.toggle("note-face", variationsMeta.platform === SUBSTACK_NOTE);
    t.textContent = payload;
    body.appendChild(t);
  }
  col.appendChild(body);

  if (state === "ready") {
    const adopt = document.createElement("button");
    adopt.type = "button";
    adopt.className = "button button-primary variation-adopt";
    adopt.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#nsq.approve.16m" /></svg>';
    adopt.append("اعتمد هذا الشكل");
    adopt.addEventListener("click", () => adoptVariation(payload));
    col.appendChild(adopt);
  }
  return col;
}

// الدفعة الجديدة تبني الأعمدة الثلاثة، ووصول عمود يستبدل عموده وحده — فلا يضيع
// تركيز الكاتب أو تحديده في عمود آخر، ولا يُنقل التركيز إلا إن كان في العمود نفسه
function renderVariationColumns(index = null) {
  if (index === null) {
    variationsGrid.replaceChildren(...variationStates.map((s, i) => buildVariationColumn(i, s.state, s.payload)));
  } else {
    const col = buildVariationColumn(index, variationStates[index].state, variationStates[index].payload);
    const current = variationsGrid.children[index];
    const hadFocus = current && current.contains(document.activeElement);
    if (current) current.replaceWith(col);
    if (hadFocus && !variationsOverlay.hidden) col.focus();
  }
  regenBtn.disabled = variationsGenerating();
  renderState();
}

// «أرِني تنويعات…» (والاختصار): الورقة للمدخلات نفسها تُعرض بدفعتها كما بلغت —
// جارية أو منتهية — بلا نداءات، فلا يتوقف ما يراه الكاتب على توقيت لا يراه.
// التوليد من جديد لـ «ولّد ثلاثًا جديدة» وحده
function showVariations() {
  if (variationStates.length && variationInputsCurrent()) {
    window.NasaqWindow.presentModal(variationsOverlay, { initialFocus: "#close-variations" });
    return;
  }
  generateVariations();
}

async function generateVariations() {
  const text = inputText.value.trim();
  if (!text) {
    showError("أدخل نصًا أولًا.", { owner: "nasaq" });
    return;
  }
  clearError("nasaq");

  const { style, intervention, platform } = currentSelection();
  if (!isSubstackFace(platform)) return; // الزر لا يظهر أصلًا لغير سابستاك

  // لا دفعة فوق دفعة جارية: «أرِني تنويعات…» معطّل لمدخلات غيرها حتى تنتهي (renderState)
  if (variationsGenerating()) return;

  // نداء مخصص للورقة (generate_variation لا format_text): كل شق يحمل رافعة
  // كثافة كسر مختلفة بنيويًا (slot 0/1/2) فيظهر تباين حقيقي حتى على نص قصير
  // الجُمل، لا إزاحة كلمة. رقم الدفعة يتقدم بثلاث فيتنوع «ولّد ثلاثًا جديدة».
  // التوجيهات الخاصة تسري على التنويعات الثلاث كلها
  const directives = currentDirectives();
  variationsMeta = { original: text, style, intervention, platform, directives };
  variationsTitle.textContent = `تنويعات — ${platform === SUBSTACK_NOTE ? SUBSTACK_NOTE : SUBSTACK_ARTICLE}`;
  variationStates = [0, 1, 2].map(() => ({ state: "generating" }));
  const batch = ++variationsBatch;
  // «ولّد ثلاثًا جديدة» يتعطل أثناء التوليد: لا يُترك التركيز عليه فيسقط
  if (document.activeElement === regenBtn) el("close-variations").focus();
  renderVariationColumns();
  window.NasaqWindow.presentModal(variationsOverlay, { initialFocus: "#close-variations" });

  const fingerprint = `${style}|${intervention}|${platform}|${directives || ""}|${text}`;
  const base = nextAttempt(fingerprint);
  const calls = [0, 1, 2].map((i) =>
    invoke("generate_variation", { text, style, intervention, platform, slot: i, attempt: base + i, directives })
  );
  // الأرقام الثلاثة محجوزة فور الإطلاق: «أعد المحاولة» لعمود تعذّر قبل أن تستقر
  // الدفعة يأخذ رقمًا بعدها لا رقمًا منها. وكل عمود يظهر حين يصل نداؤه (Figma
  // 259:6483: جاهز وجارٍ وتعذّر معًا)
  attemptCounts.set(fingerprint, base + 2);
  calls.forEach((call, i) =>
    call.then(
      (r) => ({ state: "ready", payload: r.formattedText }),
      (err) => ({ state: "failed", payload: err })
    ).then((next) => {
      if (batch !== variationsBatch) return;
      variationStates[i] = next;
      renderVariationColumns(i);
    })
  );
}

// «أعد المحاولة» لعمود واحد: النداء نفسه لشقّه برقم محاولة جديد من البصمة
// نفسها، وبما وُلّدت به الدفعة لا بما صارت إليه القوائم
async function retryVariation(index) {
  if (!variationsMeta) return;
  const { original: text, style, intervention, platform, directives } = variationsMeta;
  const batch = variationsBatch;
  const fingerprint = `${style}|${intervention}|${platform}|${directives || ""}|${text}`;
  const attempt = nextAttempt(fingerprint);
  attemptCounts.set(fingerprint, attempt);
  variationStates[index] = { state: "generating" };
  renderVariationColumns(index);
  let next;
  try {
    const r = await invoke("generate_variation", { text, style, intervention, platform, slot: index, attempt, directives });
    next = { state: "ready", payload: r.formattedText };
  } catch (err) {
    next = { state: "failed", payload: err };
  }
  if (batch !== variationsBatch) return;
  variationStates[index] = next;
  renderVariationColumns(index);
}

// «اعتمد هذا الشكل»: التنويعة تدخل المخرَج الرئيس وتصبح كأي نتيجة —
// قابلة للحفظ والتصدير وتعديل الأسطر وبطاقة الشذرة
function adoptVariation(text) {
  pushOutputUndo(); // النتيجة السابقة (إن كانت لهذا النص) تبقى قابلة للاستعادة
  setOutput(text);
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

// الإغلاق لا يُسقط الدفعة: نداءاتها مدفوعة، وإعادة فتح الورقة للمدخلات نفسها
// تعرضها كما بلغت. و«أرِني تنويعات…» يُحسب قبل الإغلاق ليعود التركيز إليه لا إلى body
function closeVariations() {
  renderState();
  window.NasaqWindow.dismissModal(variationsOverlay);
}

variationsBtn.addEventListener("click", showVariations);
regenBtn.addEventListener("click", generateVariations);
el("close-variations").addEventListener("click", closeVariations);

// تغيّر الإعدادات أو التوجيهات يعيد حساب «أرِني تنويعات…» الذي ينتظر دفعةً جارية
// لمدخلات غيرها (تغيّر النص يعيده مستمع الإدخال نفسه)
for (const control of [el("format-style"), interventionSel, platformSel]) control.addEventListener("change", renderState);
directivesInput.addEventListener("input", renderState);

// ---------- عدسة القراءة: نافذة منبثقة من زرها (Figma 261:6648) ----------
// معاينة عرض هاتف ٣٧٥، للعرض فقط — لا تحرير ولا تعديل. النص كما هو حرفيًا (بما
// فيه رموز خريطة سابستاك إن وُجدت)، وتحترم اتجاه النص الحالي (RTL/LTR)
const readingLensBtn = el("reading-lens-btn");
const readingLensOverlay = el("reading-lens"); // الاسم باقٍ: حارس العزل يثبت وصلة Esc به
const readingLensText = el("reading-lens-text");

function openReadingLens() {
  const text = getOutputOrWarn();
  if (text === null) return;
  readingLensText.textContent = text;
  // وجه النوت يُعرض يسارًا كما في المخرَج الرئيس — العدسة تعرض لا تقرر
  readingLensText.classList.toggle("note-face", metaSubstackFace() === SUBSTACK_NOTE);
  // الزر قد يكون مطويًّا في «المزيد» عند الضيق — فتشير النافذة إلى «المزيد»
  const anchor = readingLensBtn.offsetParent ? readingLensBtn : document.querySelector("[data-overflow-button]");
  window.NasaqWindow.presentPopover(readingLensOverlay, anchor, { control: readingLensBtn });
}

function closeReadingLens() {
  window.NasaqWindow.dismissPopover();
}

readingLensBtn.addEventListener("click", openReadingLens);

// استعادة صيغة: النص الخام من الأمّ، والمنسّق والمحاور الثلاثة من الصيغة —
// لو ضغط «نسّق» بعدها لأنتج على الأساس نفسه. المسودة تبقى محفوظة
function restoreDraft(mother, version) {
  clearError("nasaq");
  inputText.value = mother.original || "";
  inputText.dispatchEvent(new Event("input"));

  setOutput(version.formatted || "");
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
  renderState();
  showToast("استُعيدت المسودة.");
}

// «حفظ» يودع الدفعة: آخر صيغة من كل نوع جُرّب على هذا النص منذ آخر حفظ،
// كلها تحت الأمّ المطابقة بالمفتاح المطبَّع (تُنشأ إن لم توجد) — النصف
// التخزيني في القشرة (depositDraftVersions)، وهنا نصف الجلسة فقط.
// ما حُفظ من قبل لا يُعاد إيداعه — علامة saved لكل مدخل تمنع التكرار
const saveBtn = el("save-draft-btn");
function draftVersionsOf(entries, base) {
  return entries.map((v, i) => ({
    id: base + i,
    createdAt: v.updatedAt,
    formatted: v.formatted,
    style: v.style,
    intervention: v.intervention,
    platform: v.platform,
    // ناتج «سطور أقل/أكثر» يبقى تحت نوعه الأصلي بوسم خفيف، لا نوعًا هجينًا
    linesAdjusted: v.linesAdjusted,
  }));
}

saveBtn.addEventListener("click", async () => {
  if (sessionVersions.size === 0 && heldVersions.length === 0) {
    showToast("لا توجد صيغة للحفظ — نسّق النص أولًا.", "neutral");
    return;
  }

  const pending = [...sessionVersions.values()].filter((v) => !v.saved);
  if (pending.length === 0 && heldVersions.length === 0) {
    showToast("لا جديد ليُحفظ منذ آخر حفظ.", "neutral");
    return;
  }

  // الصيغ المنتظرة لنصوصٍ سابقة أولًا، كلٌّ تحت أمّه، ثم صيغ النص الحالي. وكل
  // دفعةٍ نجحت تُرفع من الانتظار فورًا، ففشلٌ بعدها لا يعيد إيداعها
  let base = Date.now();
  let saved = 0;
  try {
    while (heldVersions.length) {
      const held = heldVersions[0];
      await depositDraftVersions(held.key, held.original, draftVersionsOf(held.entries, base));
      base += held.entries.length;
      saved += held.entries.length;
      heldVersions.shift();
    }
    if (pending.length) {
      await depositDraftVersions(sessionKey, sessionOriginal, draftVersionsOf(pending, base));
      // خفض «متسخة» بعد نجاح الحفظ فقط — الخريطة تبقى، وما يُنتج بعدها يتجمع طبيعيًا
      for (const v of pending) v.saved = true;
      saved += pending.length;
    }
    showToast(`حُفظت ${versionsCountLabel(saved)}.`);
  } catch (err) {
    showError(String(err), { owner: "nasaq" });
  } finally {
    // ما رُفع من الانتظار يُرفع من الجلسة المحفوظة أيضًا، وإلا عاد بعد الإقلاع
    // فحُفظ مرتين — والحفظ لا يمرّ بـ renderState
    window.NasaqShell.session.touch();
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

// جزء نَسَق من الجلسة الجارية (فحص m2-16): النتيجة وعلى أي أساسٍ صدرت، وصيغ
// الجلسة غير المحفوظة والمنتظرة. التراجع والتنويعات والبصمة لا تُحمل — عرضٌ لا عمل
window.NasaqShell.session.register("nasaq", {
  capture: () => ({
    sessionKey,
    sessionOriginal,
    versions: [...sessionVersions.entries()],
    held: heldVersions,
    output: outputText.textContent,
    meta: lastFormatMeta,
  }),
  restore(saved) {
    sessionKey = saved.sessionKey ?? null;
    sessionOriginal = saved.sessionOriginal ?? "";
    sessionVersions = new Map(Array.isArray(saved.versions) ? saved.versions : []);
    heldVersions = Array.isArray(saved.held) ? saved.held : [];
    lastFormatMeta = saved.meta ?? null;
    if (saved.output) setOutput(saved.output);
    syncResultTools();
    renderState();
  },
});

// تنبيه نسق زال (زر الإغلاق، أو «أعد المحاولة»، أو خطأ آخر لنسق حلّ محله) — تعود
// الحالة إلى ما تحتها. تنبيهات شَذْب لا تمسّها
document.addEventListener("nasaq:error-cleared", (e) => {
  if (!formatFailed || e.detail?.owner !== "nasaq") return;
  formatFailed = false;
  renderState();
});

// ---------- بحث في النتيجة: شريط ٣٢ تحت شريط الأدوات (Figma 262:7032) ----------
// قراءة فقط من outputText، والتمييز عبر CSS Custom Highlight API فلا تُدرَج
// عقد <mark> في الشجرة، فتبقى تراجع/تنظيف الأسطر الفارغة/فصل الجمل (التي تقرأ
// نصّ outputText مباشرة) بمنأى تام عن أي تأثير. بلا نداء نموذج ولا حفظ — عرض
// وتنقّل محليان فقط. ⌘F يفتح، و⌘G / ⇧⌘G أو ↩ / ⇧↩ للتالي والسابق، وEsc أو «تم» يغلق
const outputSearch = (function initOutputSearch() {
  const btn = el("output-search-btn");
  const bar = el("output-search-bar");
  const input = el("output-search-input");
  const countEl = el("output-search-count");
  const prevBtn = el("output-search-prev");
  const nextBtn = el("output-search-next");
  const closeBtn = el("output-search-close");
  const clearBtn = el("output-search-clear");

  const supportsHighlight =
    typeof CSS !== "undefined" && "highlights" in CSS && typeof Highlight !== "undefined";
  const reduceMotion = window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

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

  // «١ من ٣» بأرقام هندية، و«لا تطابق» حين يخلو النص من الكلمة (Figma 73:701)
  function updateCount() {
    countEl.textContent = matches.length
      ? `${arabicDigits.format(activeIndex + 1)} من ${arabicDigits.format(matches.length)}`
      : input.value.trim()
      ? "لا تطابق"
      : "";
    prevBtn.disabled = nextBtn.disabled = matches.length === 0;
    clearBtn.hidden = !input.value;
  }

  function goTo(index) {
    if (!matches.length) return;
    activeIndex = ((index % matches.length) + matches.length) % matches.length;
    const range = matches[activeIndex];
    const container = range.startContainer.parentElement;
    if (container && container.scrollIntoView) {
      container.scrollIntoView({ block: "center", behavior: reduceMotion && reduceMotion.matches ? "auto" : "smooth" });
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
    if (btn.disabled) return;
    bar.hidden = false;
    btn.setAttribute("aria-expanded", "true");
    input.focus();
    input.select();
    if (input.value) runSearch();
    else updateCount();
  }

  function closeSearch() {
    // إعادة التركيز لزر الفتح قبل الإخفاء: العنصر النشط قد يكون داخل الشريط
    // (الحقل أو أزرار التنقّل) — إخفاؤه بلا نقل التركيز يُسقط تركيز لوحة
    // المفاتيح إلى <body> فيضطر المستخدم لبدء التنقّل من رأس الصفحة (٢٫٤٫٣)
    // الزر قد يكون مطويًّا في «المزيد» عند الضيق فلا يقبل التركيز — فالمحرر إن
    // كان ظاهرًا
    if (bar.contains(document.activeElement)) [btn, inputText].find((n) => n.offsetParent && !n.disabled)?.focus();
    bar.hidden = true;
    btn.setAttribute("aria-expanded", "false");
    clearHighlights();
    matches = [];
    activeIndex = -1;
    countEl.textContent = "";
  }

  btn.addEventListener("click", () => (bar.hidden ? openSearch() : closeSearch()));
  closeBtn.addEventListener("click", closeSearch);
  clearBtn.addEventListener("click", () => {
    input.value = "";
    runSearch();
    input.focus();
  });
  input.addEventListener("input", runSearch);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      goTo(activeIndex + (e.shiftKey ? -1 : 1));
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeSearch();
    }
  });
  nextBtn.addEventListener("click", () => goTo(activeIndex + 1));
  prevBtn.addEventListener("click", () => goTo(activeIndex - 1));
  // ⌘G و⇧⌘G صارا عنصرَي «التالي» و«السابق» في قائمة «بحث ▸» (المرحلة ٧-ب).
  // الشريط الظاهر وحده يستجيب: وهو مفتوح في نسق يبقى مخفيًا ما دامت وحدة أخرى
  // تملأ الواجهة — فزرّاه هما مصدر حالة العنصرين
  const visible = () => !bar.hidden && bar.offsetParent !== null;
  window.NasaqMenu.register("edit.find.next", () => goTo(activeIndex + 1), { button: nextBtn });
  window.NasaqMenu.register("edit.find.previous", () => goTo(activeIndex - 1), { button: prevBtn });
  registerEscapeCloser(() => visible() && !window.NasaqWindow.isModalOpen(), closeSearch);

  return { open: openSearch, close: closeSearch, isOpen: () => !bar.hidden, refresh: () => !bar.hidden && runSearch() };
})();

// نافذتا نسق تتقدمان شريط البحث ولوحات القشرة في الإغلاق بالمفتاح، والعدسة قبل
// التنويعات — التسجيل بالأحدث أولًا يجعل الفحص:
// [العدسة، التنويعات، شريط البحث، تنبيه الحذف، الإعدادات]
registerEscapeCloser(() => !variationsOverlay.hidden, closeVariations);
registerEscapeCloser(() => !readingLensOverlay.hidden, closeReadingLens);

// النتيجة تغيّرت (تراجع، أسطر، اعتماد): شريط البحث يعيد تطابقاته على النص الجديد،
// والعدسة المفتوحة تعرض النص الجديد بوجهه
new MutationObserver(() => {
  outputSearch.refresh();
  if (!readingLensOverlay.hidden) {
    readingLensText.textContent = outputText.textContent;
    readingLensText.classList.toggle("note-face", metaSubstackFace() === SUBSTACK_NOTE);
  }
}).observe(outputText, { childList: true, characterData: true, subtree: true });

// ---------- آلة حالات نَسَق (Figma 100:542) ----------
// خمس حالات صريحة تُحسب من حالة الجلسة نفسها لا من CSS: فارغة، أثناء التنسيق،
// نتيجة، مراجعة المنعطف، خطأ. الحالة تُكتب في data-nasaq-state على الجذر،
// وكل ما تقرره (أزرار معطّلة، هيكل نائب، أقسام المفتّش، مؤشر الحالة) يُضبط هنا
// صراحةً. المنطق تحتها لا يتغير: هي تعرض ما فعله فقط
const STATUS_LABELS = {
  empty: "لم يُنسَّق بعد",
  processing: "جارٍ التنسيق…",
  result: "منسَّق",
  review: "بانتظار اختيارك",
  error: "تعذّر التنسيق",
};
const nasaqStatus = el("nasaq-status");
const nasaqStatusLabel = el("nasaq-status-label");
const settingsHeader = document.querySelector('[aria-controls="settings-content"]');
const reportSection = el("report-section");
const reportHeader = document.querySelector('[aria-controls="report-content"]');
const reportSkeleton = el("report-skeleton");
const rhythmBox = el("rhythm-box");
const searchBtn = el("output-search-btn");
let renderedState = null;
let reportHadContent = null;
let focusBeforeBusy = null; // عنصر تعطّل وعليه التركيز حين بدأ النداء — يعود إليه بعده

function nasaqState() {
  const hasResult = Boolean(outputText.textContent.trim());
  if (modelCallActive) return "processing";
  if (formatFailed) return "error";
  if (hasResult && fragmentForms && !turnDecision) return "review";
  return hasResult ? "result" : "empty";
}

function renderState() {
  // كل تغيّرٍ يُرسم تغيّرٌ في الجلسة: تُكتب بعد سكتة (القشرة تجمع المتتابع)
  window.NasaqShell.session.touch();
  const state = nasaqState();
  const busy = state === "processing";
  const hasText = Boolean(inputText.value.trim());
  const hasResult = Boolean(outputText.textContent.trim());
  const transition = state !== renderedState;
  document.documentElement.dataset.nasaqState = state;
  if (busy && transition && document.activeElement !== document.body) focusBeforeBusy = document.activeElement;

  // «نسّق»: معطّل بلا نص، وتحميل أثناء النداء، وبارز حتى توجد نتيجة ثم زجاجي
  formatBtn.disabled = busy || !hasText;
  // بارز بلون الوحدة ما دام هناك نص بلا نتيجة، وزجاجي بحافته في غير ذلك —
  // والمعطّل بلا نص زجاجي خافت لا مسطح غائر بين كبسولات الشريط. أثناء النداء
  // يبقى بأسلوب لحظة إطلاقه ولو مُحي النص تحته
  if (!busy) formatBtn.dataset.style = hasText && !hasResult ? "primary" : "glass";
  formatBtn.setAttribute("aria-busy", String(busy));

  // أدوات الشريط تعمل على نتيجة موجودة ولا تزاحم نداءً جاريًا
  const tools = hasResult && !busy;
  for (const b of [copyBtn, fewerBtn, moreBtn, cleanBtn, splitBtn, searchBtn, saveBtn, readingLensBtn]) {
    b.disabled = !tools;
  }
  // «تصدير لسابستاك» ظاهر دائمًا كما في Figma، ويعمل لنتيجة وجهتها سابستاك وحدها:
  // حذف الأسطر الفارغة عند التصدير يُفسد فقرات بقية المستويات والمنصات
  exportBtn.disabled = !tools || !metaSubstackFace();
  // «إضافة سطور فارغة» تعمل على الأصل قبل أي نتيجة (مواصفة المالك) — فيكفيها نصّ
  addBlankBtn.disabled = busy || !(hasText || hasResult);
  undoBtn.disabled = busy || outputUndoStack.length === 0;
  variationsBtn.disabled = busy || !hasText || (variationsGenerating() && !variationInputsCurrent());
  if (!tools) {
    if (outputSearch.isOpen()) outputSearch.close();
    if (!readingLensOverlay.hidden) closeReadingLens();
  }
  // «أعد المحاولة» لا تُنقر ونداء آخر يكتب على النتيجة
  for (const b of document.querySelectorAll("#nasaq-error [data-error-action], #nasaq-error-source [data-error-action]")) {
    b.disabled = busy;
  }

  // الإعدادات تُقرأ لحظة النداء — معطّلة ما دام النداء جاريًا (Figma 98:400)
  for (const b of document.querySelectorAll("#settings-content .dd-btn")) b.disabled = busy;
  directivesInput.disabled = busy;

  // عمود النتيجة: هيكل نائب أثناء التنسيق، والنتيجة، أو حالة البداية
  loading.hidden = !busy;
  outputText.hidden = busy;
  outputPlaceholder.hidden = hasResult || busy || state === "error";

  // المراجعة: بطاقتا المنعطف — المحددة ما تعرضه النتيجة، والمعتمدة ما قرره الكاتب
  fragmentCard.hidden = !fragmentForms || busy;
  if (fragmentForms) {
    for (const which of ["broken", "joined"]) {
      const form = fragmentForms[which];
      const accepted = Boolean(turnDecision && turnDecision.which === which);
      const selected = !accepted && outputText.textContent === form;
      el(`turn-card-${which}`).dataset.state = accepted ? "accepted" : selected ? "selected" : "undecided";
      const tag = el(`turn-tag-${which}`);
      tag.dataset.tone = accepted ? "module" : "neutral";
      tag.querySelector(".tag-label").textContent = accepted
        ? "معتمدة"
        : countLabel(form.replace(/\n+$/, "").split("\n").length, ["سطر واحد", "سطران", "أسطر", "سطرًا", "سطر"]);
      el(`adopt-${which}`).hidden = accepted;
      el(`revert-${which}`).hidden = !accepted;
      el(`revert-${which}`).disabled = busy;
    }
  }

  // التقرير مطويّ ما دام فارغًا، ومفتوح حين يصل محتواه أو أثناء التنسيق (هيكله
  // النائب)، ويغيب في المراجعة إن لم يكن فيه شيء (Figma 98:318). الفتح والطي عند
  // تغيّر الحالة أو المحتوى فقط — فيبقى اختيار الكاتب اليدوي بينهما
  const reportHasContent = !notesBox.hidden || !rhythmFingerprint.hidden;
  rhythmBox.hidden = rhythmFingerprint.hidden;
  reportSkeleton.hidden = !busy;
  reportSection.hidden = state === "review" && !reportHasContent;
  if (transition || reportHasContent !== reportHadContent) {
    reportHeader.setAttribute("aria-expanded", String(busy || reportHasContent));
  }
  if (transition && (state === "review" || renderedState === "review")) {
    settingsHeader.setAttribute("aria-expanded", String(state !== "review"));
  }

  // شريط الحالة: مؤشر الحالة، وعدّاد النتيجة ما دامت النتيجة هي المعروضة
  nasaqStatus.dataset.status = state;
  nasaqStatusLabel.textContent = STATUS_LABELS[state];
  outputCount.hidden = !(state === "result" || state === "review");

  // التعطيل يُسقط التركيز إلى الصفحة: بعد النداء يعود إلى حيث كان إن بقي صالحًا
  if (!busy && renderedState === "processing") {
    const target = focusBeforeBusy;
    focusBeforeBusy = null;
    if (target && target.isConnected && !target.disabled && target.offsetParent !== null && document.activeElement === document.body) target.focus();
  }

  renderedState = state;
  reportHadContent = reportHasContent;
}

// ---------- اختصارات قوائم «تنسيق» و«تحرير» و«ملف» (Figma 265:1299) ----------
// تعمل داخل النافذة حتى يصلها شريط القوائم في المرحلة ٦. كل اختصار قرين زره:
// لا يعمل في وحدة أخرى، ولا والزر معطّل أو مخفي بحالته، ولا تحت ورقة مفتوحة —
// والزر المطويّ في «المزيد» يبقى اختصاره عاملًا
const editable = (node) => Boolean(node && node.closest && node.closest("input, textarea, [contenteditable='true']"));
// أوامر نَسَق في الشريط الأصلي (المرحلة ٧-ب): كل واحد بمعرّفه كما في مواصفة
// `menu.rs`، وزرّه مصدرَ حالته — فلا يُكتب التعطيل مرتين، ولا يبقى مستمع
// `keydown` لأمر صار له مسرّع
for (const [id, run, button] of [
  ["format.variations", showVariations, variationsBtn],
  ["format.clean-empty-lines", cleanEmptyLines, cleanBtn],
  ["format.add-blank-lines", addBlankLines, addBlankBtn],
  ["format.break-after-period", splitSentences, splitBtn],
  ["format.fewer-lines", () => adjustLines("fewer"), fewerBtn],
  ["format.more-lines", () => adjustLines("more"), moreBtn],
  ["format.reading-lens", openReadingLens, readingLensBtn],
  ["edit.export-substack", () => exportBtn.click(), exportBtn],
  ["file.save-draft", () => saveBtn.click(), saveBtn],
  ["edit.find.open", () => outputSearch.open(), searchBtn],
]) {
  window.NasaqMenu.register(id, run, { button });
}
// «نسخ النتيجة» أمرٌ واحد باسمين كالفعل الرئيس، فيُسجَّل باسم برجه
window.NasaqMenu.register("edit.copy-result", () => copyBtn.click(), { button: copyBtn, owner: "nasaq" });

// «جلسة جديدة ⌘N»: نصٌّ فارغ وجلسة مصفّرة. الاستئذان من القشرة، والمسح هنا —
// فهي وحدها تعرف ما تملكه من نتيجة وتقرير وتراجع
window.NasaqMenu.register(
  "file.new-session",
  () =>
    // الخانة تفرّغها القشرة — وهذا تصفير ما يملكه نَسَق: نتيجة وتقرير وتراجع
    window.NasaqShell.confirmNewSession(() => {
      // الإذن أُعطي: يُمحى ما لم يُحفظ، ومعه صيغ النصوص السابقة المنتظرة
      heldVersions = [];
      setOutput("");
      outputUndoStack = [];
      lastFormatMeta = null;
      notesBox.hidden = true;
      showRhythmFingerprint(null);
      syncResultTools();
      renderState();
    }, { unsaved: () => heldVersions.length > 0 || [...sessionVersions.values()].some((v) => !v.saved) }),
  { owner: "nasaq" }
);

// وتراجع النتيجة وحده يبقى مستمعًا: «تراجع ⌘Z» في «تحرير» عنصر نظامٍ يتراجع
// عن الكتابة داخل الحقول، ولا معرّف في اللوحة لتراجع النتيجة خارجها
document.addEventListener("keydown", (e) => {
  if (!e.metaKey || e.shiftKey || e.altKey || e.ctrlKey || e.code !== "KeyZ") return;
  if (window.NasaqWindow.isModalOpen() || editable(e.target)) return;
  // زر «نسّق» لا يُطوى أبدًا: غيابه يعني أن وحدة أخرى تملأ الواجهة
  if (formatBtn.offsetParent === null || undoBtn.hidden || undoBtn.disabled) return;
  e.preventDefault();
  undoOutput();
});

updateCount(inputCount, inputText.value, { withLines: false });
renderState();
