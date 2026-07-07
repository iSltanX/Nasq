// اختبارات بطاقة الشذرة — التحوّلات التخطيطية النقية في src/fragments.js
const test = require("node:test");
const assert = require("node:assert");
const { findTurn, breakAtTurn, joinAtTurn, turnForms } = require("../src/fragments.js");

// الكلمات نفسها بلا زيادة ولا نقصان — مقارنة بعد إسقاط كل الفراغ
const words = (t) => t.replace(/\s+/g, " ").trim();

test("الكسر قبل «لكن»: كسر واحد لأول منعطف ولا محرف مضاف", () => {
  const src = "أردت الرحيل لكن القلب تعلّق بالمكان";
  const broken = breakAtTurn(src);
  assert.strictEqual(broken, "أردت الرحيل\nلكن القلب تعلّق بالمكان");
  assert.strictEqual(words(broken), words(src));
});

test("الكسر قبل «بل» و«غير أن» و«ولكن»", () => {
  assert.strictEqual(breakAtTurn("ما جئت زائرًا بل مقيمًا هنا"), "ما جئت زائرًا\nبل مقيمًا هنا");
  assert.strictEqual(
    breakAtTurn("وعدوا بالكثير غير أن الأيام خذلتهم"),
    "وعدوا بالكثير\nغير أن الأيام خذلتهم"
  );
  assert.strictEqual(breakAtTurn("سرت طويلًا ولكن الطريق لم ينته"), "سرت طويلًا\nولكن الطريق لم ينته");
});

test("النقطتان: الكسر بعدهما لا قبلهما", () => {
  assert.strictEqual(breakAtTurn("قال الحكيم: الصمت أبلغ"), "قال الحكيم:\nالصمت أبلغ");
});

test("الشرطة الموجودة أصلًا: الكسر قبلها", () => {
  assert.strictEqual(breakAtTurn("كل شيء تغيّر — إلا صوتها"), "كل شيء تغيّر\n— إلا صوتها");
});

test("كسر واحد لأول منعطف فقط وإن تعددت المنعطفات في السطر", () => {
  const broken = breakAtTurn("جاء متأخرًا لكن الباب مفتوح بل موارب");
  assert.strictEqual(broken.split("\n").length, 2);
  assert.ok(broken.startsWith("جاء متأخرًا\nلكن"));
});

test("سطر بلا منعطف يبقى كما هو، وturnForms تعيد null", () => {
  const src = "شذرة صافية بلا التفاتة";
  assert.strictEqual(breakAtTurn(src), src);
  assert.strictEqual(turnForms(src), null);
});

test("المنعطف في أول السطر ليس منعطفًا داخليًا — لا كسر", () => {
  const src = "لكن القلب لا يسمع";
  assert.strictEqual(breakAtTurn(src), src);
});

test("«لكن» وسط كلمة أخرى لا تُحسب منعطفًا", () => {
  const src = "أسكنه الله دار البركة والسكنى"; // لا «لكن» مستقلة هنا
  assert.strictEqual(breakAtTurn(src), src);
});

test("الوصل يدمج سطر المنعطف في سابقه بمسافة واحدة", () => {
  const joined = joinAtTurn("أردت الرحيل\nلكن القلب تعلّق");
  assert.strictEqual(joined, "أردت الرحيل لكن القلب تعلّق");
});

test("الوصل بعد نقطتين ختمتا السطر السابق", () => {
  assert.strictEqual(joinAtTurn("قال الحكيم:\nالصمت أبلغ"), "قال الحكيم: الصمت أبلغ");
});

test("لا وصل عبر سطر فارغ أو فاصل (·) — فذاك فاصل شذرات", () => {
  const multi = "شذرة أولى\n\nلكن هذه شذرة ثانية";
  assert.strictEqual(joinAtTurn(multi), multi);
  const dotted = "شذرة أولى\n·\nلكن هذه شذرة ثانية";
  assert.strictEqual(joinAtTurn(dotted), dotted);
});

test("الصورتان تحفظان الكلمات حرفًا بحرف والفرق كسر السطر وحده", () => {
  const src = "وقفت على الباب لكن اليد ترددت: أأدخل أم أعود";
  const forms = turnForms(src);
  assert.ok(forms);
  assert.notStrictEqual(forms.broken, forms.joined);
  assert.strictEqual(words(forms.broken), words(forms.joined));
  assert.strictEqual(words(forms.broken), words(src));
  // لا محرف جديد غير \n: بعد إسقاط الأسطر تتطابق الصورتان
  assert.strictEqual(forms.broken.replace(/\n/g, " "), forms.joined.replace(/\n/g, " "));
});

test("الذهاب والإياب مستقران: كسر الموصول ثم وصله يعيده", () => {
  const src = "أحببت المدينة لكن الغربة أثقل";
  const broken = breakAtTurn(src);
  assert.strictEqual(joinAtTurn(broken), src);
});
