// اختبار نموذج المسودات الهرمي — يعمل بـ: npm test
const test = require("node:test");
const assert = require("node:assert");
const { draftKey, draftExcerpt, sortVersions, migrateDrafts, mergeImportedDrafts, filterMothers } = require("../src/drafts-model.js");

test("المفتاح المطبَّع: تغيّر المسافات والأسطر فقط لا يغيّر المفتاح", () => {
  const a = draftKey("نص  تجريبي\nبسطرين");
  const b = draftKey("نص تجريبي بسطرين");
  const c = draftKey("  نص تجريبي\r\n\r\nبسطرين  ");
  assert.strictEqual(a, b);
  assert.strictEqual(a, c);
});

test("المفتاح المطبَّع: تغيّر الكلمات يُنتج مفتاحًا جديدًا", () => {
  assert.notStrictEqual(draftKey("نص أول"), draftKey("نص ثانٍ"));
});

test("المقتطف: سطر واحد، ~40 حرفًا، والزيادة تُقصّ بـ «…»", () => {
  const long = "كلمة ".repeat(20);
  const ex = draftExcerpt(long);
  assert.ok(ex.endsWith("…"));
  assert.strictEqual(ex.length, 41);
  assert.ok(!ex.includes("\n"));
  assert.strictEqual(draftExcerpt("قصير"), "قصير");
});

test("الترحيل: المسطّحات المتطابقة (بعد التطبيع) تُجمَّع تحت أمّ واحدة", () => {
  const flat = [
    { id: 2, createdAt: "2026-07-02T10:00:00Z", original: "نص  واحد", formatted: "ب", style: "مقال", intervention: "تجهيز للنشر", platform: null },
    { id: 1, createdAt: "2026-07-01T10:00:00Z", original: "نص واحد", formatted: "أ", style: "مقال", intervention: "تنسيق قراءة", platform: null },
    { id: 3, createdAt: "2026-07-03T10:00:00Z", original: "نص آخر مختلف", formatted: "ج", style: "شذرة", intervention: "تنسيق منصة", platform: "إكس" },
  ];
  const { mothers, changed } = migrateDrafts(flat);
  assert.strictEqual(changed, true);
  assert.strictEqual(mothers.length, 2);
  assert.strictEqual(mothers[0].versions.length, 2);
  assert.strictEqual(mothers[1].versions.length, 1);
  // النص الخام يُرفع للأمّ بلا تطبيع (أول ظهور)
  assert.strictEqual(mothers[0].original, "نص  واحد");
  // لا تُفقد أي مسودة
  const total = mothers.reduce((s, m) => s + m.versions.length, 0);
  assert.strictEqual(total, 3);
});

test("الترحيل: البنية الهرمية الجاهزة تمرّ دون تغيير", () => {
  const hierarchical = [
    { key: "نص", original: "نص", createdAt: "2026-07-01T10:00:00Z", versions: [{ id: 1, createdAt: "2026-07-01T10:00:00Z", formatted: "أ", style: "مقال", intervention: "تنسيق قراءة", platform: null, linesAdjusted: false }] },
  ];
  const { mothers, changed } = migrateDrafts(hierarchical);
  assert.strictEqual(changed, false);
  assert.strictEqual(mothers.length, 1);
  assert.strictEqual(mothers[0].versions.length, 1);
});

test("الترحيل: أمّان بنفس المفتاح يُدمجان، والأمّ الفارغة تُسقط", () => {
  const input = [
    { key: "نص", original: "نص", createdAt: "2026-07-01T10:00:00Z", versions: [{ id: 1, createdAt: "2026-07-01T10:00:00Z", formatted: "أ" }] },
    { key: "نص", original: "نص", createdAt: "2026-07-02T10:00:00Z", versions: [{ id: 2, createdAt: "2026-07-02T10:00:00Z", formatted: "ب" }] },
    { key: "فارغة", original: "فارغة", createdAt: "2026-07-03T10:00:00Z", versions: [] },
  ];
  const { mothers, changed } = migrateDrafts(input);
  assert.strictEqual(changed, true);
  assert.strictEqual(mothers.length, 1);
  assert.strictEqual(mothers[0].versions.length, 2);
});

test("الترحيل: مدخل تالف لا يُسقط الباقي", () => {
  const { mothers } = migrateDrafts([null, "نص خام", { id: 1, original: "سليم", formatted: "أ", createdAt: "2026-07-01T10:00:00Z" }]);
  assert.strictEqual(mothers.length, 1);
  assert.strictEqual(mothers[0].original, "سليم");
});

test("الاستيراد: دمج لا استبدال — الأمّ المطابقة تُدمج صيغها والجديدة تُلحق آخرًا", () => {
  const current = [
    { key: "نص أول", original: "نص أول", createdAt: "2026-07-01T10:00:00Z", versions: [{ id: 1, createdAt: "2026-07-01T10:00:00Z", formatted: "أ" }] },
  ];
  const imported = [
    { key: "نص أول", original: "نص أول", createdAt: "2026-06-01T10:00:00Z", versions: [{ id: 9, createdAt: "2026-06-01T10:00:00Z", formatted: "قديمة" }] },
    { key: "نص ثانٍ", original: "نص ثانٍ", createdAt: "2026-06-02T10:00:00Z", versions: [{ id: 5, createdAt: "2026-06-02T10:00:00Z", formatted: "ب" }] },
  ];
  const { mothers, added } = mergeImportedDrafts(current, imported);
  assert.strictEqual(added, 2);
  assert.strictEqual(mothers.length, 2);
  assert.strictEqual(mothers[0].key, "نص أول");
  assert.strictEqual(mothers[0].versions.length, 2);
  // الأمّ المستوردة الجديدة في آخر القائمة لا صدارتها
  assert.strictEqual(mothers[1].key, "نص ثانٍ");
  // الأصل لم يُمسّ (الدالة نقية — نسخ لا تعديل في المكان)
  assert.strictEqual(current[0].versions.length, 1);
});

test("الاستيراد: استيراد النسخة نفسها مرتين لا يكرر صيغة", () => {
  const current = [
    { key: "نص", original: "نص", createdAt: "2026-07-01T10:00:00Z", versions: [{ id: 1, createdAt: "2026-07-01T10:00:00Z", formatted: "أ" }] },
  ];
  const backup = [
    { key: "نص", original: "نص", createdAt: "2026-07-01T10:00:00Z", versions: [{ id: 1, createdAt: "2026-07-01T10:00:00Z", formatted: "أ" }, { id: 2, createdAt: "2026-07-02T10:00:00Z", formatted: "ب" }] },
  ];
  const first = mergeImportedDrafts(current, backup);
  assert.strictEqual(first.added, 1);
  const second = mergeImportedDrafts(first.mothers, backup);
  assert.strictEqual(second.added, 0);
  assert.strictEqual(second.mothers[0].versions.length, 2);
});

test("الاستيراد: الأمّ الفارغة أو التالفة تُتخطى بلا أثر", () => {
  const { mothers, added } = mergeImportedDrafts([], [null, { key: "فارغة", original: "فارغة", versions: [] }, "خام"]);
  assert.strictEqual(added, 0);
  assert.strictEqual(mothers.length, 0);
});

test("البحث: مطابقة مطبَّعة الفراغات على الأصل والصيغ، والفارغ يعيد الكل", () => {
  const mothers = [
    { key: "أ", original: "الحنين لا\nيعود إلى الأماكن", versions: [{ id: 1, createdAt: "2026-07-01T10:00:00Z", formatted: "الحنين لا يعود" }] },
    { key: "ب", original: "نص آخر", versions: [{ id: 2, createdAt: "2026-07-01T10:00:00Z", formatted: "صيغة\nمنسقة هنا" }] },
  ];
  // الاستعلام يطابق عبر كسر السطر في الأصل (تطبيع الطرفين)
  assert.strictEqual(filterMothers(mothers, "لا يعود إلى").length, 1);
  // المطابقة على الصيغة المنسقة وحدها تكفي
  assert.strictEqual(filterMothers(mothers, "منسقة هنا")[0].key, "ب");
  assert.strictEqual(filterMothers(mothers, "").length, 2);
  assert.strictEqual(filterMothers(mothers, "   ").length, 2);
  assert.strictEqual(filterMothers(mothers, "غير موجود").length, 0);
});

test("ترتيب الصيغ: الأقدم أولًا (منه يُشتقّ تنسيق ١/٢/٣ بلا فجوات بعد الحذف)", () => {
  const versions = [
    { id: 3, createdAt: "2026-07-03T10:00:00Z" },
    { id: 1, createdAt: "2026-07-01T10:00:00Z" },
    { id: 2, createdAt: "2026-07-02T10:00:00Z" },
  ];
  const sorted = sortVersions(versions);
  assert.deepStrictEqual(sorted.map((v) => v.id), [1, 2, 3]);
  // الحذف من الوسط لا يترك فجوة — الترقيم مشتق من الترتيب لا مخزّن
  const afterDelete = sortVersions(versions.filter((v) => v.id !== 2));
  assert.deepStrictEqual(afterDelete.map((v) => v.id), [1, 3]);
});

// ---------- فحص m2: الاستيراد والدمج في أطرافهما ----------

test("صيغة أحدث: حقلٌ لا يعرفه هذا الإصدار في الأمّ يبقى بعد الترحيل والدمج", () => {
  // إصدارٌ لاحق قد يضيف إلى الأمّ حقلًا؛ هذا الإصدار لا يفهمه لكنه لا يمحوه
  // حين يحفظ القائمة بعد أي تعديل
  const newer = [
    { key: "نص", original: "نص", createdAt: "2026-07-01T10:00:00Z", pinned: true, versions: [{ id: 1, createdAt: "2026-07-01T10:00:00Z", formatted: "أ", tone: "هادئ" }] },
  ];
  const { mothers } = migrateDrafts(newer);
  assert.strictEqual(mothers[0].pinned, true, "حقل الأمّ الأحدث مُحي بالترحيل");
  assert.strictEqual(mothers[0].versions[0].tone, "هادئ", "حقل الصيغة الأحدث مُحي بالترحيل");
  const merged = mergeImportedDrafts([], mothers);
  assert.strictEqual(merged.mothers[0].pinned, true, "حقل الأمّ الأحدث مُحي بالدمج");
});

test("ملفٌّ لا صلة له: كائناتٌ بلا نصٍّ لا تصير مسوداتٍ فارغة", () => {
  // «استيراد ودمج» يقبل أي JSON يختاره الكاتب؛ مصفوفة كائنات من ملفٍّ آخر
  // ليست مسودات قديمة بلا نص
  const { mothers } = migrateDrafts([{ name: "حزمة", version: "1.0.0" }, {}]);
  assert.strictEqual(mothers.length, 0, `استُورد ما ليس مسودة: ${JSON.stringify(mothers)}`);
  // والمسودة القديمة المسطّحة بنصٍّ أصلي وحده تبقى
  assert.strictEqual(migrateDrafts([{ id: 7, original: "نص قديم" }]).mothers.length, 1);
});

test("ملفٌّ ليس قائمة: لا أمّهات منه، والترحيل يعلن التغيير", () => {
  for (const raw of [{ drafts: [] }, "نص", 42, null]) {
    const { mothers, changed } = migrateDrafts(raw);
    assert.strictEqual(mothers.length, 0);
    assert.strictEqual(changed, true);
  }
});
