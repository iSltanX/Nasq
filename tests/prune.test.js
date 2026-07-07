// اختبار مقص «شَذْب» النقي — يعمل بـ: npm test
// الوحدة بلا نموذج وبلا DOM: حذف حرفي، ترتيب آثار، وشهادة «لا كلمة أُضيفت»
const test = require("node:test");
const assert = require("node:assert");
const { applyCuts, tidyAfterCut, verifySubset, wordCores } = require("../src/prune.js");

// ---------- applyCuts ----------

test("القص الحرفي: اقتباس موجود يُحذف مرة واحدة فقط", () => {
  const { text, applied, skipped } = applyCuts("قالها مرة، ثم قالها مرة أخرى.", [{ quote: "قالها مرة" }]);
  assert.strictEqual(text, "، ثم قالها مرة أخرى.");
  assert.strictEqual(applied.length, 1);
  assert.strictEqual(skipped.length, 0);
});

test("القص بالظهور الثاني: occurrence يحدد أي ظهور يُقص", () => {
  const { text } = applyCuts("نعم ثم نعم ثم نعم", [{ quote: "نعم", occurrence: 2 }]);
  assert.strictEqual(text, "نعم ثم  ثم نعم");
});

test("اقتباس غير موجود حرفيًا لا يُطبَّق ويُبلَّغ عنه — لا مطابقة تقريبية", () => {
  const original = "الحنين لا يعود إلى الأماكن.";
  const { text, applied, skipped } = applyCuts(original, [
    { quote: "الحنين لا يعود الى الأماكن" }, // ألف بلا همزة — ليست في النص
    { quote: "غير موجود إطلاقًا" },
  ]);
  assert.strictEqual(text, original);
  assert.strictEqual(applied.length, 0);
  assert.strictEqual(skipped.length, 2);
});

test("قصّات متتابعة تعمل على النص المتطور، والقصّة نصًا خامًا مقبولة", () => {
  const { text } = applyCuts("واحد اثنان ثلاثة أربعة", ["اثنان ", "أربعة"]);
  assert.strictEqual(text, "واحد ثلاثة ");
});

test("قصّة بلا اقتباس (تالفة) تُتخطى بلا أثر", () => {
  const { text, skipped } = applyCuts("نص سليم", [null, {}, { occurrence: 3 }]);
  assert.strictEqual(text, "نص سليم");
  assert.strictEqual(skipped.length, 3);
});

// ---------- tidyAfterCut ----------

test("ترتيب الآثار: مسافة مضاعفة، مسافة قبل علامة، وعلامة مكررة باتصال قصّين", () => {
  assert.strictEqual(tidyAfterCut("بقيت  كلمة ، هنا"), "بقيت كلمة، هنا");
  assert.strictEqual(tidyAfterCut("أولى، ، ثانية"), "أولى، ثانية");
});

test("فاصلة تيتّمت في أول سطر تُحذف، والنقطة العارية (·) فاصل شذرات لا يُمس", () => {
  assert.strictEqual(tidyAfterCut("، بقية السطر"), "بقية السطر");
  assert.strictEqual(tidyAfterCut("شذرة أولى\n·\nشذرة ثانية"), "شذرة أولى\n·\nشذرة ثانية");
});

test("حذف سطر كامل لا يترك أكثر من سطر فارغ واحد", () => {
  assert.strictEqual(tidyAfterCut("فقرة أولى\n\n\n\nفقرة ثانية"), "فقرة أولى\n\nفقرة ثانية");
});

test("الترتيب حتمي ومتكرر التطبيق بأمان: tidy(tidy(x)) === tidy(x)", () => {
  const messy = "  أولى ، ، ثانية  \n\n\n، ثالثة .\n·\nرابعة  ";
  const once = tidyAfterCut(messy);
  assert.strictEqual(tidyAfterCut(once), once);
});

// ---------- verifySubset ----------

test("الشهادة تنجح: الحذف وحده يبقي الناتج تتابعًا من كلمات الأصل", () => {
  const original = "نحن لا نشتاق إلى البيت القديم، وإنما نشتاق إلى صورتنا فيه.";
  const pruned = "نحن لا نشتاق إلى البيت القديم.";
  assert.deepStrictEqual(verifySubset(original, pruned), { ok: true, addedWords: [] });
});

test("الشهادة تفشل عند إضافة كلمة، وتسمّي المضاف", () => {
  const { ok, addedWords } = verifySubset("الحنين لا يعود.", "الحنين الجارف لا يعود.");
  assert.strictEqual(ok, false);
  assert.deepStrictEqual(addedWords, ["الجارف"]);
});

test("الشهادة تفشل عند إعادة الترتيب — الترتيب جزء من العهد", () => {
  const { ok } = verifySubset("جاء أولًا ثم مضى", "مضى ثم جاء أولًا");
  assert.strictEqual(ok, false);
});

test("تغيّر علامات الوقف على أطراف الكلمات لا يسقط الشهادة (أثر tidy المشروع)", () => {
  const original = "بقيت الكلمة، هنا هناك.";
  const pruned = "بقيت الكلمة هنا هناك";
  assert.strictEqual(verifySubset(original, pruned).ok, true);
});

test("النص المطابق والناتج الفارغ كلاهما ناجح — الحذف الكامل حذف مشروع", () => {
  assert.strictEqual(verifySubset("نص كما هو", "نص كما هو").ok, true);
  assert.strictEqual(verifySubset("نص كما هو", "").ok, true);
});

test("نواة الكلمة تجرّد علامات الطرفين وتبقي الكلمة", () => {
  assert.deepStrictEqual(wordCores("«قالها»، — ثم· صمت..."), ["قالها", "ثم", "صمت"]);
});

// ---------- خط الأنابيب كاملًا ----------

test("قص ثم ترتيب ثم شهادة: العهد يصمد عبر الخط كله", () => {
  const original = "الحنين لا يعود إلى الأماكن، بل إلى أنفسنا التي تركناها هناك. وهذا هو معنى الحنين الحقيقي في نهاية الأمر.";
  const { text } = applyCuts(original, [{ quote: "وهذا هو معنى الحنين الحقيقي في نهاية الأمر." }]);
  const tidied = tidyAfterCut(text);
  assert.strictEqual(tidied, "الحنين لا يعود إلى الأماكن، بل إلى أنفسنا التي تركناها هناك.");
  assert.strictEqual(verifySubset(original, tidied).ok, true);
});
