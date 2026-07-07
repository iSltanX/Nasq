// مقص «شَذْب» — وحدة نقية أولية بلا DOM وبلا شبكة وبلا نموذج (المرحلة 2).
// هنا تُبنى الضمانة المعمارية التي سيقف عليها عهد «يحذف ولا يضيف» يوم
// يُبنى الوضع: رياضيات نصية بحتة تُختبر في Node مباشرة (tests/prune.test.js).
//
// خط الأنابيب المستقبلي: اقتباسات حذف من النموذج ← applyCuts (حذف حرفي
// لا اجتهاد فيه) ← tidyAfterCut (ترتيب آثار الحذف) ← verifySubset
// (الشهادة: لا كلمة أُضيفت — الناتج ⊂ الأصل كتتابع كلمات).

// ---------- applyCuts ----------
// يطبق قائمة قصّات على النص: كل قصّة { quote, occurrence } تحذف الظهور
// المحدد (الأول افتراضًا) من الاقتباس حرفيًا، وتقبل القصّة نصًا خامًا
// اختصارًا. الاقتباس غير الموجود حرفيًا لا يُطبَّق ويُبلَّغ عنه في skipped —
// لا مطابقة تقريبية ولا إصلاح: ما لم يقله النص حرفيًا لا يُقص، وهذا نصف
// الضمانة الأول. التطبيق تتابعي على النص المتطور، وكل قصّة تحذف مرة واحدة.
function applyCuts(text, cuts) {
  let out = String(text);
  const applied = [];
  const skipped = [];

  for (const cut of cuts || []) {
    const quote = typeof cut === "string" ? cut : cut && cut.quote;
    if (!quote) {
      skipped.push(cut);
      continue;
    }
    const occurrence = Math.max(1, (typeof cut === "object" && cut.occurrence) || 1);

    let index = -1;
    let from = 0;
    for (let n = 0; n < occurrence; n++) {
      index = out.indexOf(quote, from);
      if (index === -1) break;
      from = index + 1;
    }

    if (index === -1) {
      skipped.push(cut);
      continue;
    }
    out = out.slice(0, index) + out.slice(index + quote.length);
    applied.push(cut);
  }

  return { text: out, applied, skipped };
}

// ---------- tidyAfterCut ----------
// ترتيب آثار الحذف حتميًا — تنظيف لا تحويل: يحذف فراغات وعلامات وقفٍ
// يتّمها القص (مسافة مضاعفة، فاصلة يتيمة في أول سطر، علامة تكررت باتصال
// قصّين)، ولا يضيف محرف كلمة واحدًا — شرط verifySubset يبقى قائمًا بعده
// دائمًا. حتمي ومتكرر التطبيق بأمان: tidy(tidy(x)) === tidy(x)
function tidyAfterCut(text) {
  let t = String(text).replace(/\r\n?/g, "\n");

  // مسافات تضاعفت حول موضع القص داخل السطر
  t = t.replace(/[ \t]{2,}/g, " ");

  // علامة وقف تكررت باتصال قصّين: «، ،» أو «،،» → واحدة
  t = t.replace(/([،؛])(?:\s*\1)+/g, "$1");

  // لا مسافة قبل علامة الوقف (خلّفها حذف كلمة قبلها)
  t = t.replace(/ +([،؛:.؟!…])/g, "$1");

  // فاصلة أو فاصلة منقوطة تيتّمت في أول سطر بعد حذف ما قبلها — تُحذف
  // بفراغها (النقطة والنقاط لا تُمس: قد تكون فاصل شذرات مقصودًا)
  t = t.replace(/^[ \t]*[،؛]+[ \t]*/gm, "");

  // تشذيب أطراف الأسطر وضغط الفراغ الرأسي المتراكم عن حذف سطر كامل
  t = t
    .split("\n")
    .map((line) => line.trim())
    .join("\n");
  t = t.replace(/\n{3,}/g, "\n\n");

  return t.trim();
}

// ---------- verifySubset ----------
// شهادة العهد: كل كلمة في الناتج موجودة في الأصل وبترتيبها — الناتج ⊂
// الأصل كتتابع كلمات، فالإضافة وإعادة الترتيب كلتاهما تُسقطان التحقق.
// المقارنة على نواة الكلمة بعد تجريد علامات الوقف من طرفيها، لأن
// tidyAfterCut يحذف علامة عالقة دون مساس بالكلمة نفسها. يعيد
// { ok, addedWords }: كل كلمة تعذّر إيجادها بالترتيب تُعدّ مضافة —
// قاعدة «يحذف ولا يضيف» مفحوصة آليًا لا موعودة.
const EDGE_PUNCT_RE = /^[\s،؛:.؟!…«»"'()\[\]{}·—–\-]+|[\s،؛:.؟!…«»"'()\[\]{}·—–\-]+$/gu;

function wordCores(text) {
  return String(text)
    .split(/\s+/u)
    .map((w) => w.replace(EDGE_PUNCT_RE, ""))
    .filter(Boolean);
}

function verifySubset(original, pruned) {
  const source = wordCores(original);
  const target = wordCores(pruned);
  const addedWords = [];

  let cursor = 0;
  for (const word of target) {
    let found = -1;
    for (let j = cursor; j < source.length; j++) {
      if (source[j] === word) {
        found = j;
        break;
      }
    }
    if (found === -1) {
      addedWords.push(word);
    } else {
      cursor = found + 1;
    }
  }

  return { ok: addedWords.length === 0, addedWords };
}

const NasaqPrune = { applyCuts, tidyAfterCut, verifySubset, wordCores };

if (typeof module !== "undefined" && module.exports) module.exports = NasaqPrune;
if (typeof window !== "undefined") window.NasaqPrune = NasaqPrune;
