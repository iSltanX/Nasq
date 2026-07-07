// خارج التطبيق (معاينة متصفح) تبقى الواجهة والأدوات المحلية تعمل، وتفشل أوامر النواة برسالة واضحة
const invoke = window.__TAURI__?.core?.invoke
  ?? (async () => { throw "هذه معاينة متصفح — التشغيل الكامل عبر التطبيق نفسه."; });

const el = (id) => document.getElementById(id);

const inputText = el("input-text");
const outputText = el("output-text");
const outputPlaceholder = el("output-placeholder");
const formatBtn = el("format-btn");
const copyBtn = el("copy-btn");
const loading = el("loading");
const errorBar = el("error-bar");
const notesBox = el("notes-box");
const notesList = el("notes-list");
const rhythmFingerprint = el("rhythm-fingerprint");
const toast = el("toast");
const inputCount = el("input-count");
const outputCount = el("output-count");

// ---------- عدّاد الأحرف ----------
function updateCount(node, text) {
  node.textContent = text.length ? `${text.length} حرفًا` : "";
}

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
// حرفيًا (main.rs يبني رسالة مطابقة بايتًا لما قبلها). قيمتها تُقرأ لحظة كل
// نداء وتُمرَّر للنداءات الإبداعية الثلاثة — تنسيق فقط، لا إعادة صياغة
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
// أي تعديل هنا يجب أن يطابق ثوابت main.rs حرفًا بحرف
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

// وجها سابستاك — التنويعات والتصدير وبطاقة الشذرة تُفعَّل لهما فقط
const SUBSTACK_ARTICLE = "مقال سابستاك";
const SUBSTACK_NOTE = "نوت سابستاك";
const isSubstackFace = (p) => p === SUBSTACK_ARTICLE || p === SUBSTACK_NOTE;

// خريطة سابستاك اليدوية: النموذج يضع رموز ++ / ** / --- داخل النص المعروض
// (main.rs يحقن العقد لغير الشذرة على وجهي سابستاك) — هذه الملاحظة تشرحها
// داخل «ملاحظات التنسيق» القائمة، بالشرط نفسه الذي يحقن به main.rs العقد
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
  } else if (level === LEVELS.RHYTHM) {
    interventionHint.textContent = "يوزّع النَّفَس والوقفات بعين كاتب";
  } else if (level === LEVELS.RHYTHM_DOTTED) {
    interventionHint.textContent = "يكسر عند وقفات الترقيم الحقيقية لا كل نقطة وفاصلة";
  } else {
    interventionHint.textContent = "";
  }
}

interventionSel.addEventListener("change", syncInterventionControls);
platformSel.addEventListener("change", syncInterventionControls);
syncInterventionControls();

// ---------- عرض الخطأ ----------
function showError(msg) {
  errorBar.textContent = msg;
  errorBar.hidden = false;
}

function clearError() {
  errorBar.hidden = true;
  errorBar.textContent = "";
}

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

  formatBtn.disabled = true;
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
    formatBtn.disabled = false;
    loading.hidden = true;
  }
}

formatBtn.addEventListener("click", formatText);

// اختصار ⌘+Enter
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !formatBtn.disabled) {
    formatText();
  }
});

// ---------- رسالة التنبيه ----------
let toastTimer = null;
function showToast(text) {
  toast.textContent = text;
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
  fewerBtn.disabled = busy;
  moreBtn.disabled = busy;
  loading.hidden = !busy;
}

// يعدّل كثافة أسطر النتيجة الحالية فقط — النص الأصلي في خانة الإدخال لا يُمسّ.
// خريطة سابستاك اليدوية إرشاد للعرض فقط: تُجرَّد قبل إرسال «الحالية» للنموذج
// (فلا يتعامل معها كنص يجب حفظه) وقبل المسار المحلي (فلا يُدمَج «++» مع
// سطر مجاور بالخطأ) — وجهة سابستاك تُعيد رموزًا جديدة على النتيجة المعدَّلة
// عبر عقد compose_rules نفسه، فلا يُفقَد الإرشاد إلا عند فشل الاتصال
async function adjustLines(direction) {
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
// حدود بالحرف للمنصات ذات السقف فقط — تقريبية عمدًا: إكس يزن بعض المحارف
// بمثلين لكن العربية تُحسب مفردة فالعدّ البسيط صادق للنص العربي.
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

// ---------- الإعدادات ----------
const overlay = el("settings-overlay");
const apiKeyInput = el("api-key");
const baseUrlInput = el("base-url");
const modelInput = el("model-name");
const settingsMsg = el("settings-msg");

// مزوّدات جاهزة — تملأ Base URL وModel Name فقط، ولا تمسّ المفتاح
const PROVIDERS = {
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    model: "gemini-2.5-flash",
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    model: "google/gemini-2.5-flash",
  },
};

const DEFAULTS = PROVIDERS.gemini;

function showSettingsMsg(text, isError) {
  settingsMsg.textContent = text;
  settingsMsg.classList.toggle("error", Boolean(isError));
  settingsMsg.hidden = false;
}

function closeSettings() {
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
for (const btn of document.querySelectorAll(".provider-btn")) {
  btn.addEventListener("click", () => {
    const p = PROVIDERS[btn.dataset.provider];
    if (!p) return;
    baseUrlInput.value = p.baseUrl;
    modelInput.value = p.model;
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
  if (!apiKey) {
    showSettingsMsg("أدخل مفتاح المزود أولًا.", true);
    return;
  }

  const baseUrl = baseUrlInput.value.trim() || DEFAULTS.baseUrl;
  const model = modelInput.value.trim() || DEFAULTS.model;
  baseUrlInput.value = baseUrl;
  modelInput.value = model;

  try {
    await invoke("save_settings", {
      settings: { apiKey, baseUrl, model },
    });
    showSettingsMsg("حُفظت الإعدادات محليًا.");
    setTimeout(closeSettings, 600);
  } catch (err) {
    showSettingsMsg(String(err), true);
  }
});

// ---------- تبويبات لوحة الإعدادات ----------
const tabGeneralBtn = el("tab-general-btn");
const tabAppearanceBtn = el("tab-appearance-btn");
const tabGeneral = el("tab-general");
const tabAppearance = el("tab-appearance");

function switchTab(name) {
  const general = name === "general";
  tabGeneral.hidden = !general;
  tabAppearance.hidden = general;
  tabGeneralBtn.classList.toggle("active", general);
  tabAppearanceBtn.classList.toggle("active", !general);
  tabGeneralBtn.setAttribute("aria-selected", String(general));
  tabAppearanceBtn.setAttribute("aria-selected", String(!general));
  settingsMsg.hidden = true;
}

tabGeneralBtn.addEventListener("click", () => switchTab("general"));
tabAppearanceBtn.addEventListener("click", () => switchTab("appearance"));

// ---------- الثيمات ----------
// المعرّفات لاتينية لأنها مفاتيح تقنية في CSS والتخزين، والأسماء المعروضة عربية.
// المعرّفات القديمة أبقيت كما هي حفاظًا على الاختيار المحفوظ، والعائلات الباردة
// استُبدلت بدافئة على صيغة المخطوطة (داكن دافئ + فاتح دافئ + معدن هادئ)
const THEMES = [
  { id: "dark", name: "نسق الداكن" },
  { id: "paper", name: "ورق دافئ" },
  { id: "ink", name: "حبر هادئ" },
  { id: "night", name: "برونز" },
  { id: "sand", name: "فضة دافئة" },
  { id: "ash", name: "لؤلؤ عتيق" },
];
const THEME_KEY = "nasaq-theme";

function currentTheme() {
  const t = document.documentElement.getAttribute("data-theme");
  return THEMES.some((x) => x.id === t) ? t : "dark";
}

function applyTheme(id) {
  document.documentElement.setAttribute("data-theme", id);
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    // تعذّر الحفظ لا يمنع تطبيق الثيم في الجلسة الحالية
  }
  renderThemeGrid();
}

function renderThemeGrid() {
  const grid = el("theme-grid");
  grid.innerHTML = "";
  const active = currentTheme();

  for (const t of THEMES) {
    const card = document.createElement("button");
    card.type = "button";
    // البطاقة تحمل data-theme الخاص بها فتعرض ألوان ثيمها الحقيقية كمعاينة حية
    card.className = "theme-card" + (t.id === active ? " active" : "");
    card.dataset.theme = t.id;
    card.setAttribute("aria-pressed", String(t.id === active));

    const name = document.createElement("span");
    name.className = "theme-name";
    name.textContent = t.name;
    if (t.id === active) {
      const check = document.createElement("span");
      check.className = "theme-check";
      check.textContent = "✓";
      name.appendChild(check);
    }

    const dots = document.createElement("span");
    dots.className = "theme-dots";
    for (const cls of ["dot-accent", "dot-raised", "dot-text"]) {
      const d = document.createElement("span");
      d.className = "dot " + cls;
      dots.appendChild(d);
    }

    card.append(name, dots);
    card.addEventListener("click", () => applyTheme(t.id));
    grid.appendChild(card);
  }
}

// قيمة محفوظة قديمة أو تالفة → العودة للافتراضي بهدوء
document.documentElement.setAttribute("data-theme", currentTheme());
renderThemeGrid();

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

// ---------- نوع الصيغة وترتيبه في العرض ----------
// النوع = المستوى، إلا تحت «تنسيق منصة» فالنوع هو المنصة نفسها
function versionType(v) {
  return v.intervention === LEVELS.PLATFORM && v.platform ? v.platform : (v.intervention || "غير محدد");
}

// ترتيب ثابت: المستويات ثم المنصات (تُعرض الأنواع المحفوظة فقط)
const TYPE_ORDER = [
  LEVELS.CLEAN,
  LEVELS.READ,
  LEVELS.RHYTHM,
  LEVELS.RHYTHM_DOTTED,
  LEVELS.PUBLISH,
  ...PLATFORMS,
];

function orderedTypes(mother) {
  const present = new Set(mother.versions.map(versionType));
  const known = TYPE_ORDER.filter((t) => present.has(t));
  // نوع قديم غير معروف (مسودة من إصدار سابق) يُلحق في الآخر ولا يُفقد
  const unknown = [...present].filter((t) => !TYPE_ORDER.includes(t));
  return [...known, ...unknown];
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
  restoreB.addEventListener("click", () => restoreDraft(mother, version));

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
      const versions = mother.versions.filter((v) => versionType(v) === type);
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
// كلها تحت الأمّ المطابقة بالمفتاح المطبَّع (تُنشأ إن لم توجد).
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

  // لقطة للتراجع إن فشل الحفظ — لا تبقى الذاكرة مخالفة للملف
  const snapshot = JSON.stringify(drafts);
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

  const existing = drafts.find((m) => m.key === sessionKey);
  if (existing) {
    existing.versions.push(...newVersions);
    // الأمّ ذات النشاط الأحدث تتصدر القائمة
    drafts = [existing, ...drafts.filter((m) => m.key !== sessionKey)];
  } else {
    drafts.unshift({
      key: sessionKey,
      original: sessionOriginal,
      createdAt: new Date().toISOString(),
      versions: newVersions,
    });
    if (drafts.length > DRAFTS_MAX) drafts.length = DRAFTS_MAX;
  }

  try {
    await persistDrafts();
    // خفض «متسخة» بعد نجاح الحفظ فقط — الخريطة تبقى، وما يُنتج بعدها يتجمع طبيعيًا
    for (const v of pending) v.saved = true;
    renderDrafts();
    showToast(`حُفظت ${versionsCountLabel(pending.length)}.`);
  } catch (err) {
    drafts = JSON.parse(snapshot);
    updateDraftsBadge();
    showError(String(err));
  }
});

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
  drafts = merged.mothers;
  if (drafts.length > DRAFTS_MAX) drafts.length = DRAFTS_MAX;
  try {
    await persistDrafts();
    renderDrafts();
    showToast(`استُوردت ${versionsCountLabel(merged.added)}.`);
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

// Escape يغلق اللوحة المفتوحة
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (!readingLensOverlay.hidden) closeReadingLens();
    else if (!variationsOverlay.hidden) closeVariations();
    else if (!draftsOverlay.hidden) closeDrafts();
    else if (!overlay.hidden) closeSettings();
  }
});

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
