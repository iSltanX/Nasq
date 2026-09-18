// اختبار الإجهاد (فحص m3) — يشغّل كل دالة نقية في lines.js وprune.js وfragments.js
// وsubstack-markers.js وdrafts-model.js على فيلق حالات صعبة (فراغ، رموز مركّبة،
// علامات اتجاه، فواصل أسطر غريبة، نصوص ضخمة...) ويتحقق من: عدم الانكسار،
// عدم تغيّر الكلمات حيث يعد التعليق بذلك، الحتمية حيث يعد التعليق بها،
// عدم توليد نصف زوج بديل (surrogate يتيم)، والزمن على الحالات الكبيرة.
// كل تركيبة (دالة × حالة) اختبارٌ مستقل — فانكسار حالة واحدة لا يعمي عن الباقي.
// عيوبٌ موثّقة (لا تُصلَح هنا — فحص m3 يقرّرها الجلسة الرئيسية) تُعلَّم بـ
// { todo: "m3: ..." } فيبقى `npm test` أخضر.
const test = require("node:test");
const assert = require("node:assert");
const { performance } = require("node:perf_hooks");

const { fewerLinesLocal, moreLinesLocal, splitSentencesLocal, addBlankLinesLocal } = require("../src/lines.js");
const { applyCuts, tidyAfterCut, verifySubset } = require("../src/prune.js");
const { findTurn, breakAtTurn, joinAtTurn, turnForms } = require("../src/fragments.js");
const { stripSubstackMarkers } = require("../src/substack-markers.js");
const { draftKey, draftExcerpt, migrateDrafts } = require("../src/drafts-model.js");

const smallCases = require("./fixtures/stress-corpus.json");

// ---------- توليد الحالات الكبيرة (بالكود لا في JSON — تجنّبًا لتضخيمه) ----------

// ٥٠ ألف محرف عربي في فقرات طبيعية: جمل قصيرة، ترقيم متنوع، فقرات مفصولة
function buildArabic50k() {
  const words = [
    "الحنين", "لا", "يعود", "إلى", "الأماكن", "بل", "إلى", "أنفسنا", "التي",
    "تركناها", "هناك", "وهذا", "معنى", "عميق", "في", "نهاية", "الأمر", "قال",
    "الحكيم", "إن", "الصمت", "أبلغ", "من", "الكلام", "أحيانًا", "وغادر", "الجميع",
  ];
  let out = "";
  let wi = 0;
  let paragraph = "";
  let sentenceLen = 0;
  while (out.length < 50000) {
    const w = words[wi % words.length];
    wi++;
    paragraph += (paragraph ? " " : "") + w;
    sentenceLen++;
    if (sentenceLen >= 8) {
      paragraph += wi % 3 === 0 ? "؟" : wi % 3 === 1 ? "." : "!";
      sentenceLen = 0;
    }
    if (paragraph.length > 400) {
      out += paragraph + "\n\n";
      paragraph = "";
    }
  }
  if (paragraph) out += paragraph;
  return out.slice(0, 50000);
}

// سطر واحد بلا سطر جديد وبلا ترقيم — كلمات عربية مفصولة بمسافات فقط
function buildLine20kNoPunct() {
  const words = ["كلمة", "أخرى", "نص", "طويل", "بلا", "ترقيم", "يتكرر", "هنا"];
  let out = "";
  let wi = 0;
  while (out.length < 20000) {
    out += (out ? " " : "") + words[wi % words.length];
    wi++;
  }
  return out.slice(0, 20000);
}

// سطر واحد بلا أي مسافة إطلاقًا — تتابع أحرف عربية متصل (كلمة واحدة ضخمة)
function buildLine20kNoSpaces() {
  const letters = "أبتثجحخدذرزسشصضطظعغفقكلمنهوي";
  let out = "";
  let i = 0;
  while (out.length < 20000) {
    out += letters[i % letters.length];
    i++;
  }
  return out.slice(0, 20000);
}

const bigCases = {
  arabic50k: buildArabic50k(),
  line20kNoPunct: buildLine20kNoPunct(),
  line20kNoSpaces: buildLine20kNoSpaces(),
};

const cases = { ...smallCases, ...bigCases };
const bigCaseNames = new Set(Object.keys(bigCases));

// ---------- أدوات مساعدة ----------

// تتابع الكلمات (تقسيم على أي فراغ) — لمقارنة «لا كلمة أُضيفت ولا أُعيد ترتيبها»
function words(text) {
  return String(text).split(/\s+/u).filter(Boolean);
}

function sameWords(a, b) {
  const wa = words(a);
  const wb = words(b);
  if (wa.length !== wb.length) return false;
  for (let i = 0; i < wa.length; i++) if (wa[i] !== wb[i]) return false;
  return true;
}

// عدد أنصاف الأزواج البديلة (surrogate) اليتيمة في نص
function loneSurrogateCount(s) {
  const str = String(s);
  let count = 0;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = str.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) count++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      const prev = str.charCodeAt(i - 1);
      if (!(prev >= 0xd800 && prev <= 0xdbff)) count++;
    }
  }
  return count;
}

// اقتباس مأخوذ حرفيًا من منتصف النص لتغذية applyCuts، محاذًى لحدود الكلمات
// (بمسافة) قدر الإمكان — حتى لا يكون فشل verifySubset أثرًا زائفًا لقصّ
// اختبارنا نفسه في وسط كلمة. نص بلا أي فراغ (كلمة واحدة ضخمة) لا قصّ له هنا:
// أي حذف جزئي من كلمة واحدة متصلة يُنتج بالضرورة «كلمة» جديدة مختلفة تحت مقياس
// التقسيم بالفراغ — ملاحظة حدّية موثّقة لا عيب في المصدر (انظر تقرير m3)
function pickCut(text) {
  if (!text.trim()) return null;
  if (words(text).length < 2) return null;
  const mid = Math.floor(text.length / 2);
  let start = mid;
  while (start > 0 && !/\s/.test(text[start - 1])) start--;
  let end = start;
  let count = 0;
  while (end < text.length && count < 2) {
    while (end < text.length && !/\s/.test(text[end])) end++;
    count++;
    while (end < text.length && /\s/.test(text[end])) end++;
  }
  const cut = text.slice(start, end).replace(/\s+$/, "");
  return cut || null;
}

const TIME_BOUND_MS = 50;
// كل قياسات الدوال الأربع/الثلاث... على الحالات الكبيرة — تخضع لحد الـ 50ms
const timingReport = [];
// قياسات إضافية (أسوأ حالة لـ verifySubset) — تُطبع لكن بلا حد الـ 50ms
const extraTimings = [];

function timeCall(label, caseName, fn) {
  const t0 = performance.now();
  const result = fn();
  const ms = performance.now() - t0;
  if (bigCaseNames.has(caseName)) {
    timingReport.push({ label, caseName, ms: Number(ms.toFixed(3)) });
  }
  return { result, ms };
}

// تركيبات معروفة كعيوب موثّقة سلفًا (من تشغيل فعلي) — تُعلَّم todo بدل الفشل
// الصامت أو إيقاف بقية الحالات
// (أُصلح العيبان الوحيدان في m3 — علامة الإغلاق بعد الختم — وحارسهما في lines.test.js)
const KNOWN_WORD_DEFECTS = new Set([]);

// ---------- lines.js: كل دالة × كل حالة، اختبار مستقل لكل تركيبة ----------

const LINES_FNS = { fewerLinesLocal, moreLinesLocal, splitSentencesLocal, addBlankLinesLocal };

for (const [fnName, fn] of Object.entries(LINES_FNS)) {
  for (const [caseName, input] of Object.entries(cases)) {
    const key = `${fnName}|${caseName}`;
    const isKnownDefect = KNOWN_WORD_DEFECTS.has(key);
    const opts = isKnownDefect
      ? { todo: `m3: ${fnName} يغيّر تجزئة الكلمات على «${caseName}» — راجع lines.js:88-104 (الكسر قبل علامة الإغلاق)` }
      : {};

    test(`lines.js/${fnName}/${caseName}`, opts, () => {
      const before = loneSurrogateCount(input);
      const { result: out } = timeCall(fnName, caseName, () => fn(input));

      assert.ok(
        sameWords(out, input),
        `تغيّرت الكلمات: ${JSON.stringify(words(input)).slice(0, 150)} → ${JSON.stringify(words(out)).slice(0, 150)}`
      );

      const after = loneSurrogateCount(out);
      assert.ok(after <= before, `surrogate يتيم جديد (قبل ${before} بعد ${after})`);
    });
  }
}

test("lines.js: الحتمية المعلَنة — splitSentencesLocal وaddBlankLinesLocal مرتان = مرة، عبر كل الحالات", () => {
  for (const [name, input] of Object.entries(cases)) {
    const s1 = splitSentencesLocal(input);
    const s2 = splitSentencesLocal(s1);
    assert.strictEqual(s2, s1, `splitSentencesLocal ليست حتمية على «${name}»`);

    const b1 = addBlankLinesLocal(input);
    const b2 = addBlankLinesLocal(b1);
    assert.strictEqual(b2, b1, `addBlankLinesLocal ليست حتمية على «${name}»`);
  }
});

test("lines.js: تقرير — splitSentencesLocal على اقتباس منتهٍ بـ «» وعلى جملة بين قوسين", () => {
  // تسجيل غير مشروط لما يخرج فعلًا (فُحص بالتشغيل، لا افتراض مسبق)
  const q1 = "قال: «انتهى.» ثم مضى";
  const out1 = splitSentencesLocal(q1);
  console.log("stress: splitSentencesLocal(%s) = %s", JSON.stringify(q1), JSON.stringify(out1));

  const q2 = "(انتهى.) ثم";
  const out2 = splitSentencesLocal(q2);
  console.log("stress: splitSentencesLocal(%s) = %s", JSON.stringify(q2), JSON.stringify(out2));

  // الملاحظة: علامة الإغلاق (» أو )) تصير أول محرف في سطر جديد وحدها —
  // الكسر يقع بين النقطة وعلامة الإغلاق المباشرة لا بعد الإغلاق (راجع الاختبار
  // المعلَّم todo أعلاه لمرجعية الملف والسطر)
  assert.doesNotThrow(() => splitSentencesLocal(q1));
  assert.doesNotThrow(() => splitSentencesLocal(q2));
});

// ---------- prune.js: applyCuts ← tidyAfterCut ← verifySubset، اختبار مستقل لكل حالة ----------

for (const [caseName, input] of Object.entries(cases)) {
  test(`prune.js/pipeline/${caseName}`, () => {
    const cut = pickCut(input);
    const cuts = cut ? [{ quote: cut }] : [];

    const { result: applyResult } = timeCall("applyCuts", caseName, () => applyCuts(input, cuts));
    const { result: tidied } = timeCall("tidyAfterCut", caseName, () => tidyAfterCut(applyResult.text));
    const { result: verify } = timeCall("verifySubset", caseName, () => verifySubset(input, tidied));

    assert.ok(
      verify.ok,
      `الشهادة فشلت بعد قص+ترتيب: أُضيف ${JSON.stringify(verify.addedWords).slice(0, 200)}`
    );

    // tidyAfterCut حتمية معلَنة: tidy(tidy(x)) === tidy(x)
    assert.strictEqual(tidyAfterCut(tidied), tidied, "tidyAfterCut ليست حتمية");

    const before = loneSurrogateCount(input);
    assert.ok(loneSurrogateCount(applyResult.text) <= before, "applyCuts أنتج surrogate يتيمًا");
    assert.ok(loneSurrogateCount(tidied) <= before, "tidyAfterCut أنتج surrogate يتيمًا");
  });
}

test("prune.js: أسوأ حالة لـ verifySubset — 8000 كلمة أصلية مقابل 8000 كلمة كلها غير موجودة", () => {
  const original = Array.from({ length: 8000 }, (_, i) => `word${String(i).padStart(4, "0")}`).join(" ");
  const pruned = Array.from({ length: 8000 }, (_, i) => `xword${String(i).padStart(4, "0")}`).join(" ");

  const t0 = performance.now();
  const { ok, addedWords } = verifySubset(original, pruned);
  const ms = performance.now() - t0;
  extraTimings.push({ label: "verifySubset(worst-case 8000×8000, no matches)", caseName: "-", ms: Number(ms.toFixed(3)) });
  console.log("stress: verifySubset worst-case 8000x8000 took %s ms", ms.toFixed(3));

  assert.strictEqual(ok, false);
  assert.strictEqual(addedWords.length, 8000);
  // حد سخي حتى لا يُعلَّق الاختبار عمليًا؛ الزمن الفعلي يُطبع للتقرير أعلاه
  assert.ok(ms < 5000, `verifySubset استغرقت ${ms.toFixed(1)}ms في أسوأ حالة`);
});

// ---------- fragments.js: كل دالة × كل حالة ----------

for (const [caseName, input] of Object.entries(cases)) {
  test(`fragments.js/${caseName}`, () => {
    const before = loneSurrogateCount(input);

    const { result: turn } = timeCall("findTurn", caseName, () => findTurn(input));
    void turn;

    const { result: broken } = timeCall("breakAtTurn", caseName, () => breakAtTurn(input));
    assert.ok(sameWords(broken, input), "breakAtTurn غيّر الكلمات");

    const { result: joined } = timeCall("joinAtTurn", caseName, () => joinAtTurn(input));
    assert.ok(sameWords(joined, input), "joinAtTurn غيّر الكلمات");

    timeCall("turnForms", caseName, () => turnForms(input));

    assert.ok(loneSurrogateCount(broken) <= before, "breakAtTurn أنتج surrogate يتيمًا");
    assert.ok(loneSurrogateCount(joined) <= before, "joinAtTurn أنتج surrogate يتيمًا");
  });
}

// ---------- substack-markers.js: كل حالة ----------

for (const [caseName, input] of Object.entries(cases)) {
  test(`substack-markers.js/${caseName}`, () => {
    const before = loneSurrogateCount(input);
    const { result: out } = timeCall("stripSubstackMarkers", caseName, () => stripSubstackMarkers(input));
    assert.ok(loneSurrogateCount(out) <= before, "stripSubstackMarkers أنتج surrogate يتيمًا");
  });
}

// ---------- drafts-model.js: migrateDrafts وdraftKey وdraftExcerpt، كل حالة ----------

for (const [caseName, input] of Object.entries(cases)) {
  test(`drafts-model.js/${caseName}`, () => {
    const list = [
      {
        id: 1,
        original: input,
        formatted: input,
        style: "اختبار",
        intervention: "اختبار",
        platform: null,
        createdAt: "2026-01-01T00:00:00Z",
      },
    ];

    const { result: migrated } = timeCall("migrateDrafts", caseName, () => migrateDrafts(list));
    // مدخل بلا نصّ أصلي ولا منسّق (بعد التطبيع) ليس مسودة — يُتخطى بتصميم
    // migrateDrafts (drafts-model.js:73)؛ غير ذلك يُنتج أمًّا واحدة بلا مساس بـ original
    const expectMother = String(input).trim() !== "";
    assert.strictEqual(migrated.mothers.length, expectMother ? 1 : 0, "عدد الأمّهات غير متوقَّع");
    if (expectMother) {
      assert.strictEqual(migrated.mothers[0].original, input, "migrateDrafts مسّ original");
    }

    const { result: key } = timeCall("draftKey", caseName, () => draftKey(input));
    const { result: excerpt } = timeCall("draftExcerpt", caseName, () => draftExcerpt(input));

    // draftKey مستقرة على مخرجها (بديهي: regex + trim على نتيجة مطبَّعة أصلًا)
    assert.strictEqual(draftKey(key), key, "draftKey ليست مستقرة على مخرجها");

    void excerpt; // مُقاس فقط — لا شرط شكل إضافي هنا خارج ما في drafts-model.test.js
  });
}

// ---------- الزمن على الحالات الكبيرة (٥٠ ألف / ٢٠ ألف) ----------

test("الزمن: كل دالة على الحالات الكبيرة تحت الحد السخي، والأرقام مطبوعة للتقرير", () => {
  console.log("\nstress timing report (ms) — big cases (bound %sms):", TIME_BOUND_MS);
  console.log("function".padEnd(22), "case".padEnd(18), "ms");
  for (const row of timingReport) {
    console.log(row.label.padEnd(22), row.caseName.padEnd(18), row.ms);
  }
  console.log("\nstress timing report (ms) — extra (no bound, informational):");
  for (const row of extraTimings) {
    console.log(row.label.padEnd(40), row.caseName.padEnd(6), row.ms);
  }

  const offenders = timingReport.filter((r) => r.ms >= TIME_BOUND_MS);
  for (const o of offenders) {
    console.log(`stress: SLOW — ${o.label} على ${o.caseName} استغرقت ${o.ms}ms (الحد ${TIME_BOUND_MS}ms)`);
  }
  assert.strictEqual(
    offenders.length,
    0,
    `دوال تجاوزت ${TIME_BOUND_MS}ms على حالة كبيرة: ${JSON.stringify(offenders)}`
  );
});
