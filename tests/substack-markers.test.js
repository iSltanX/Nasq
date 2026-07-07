// اختبارات خريطة سابستاك اليدوية — تجريد الرموز في src/substack-markers.js
const test = require("node:test");
const assert = require("node:assert");
const { stripSubstackMarkers } = require("../src/substack-markers.js");

test("يحذف سطر ++ كاملًا بلا سطر فارغ مكانه", () => {
  const input = "سلطان ذهب\n++\nبعد قليل";
  assert.strictEqual(stripSubstackMarkers(input), "سلطان ذهب\nبعد قليل");
});

test("يحذف الرموز الثلاثة معًا من المثال الكامل", () => {
  const input = "سلطان ذهب\n++\nبعد قليل\n**\nسيذهب\n---\nثم عاد";
  assert.strictEqual(
    stripSubstackMarkers(input),
    "سلطان ذهب\nبعد قليل\nسيذهب\nثم عاد"
  );
});

test("لا يمسّ شرطات داخل جملة (ليست رمزًا مستقلًا)", () => {
  const input = "هذا - بين شرطتين - يبقى كما هو";
  assert.strictEqual(stripSubstackMarkers(input), input);
});

test("لا يمسّ ** حين تكون وسط سطر نصي لا رمزًا مستقلًا", () => {
  const input = "كلمة **مهمة** هنا وسط الجملة";
  assert.strictEqual(stripSubstackMarkers(input), input);
});

test("يتسامح مع فراغ حول الرمز في سطره قبل الحذف", () => {
  const input = "أولى\n  ++  \nثانية";
  assert.strictEqual(stripSubstackMarkers(input), "أولى\nثانية");
});

test("نص بلا رموز يبقى كما هو حرفيًا", () => {
  const input = "فقرة أولى\nفقرة ثانية بلا أي رمز";
  assert.strictEqual(stripSubstackMarkers(input), input);
});

test("خلوّ تام من الرموز الثلاثة بعد التجريد — الاختبار الحاسم", () => {
  const input = "أ\n++\nب\n**\nج\n---\nد";
  const out = stripSubstackMarkers(input);
  for (const marker of ["++", "**", "---"]) {
    assert.ok(
      !out.split("\n").some((line) => line.trim() === marker),
      `الرمز ${marker} تسرّب إلى النص المجرَّد`
    );
  }
});
