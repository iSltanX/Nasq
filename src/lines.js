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

// [فصل الجمل] محلي حتمي بلا نموذج: يكسر السطر بعد كل نقطة تنهي جملة، ويتجاهل
// النقطة العشرية بين رقمين (كـ 3.14 — لا كسر) وتتابع النقاط (كـ "..." ellipsis
// بثلاث نقاط لاتينية — ليست نهاية جملة، لا كسر). يستهلك الفراغ التالي للنقطة
// فينتج كسرًا واحدًا نظيفًا، ولا يكرر الكسر إن وُجد سطر جديد أصلًا (حتمي:
// نفس المدخل يعيد نفس المخرج دائمًا، وتطبيقه مرتين لا يغيّر الناتج)
const DIGIT_RE = /[0-9٠-٩]/;

function splitSentencesLocal(text) {
  let out = "";
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    out += ch;
    if (ch === ".") {
      const prev = text[i - 1];
      const rawNext = text[i + 1];
      let j = i + 1;
      while (text[j] === " ") j++;
      const next = text[j];
      const isDecimal = Boolean(prev) && DIGIT_RE.test(prev) && Boolean(next) && DIGIT_RE.test(next);
      const isDotRun = prev === "." || rawNext === "."; // تتابع نقاط — ليست نهاية جملة
      if (!isDecimal && !isDotRun) {
        if (next !== undefined && next !== "\n") out += "\n";
        i = j;
        continue;
      }
    }
    i++;
  }
  return out;
}

const NasaqLines = { fewerLinesLocal, moreLinesLocal, splitSentencesLocal };

if (typeof module !== "undefined" && module.exports) module.exports = NasaqLines;
if (typeof window !== "undefined") window.NasaqLines = NasaqLines;
