// اختبار الاحتياط المحلي لزرّي «سطور أقل/أكثر» — يعمل بـ: node --test tests/
const test = require("node:test");
const assert = require("node:assert");
const { fewerLinesLocal, moreLinesLocal, splitSentencesLocal, addBlankLinesLocal } = require("../src/lines.js");

// الكلمات لا تتغير مهما تغيّر توزيع الأسطر — هذا عقد الأداة كلها
function words(text) {
  return text.split(/\s+/).filter(Boolean).join(" ");
}

test("سطور أقل: يدمج الأسطر القصيرة دون تغيير أي كلمة", () => {
  const input = "هذا سطر قصير\nوهذا سطر قصير آخر\nوثالث قصير أيضًا";
  const out = fewerLinesLocal(input);
  assert.strictEqual(words(out), words(input));
  assert.ok(out.split("\n").length < input.split("\n").length);
});

test("سطور أقل: لا يدمج الفقرات المفصولة بسطر فارغ", () => {
  const input = "فقرة أولى قصيرة\n\nفقرة ثانية قصيرة";
  const out = fewerLinesLocal(input);
  assert.ok(out.includes("\n\n"), "فاصل الفقرات يجب أن يبقى");
  assert.strictEqual(words(out), words(input));
});

test("سطور أكثر: يقسم السطر الطويل عند الترقيم دون تغيير أي كلمة", () => {
  const input =
    "جملة أولى طويلة نسبيًا تنتهي هنا، وجملة ثانية تكمل بعدها المسير إلى آخر السطر الطويل.";
  const out = moreLinesLocal(input);
  assert.strictEqual(words(out), words(input));
  assert.ok(out.split("\n").length > 1, "السطر الطويل يجب أن ينقسم");
});

test("سطور أكثر: السطر القصير يبقى كما هو", () => {
  const input = "سطر قصير";
  assert.strictEqual(moreLinesLocal(input), input);
});

test("الدالتان لا تمسّان علامات الترقيم", () => {
  const input = "أين المفر؟ لا مفر، غير أن الطريق طويل؛ فامشِ.";
  for (const fn of [fewerLinesLocal, moreLinesLocal]) {
    const out = fn(input);
    const punct = (s) => (s.match(/[،؛؟!….]/g) || []).join("");
    assert.strictEqual(punct(out), punct(input));
  }
});

// ---------- فصل الجمل ----------

test("فصل الجمل: يكسر بعد كل نقطة تنهي جملة، ولا يكسر النقطة العشرية", () => {
  const input = "وصلوا 3.14 مساءً. ثم غادروا.";
  const out = splitSentencesLocal(input);
  assert.strictEqual(out, "وصلوا 3.14 مساءً.\nثم غادروا.");
  assert.ok(out.includes("3.14"), "الرقم العشري يجب أن يبقى سليمًا بلا كسر داخله");
  assert.strictEqual(words(out), words(input));
});

test("فصل الجمل: لا يكسر نقطة عشرية بأرقام عربية-هندية", () => {
  const input = "الرقم ٣.١٤ ثابت. لا يتغير.";
  const out = splitSentencesLocal(input);
  assert.ok(out.includes("٣.١٤"), "الرقم العشري بأرقام عربية يجب أن يبقى سليمًا");
  assert.strictEqual(out.split("\n").length, 2);
});

test("فصل الجمل: حتمي — نفس المدخل يعيد نفس المخرج، وتكراره لا يضيف كسرًا مزدوجًا", () => {
  const input = "جملة أولى. جملة ثانية. جملة ثالثة.";
  const out1 = splitSentencesLocal(input);
  const out2 = splitSentencesLocal(input);
  assert.strictEqual(out1, out2);
  const out3 = splitSentencesLocal(out1);
  assert.strictEqual(out3, out1, "تطبيقه على نتيجة مكسورة أصلًا يجب أن يكون بلا أثر");
  assert.ok(!out1.includes("\n\n"), "لا سطر فارغ مضاعف");
});

test("فصل الجمل: يكسر بعد ؟ و! كما يكسر بعد النقطة", () => {
  const input = "نام الطفل؟ صرخ الديك! انتهى الأمر.";
  const out = splitSentencesLocal(input);
  assert.strictEqual(out, "نام الطفل؟\nصرخ الديك!\nانتهى الأمر.");
  assert.strictEqual(words(out), words(input));
  assert.strictEqual(splitSentencesLocal(out), out, "التطبيق الثاني بلا أثر");
});

test("فصل الجمل: تتابع علامات الختم (؟!) يُكسر بعد آخره لا بينه", () => {
  const input = "حقًا؟! نعم.";
  assert.strictEqual(splitSentencesLocal(input), "حقًا؟!\nنعم.");
});

test("فصل الجمل: علامة الحذف المفردة (…) تكسر، وتتابع النقاط (...) يبقى موصولًا", () => {
  const input = "انتظر… ثم اكمل... السير.";
  const out = splitSentencesLocal(input);
  assert.strictEqual(out, "انتظر…\nثم اكمل... السير.");
});

test("فصل الجمل: لا يمسّ تتابع النقاط (...)", () => {
  const input = "انتظر... ثم اكمل السير.";
  const out = splitSentencesLocal(input);
  assert.ok(out.includes("انتظر..."), "تتابع النقاط يجب أن يبقى كما هو دون كسر داخله");
  assert.strictEqual(words(out), words(input));
});

test("فصل الجمل: لا يغيّر الكلمات ولا الترقيم مهما تعدّدت الجمل", () => {
  const input = "الفصل الأول جيد. السعر 12.5 ريال. وداعًا.";
  const out = splitSentencesLocal(input);
  assert.strictEqual(words(out), words(input));
  const punct = (s) => (s.match(/[،؛؟!….]/g) || []).join("");
  assert.strictEqual(punct(out), punct(input));
  assert.strictEqual(out.split("\n").length, 3);
});

// «إضافة سطور فارغة» — مواصفة المالك (المرحلة ٩) بمثاله نفسه
test("إضافة سطور فارغة: سطر فارغ بين كل سطرين، بمثال المالك", () => {
  const before = "لم أنبّهها.\nزحف الضوء نحو حافّة الطاولة،\nوغطاء القلم بقي حيث تركته.";
  const after = "لم أنبّهها.\n\nزحف الضوء نحو حافّة الطاولة،\n\nوغطاء القلم بقي حيث تركته.";
  assert.strictEqual(addBlankLinesLocal(before), after);
});

test("إضافة سطور فارغة: الفارغ القائم يبقى واحدًا، والتكرار لا يضاعف", () => {
  const mixed = "أ\n\nب\nج\n\n\n\nد";
  const once = addBlankLinesLocal(mixed);
  assert.strictEqual(once, "أ\n\nب\n\nج\n\nد");
  assert.strictEqual(addBlankLinesLocal(once), once, "الضغطة الثانية غيّرت النص");
  // سطر المسافات وحدها فارغ، ولا فراغ في الطرفين
  assert.strictEqual(addBlankLinesLocal("\n  \nأ\n \t \nب\n\n"), "أ\n\nب");
});

test("إضافة سطور فارغة: لا كلمة ولا ترتيب يتغيّر، ولا يُمسّ نصّ السطر", () => {
  const input = "  سطرٌ بمسافة في أوله\r\nوآخر بعلامات: ١٬٥ … «اقتباس»؟!";
  const out = addBlankLinesLocal(input);
  assert.strictEqual(words(out), words(input));
  assert.strictEqual(out, "  سطرٌ بمسافة في أوله\n\nوآخر بعلامات: ١٬٥ … «اقتباس»؟!");
  assert.strictEqual(addBlankLinesLocal(""), "");
  assert.strictEqual(addBlankLinesLocal("سطر واحد"), "سطر واحد");
});
