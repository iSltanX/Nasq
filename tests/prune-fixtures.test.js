// الحالات المشتركة مع النواة — المصدر الواحد لتطابق سلوك المقص بين
// src/prune.js (هنا) وsrc-tauri/src/shadhb/verify.rs (اختبارات cargo).
// يعمل بـ: npm test
const test = require("node:test");
const assert = require("node:assert");
const fixtures = require("./fixtures/prune-cases.json");
const { applyCuts, tidyAfterCut, verifySubset } = require("../src/prune.js");

for (const c of fixtures.applyCuts) {
  test(`مشترك/قص: ${c.name}`, () => {
    const { text, applied, skipped } = applyCuts(c.text, c.cuts);
    assert.strictEqual(text, c.expected);
    assert.strictEqual(applied.length, c.applied);
    assert.strictEqual(skipped.length, c.skipped);
  });
}

for (const c of fixtures.tidyAfterCut) {
  test(`مشترك/ترتيب: ${c.name}`, () => {
    const once = tidyAfterCut(c.input);
    assert.strictEqual(once, c.expected);
    // الحتمية المتكررة جزء من العقد المشترك
    assert.strictEqual(tidyAfterCut(once), once);
  });
}

for (const c of fixtures.verifySubset) {
  test(`مشترك/شهادة: ${c.name}`, () => {
    const { ok, addedWords } = verifySubset(c.original, c.pruned);
    assert.strictEqual(ok, c.ok);
    assert.deepStrictEqual(addedWords, c.addedWords);
  });
}
