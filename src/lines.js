// أدوات الأسطر المحلية — دوال نقية بلا DOM وبلا شبكة.
// تُستخدم احتياطًا حين يتعذّر النموذج (أو مع نتيجة «تنظيف فقط» المحلية)،
// وتُختبر في Node مباشرة (tests/lines.test.js).
const MERGE_TARGET = 42; // الطول التقريبي للسطر عند «سطور أقل»
const SPLIT_MAX = 30;    // ما يتجاوز هذا الطول يُقسَّم عند «سطور أكثر»
const SPLIT_TARGET = 22; // الطول التقريبي للسطر عند «سطور أكثر»

// [⇤⇥] سطور أقل: يجمع الأسطر القصيرة داخل كل فقرة في أسطر أطول،
// دون تغيير أي كلمة أو علامة ترقيم، ودون دمج الفقرات
function fewerLinesLocal(text) {
  const paragraphs = text.split(/\n\s*\n+/).filter((p) => p.trim());
  const result = paragraphs.map((p) => {
    const words = p.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const w of words) {
      const candidate = line ? line + " " + w : w;
      if (line && candidate.length > MERGE_TARGET) {
        lines.push(line);
        line = w;
      } else {
        line = candidate;
      }
      // وقفة طبيعية بعد نهاية جملة إذا بلغ السطر طولًا معقولًا
      if (line.length >= MERGE_TARGET * 0.6 && /[.؟!…]$/.test(w)) {
        lines.push(line);
        line = "";
      }
    }
    if (line) lines.push(line);
    return lines.join("\n");
  });

  return result.join("\n\n");
}

// [⇥⇤] سطور أكثر: يقسم الأسطر الطويلة عند علامات الترقيم أولًا،
// ثم بعد عدد مناسب من الكلمات، دون كسر الكلمة الواحدة
function moreLinesLocal(text) {
  const result = text.split("\n").map((rawLine) => {
    const line = rawLine.trim();
    if (!line || line.length <= SPLIT_MAX) return line;

    // التقسيم عند علامات الترقيم مع بقائها في نهاية المقطع
    const segments = line.split(/(?<=[،؛:.؟!…])\s+/).filter(Boolean);
    const lines = [];
    for (const seg of segments) {
      if (seg.length <= SPLIT_MAX) {
        lines.push(seg);
        continue;
      }
      // مقطع طويل بلا ترقيم: تقسيم بعد عدد مناسب من الكلمات
      const words = seg.split(/\s+/).filter(Boolean);
      let cur = "";
      for (const w of words) {
        const candidate = cur ? cur + " " + w : w;
        if (cur && candidate.length > SPLIT_TARGET) {
          lines.push(cur);
          cur = w;
        } else {
          cur = candidate;
        }
      }
      if (cur) lines.push(cur);
    }
    return lines.join("\n");
  });

  return result.join("\n");
}

// [فصل الجمل] محلي حتمي بلا نموذج: يكسر السطر بعد كل علامة تنهي جملة —
// النقطة والاستفهام والتعجب وعلامة الحذف المفردة (…) — ويتجاهل النقطة
// العشرية بين رقمين (كـ 3.14 — لا كسر) وتتابع النقاط (كـ "..." ellipsis
// بثلاث نقاط لاتينية — ليست نهاية جملة، لا كسر). تتابع علامات الختم
// (كـ «؟!») يُكسر بعد آخره لا بينه. يستهلك الفراغ التالي للعلامة فينتج
// كسرًا واحدًا نظيفًا، ولا يكرر الكسر إن وُجد سطر جديد أصلًا (حتمي:
// نفس المدخل يعيد نفس المخرج دائمًا، وتطبيقه مرتين لا يغيّر الناتج)
const DIGIT_RE = /[0-9٠-٩]/;
const SENTENCE_END_RE = /[.؟!…]/;
const CLOSERS = "»›”’\"')]}";
const STRAIGHT_QUOTES = "\"'";
const opensNext = (text, k) => {
  if (!STRAIGHT_QUOTES.includes(text[k])) return false;
  const after = text[k + 1];
  return after !== undefined && !/\s/.test(after) && !CLOSERS.includes(after) && !SENTENCE_END_RE.test(after);
};

function splitSentencesLocal(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    out += ch;
    if (SENTENCE_END_RE.test(ch)) {
      const prev = text[i - 1];
      const rawNext = text[i + 1];
      let j = i + 1;
      while (text[j] === " ") j++;
      const next = text[j];
      // استثناءا النقطة وحدها: العشرية بين رقمين، وتتابع النقاط (...)
      const isDecimal =
        ch === "." && Boolean(prev) && DIGIT_RE.test(prev) && Boolean(next) && DIGIT_RE.test(next);
      const isDotRun = ch === "." && (prev === "." || rawNext === ".");
      // علامة يليها ختمٌ آخر مباشرةً («؟!») — الكسر بعد آخر الركب لا بينه
      const endsRun = Boolean(rawNext) && SENTENCE_END_RE.test(rawNext);
      if (!isDecimal && !isDotRun && !endsRun) {
        // علامة إغلاقٍ تلي الختم مباشرةً تبقى معه في سطره: «انتهى.» ثم،
        // لا «انتهى.⏎» — فلا يبدأ سطرٌ بقوسٍ أو علامة تنصيص يتيمة (فحص m3)
        // والتنصيص المستقيم (" و') لا اتجاه له: هو إغلاقٌ إن تلاه فراغٌ أو
        // نهايةٌ أو إغلاقٌ آخر أو ختم، وإلا فهو فتحُ الجملة التالية فيبقى لها
        let k = i + 1;
        while (k < text.length && CLOSERS.includes(text[k]) && !opensNext(text, k)) out += text[k++];
        // ختمٌ بعد الإغلاق («حقًّا؟»!) يبقى في السطر نفسه، والكسر بعده
        if (SENTENCE_END_RE.test(text[k] || "")) {
          i = k;
          continue;
        }
        let m = k;
        while (text[m] === " ") m++;
        // والسطر القائم بـ \r\n سطرٌ قائم، فلا يُضاف قبله كسرٌ ثانٍ
        if (text[m] !== undefined && text[m] !== "\n" && text[m] !== "\r") out += "\n";
        i = m;
        continue;
      }
    }
    i++;
  }
  return out;
}

// [إضافة سطور فارغة]: سطرٌ فارغ واحد بين كل سطرين نصّيين، والفارغ القائم يبقى
// واحدًا — فتكرار الضغط لا يضاعف شيئًا. لا تتغيّر كلمة ولا ترتيب: الأسطر
// النصية كما هي، والسطر المكوّن من مسافات وحدها يُعدّ فارغًا
function addBlankLinesLocal(text) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter((line) => line.trim())
    .join("\n\n");
}

const NasaqLines = { fewerLinesLocal, moreLinesLocal, splitSentencesLocal, addBlankLinesLocal };

if (typeof module !== "undefined" && module.exports) module.exports = NasaqLines;
if (typeof window !== "undefined") window.NasaqLines = NasaqLines;
