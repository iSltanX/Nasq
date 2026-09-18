// نموذج بيانات المسودات الهرمي — دوال نقية بلا DOM وبلا شبكة.
// الأمّ: { key (مفتاح مطبَّع داخلي — لا يُعرض)، original (النص الخام كما هو)،
//          createdAt، versions[] }
// الصيغة: { id، createdAt، formatted، style، intervention، platform، linesAdjusted }
// تُختبر في Node مباشرة (tests/drafts-model.test.js).

// المفتاح المطبَّع: توحيد فواصل الأسطر ودمج الفراغات المتتالية وقصّ الأطراف.
// تغيّر الكلمات → مفتاح جديد؛ تغيّر المسافات/الأسطر فقط → المفتاح نفسه.
// النص الخام يُخزَّن بلا تطبيع — التطبيع للمفتاح فقط، ولا يُعرض للمستخدم أبدًا.
function draftKey(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

// مقتطف الأمّ: أول ~40 حرفًا من النص الخام، سطر واحد، والزيادة تُقصّ بـ «…»
function draftExcerpt(text) {
  const flat = String(text || "").replace(/\s+/g, " ").trim();
  return flat.length > 40 ? flat.slice(0, 40) + "…" : flat;
}

// ترتيب الصيغ بوقت الحفظ تصاعديًا (الأقدم أولًا) — منه تُشتقّ أرقام «تنسيق ١/٢/٣»
// عند العرض، فلا تُخزَّن الأرقام وتبقى متسقة بعد أي حذف
function sortVersions(versions) {
  return [...versions].sort((a, b) => {
    const t = String(a.createdAt || "").localeCompare(String(b.createdAt || ""));
    return t !== 0 ? t : String(a.id).localeCompare(String(b.id));
  });
}

// الترحيل من المسطّح إلى الهرمي — يقبل الشكلين معًا فلا تضيع أي مسودة:
// العنصر المسطّح القديم يُجمَّع تحت أمّه بالمفتاح، والأمّ الجاهزة تُدمج إن تكرر
// مفتاحها. يُعاد { mothers, changed } — changed يقرر الكتابة الواحدة بعد الترحيل.
function migrateDrafts(list) {
  if (!Array.isArray(list)) return { mothers: [], changed: true };
  const hasText = (value) => typeof value === "string" && value.trim() !== "";

  const mothers = [];
  const byKey = new Map();
  let changed = false;

  // حقول الأمّ التي لا يعرفها هذا الإصدار (صيغةٌ أحدث) تبقى كما هي، فلا يمحوها
  // أول حفظٍ بعد الترحيل (فحص m2)
  const motherFor = (key, original, createdAt, fields) => {
    let m = byKey.get(key);
    if (!m) {
      m = { ...fields, key, original, createdAt, versions: [] };
      byKey.set(key, m);
      mothers.push(m);
    }
    return m;
  };

  let seq = 0;
  for (const item of list) {
    seq += 1;
    if (!item || typeof item !== "object") {
      changed = true;
      continue;
    }

    if (Array.isArray(item.versions)) {
      // أمّ هرمية جاهزة — تُدمج مع مثيلتها إن تطابق المفتاح
      const original = item.original || "";
      const key = typeof item.key === "string" && item.key ? item.key : draftKey(original);
      if (byKey.has(key) || key !== item.key) changed = true;
      const m = motherFor(key, original, item.createdAt || new Date().toISOString(), item);
      for (const v of item.versions) {
        if (v && typeof v === "object") m.versions.push(v);
      }
    } else {
      // مسودة مسطّحة قديمة → صيغة تحت أمّها. وكائنٌ بلا نصٍّ أصلي ولا منسّق
      // ليس مسودة (ملفٌّ آخر اختير للاستيراد) فيُتخطى (فحص m2)
      changed = true;
      if (!hasText(item.original) && !hasText(item.formatted)) continue;
      const original = item.original || "";
      const m = motherFor(draftKey(original), original, item.createdAt || new Date().toISOString());
      m.versions.push({
        id: item.id != null ? item.id : `migrated-${seq}`,
        createdAt: item.createdAt || new Date().toISOString(),
        formatted: item.formatted || "",
        style: item.style || "",
        intervention: item.intervention || "",
        platform: item.platform || null,
        linesAdjusted: Boolean(item.linesAdjusted),
      });
    }
  }

  const filtered = mothers.filter((m) => m.versions.length > 0);
  if (filtered.length !== mothers.length) changed = true;
  return { mothers: filtered, changed };
}

// دمج مسودات مستوردة من نسخة احتياطية في القائمة الحالية — دمج لا استبدال،
// فالاستيراد لا يفسد القائم أبدًا: الأمّ المطابقة بالمفتاح تُدمج صيغها
// (الصيغة المطابقة id + createdAt موجودة أصلًا فتُتخطى — استيراد النسخة
// نفسها مرتين لا يكرر شيئًا)، والأمّ الجديدة تُلحق في آخر القائمة (نسخة
// قديمة لا تتصدر الأحدث). يعيد { mothers, added } — added عدد الصيغ الجديدة
function mergeImportedDrafts(current, imported) {
  const mothers = (current || []).map((m) => ({ ...m, versions: [...m.versions] }));
  const byKey = new Map(mothers.map((m) => [m.key, m]));
  let added = 0;

  for (const im of imported || []) {
    if (!im || !Array.isArray(im.versions) || im.versions.length === 0) continue;
    const existing = byKey.get(im.key);
    if (!existing) {
      const copy = { ...im, versions: [...im.versions] };
      mothers.push(copy);
      byKey.set(copy.key, copy);
      added += copy.versions.length;
      continue;
    }
    const seen = new Set(existing.versions.map((v) => `${v.id}|${v.createdAt}`));
    for (const v of im.versions) {
      const sig = `${v.id}|${v.createdAt}`;
      if (seen.has(sig)) continue;
      existing.versions.push(v);
      seen.add(sig);
      added += 1;
    }
  }

  return { mothers, added };
}

// بحث المسودات: مطابقة جزئية على النص الأصلي وكل الصيغ المنسقة، بعد تطبيع
// الفراغات في الطرفين (بحث «كلمة كلمة» ينجو من اختلاف كسور الأسطر).
// استعلام فارغ يعيد القائمة كما هي — البنية المخزنة لا تُمسّ
function filterMothers(mothers, query) {
  const q = draftKey(query);
  if (!q) return mothers;
  return (mothers || []).filter(
    (m) =>
      draftKey(m.original).includes(q) ||
      m.versions.some((v) => draftKey(v.formatted).includes(q))
  );
}

const NasaqDrafts = { draftKey, draftExcerpt, sortVersions, migrateDrafts, mergeImportedDrafts, filterMothers };

if (typeof module !== "undefined" && module.exports) module.exports = NasaqDrafts;
if (typeof window !== "undefined") window.NasaqDrafts = NasaqDrafts;
