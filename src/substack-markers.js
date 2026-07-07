// خريطة سابستاك اليدوية — دالة نقية بلا DOM وبلا شبكة، تُختبر في Node مباشرة
// (tests/substack-markers.test.js). النموذج يضع رموزًا إرشادية (++ / ** / ---)
// كلٌّ في سطر مستقل داخل formattedText؛ هذه الدالة تجرّدها قبل النسخ أو الحفظ
// فلا تدخل النص المنشور أبدًا — الرموز للعرض فقط.
//
// المطابقة صارمة على السطر كاملًا بعد تشذيب الأطراف: شرطات داخل جملة، أو "**"
// وسط تنسيق نصي، ليست رمزًا إرشاديًا فتبقى كما هي؛ فقط سطر يطابق أحد الرموز
// حرفيًا ولا شيء غيره يُعامل رمزًا ويُحذف كاملًا (لا يُترك سطر فارغ مكانه).
const SUBSTACK_MARKER_LINES = new Set(["++", "**", "---"]);

function stripSubstackMarkers(text) {
  return String(text)
    .split("\n")
    .filter((line) => !SUBSTACK_MARKER_LINES.has(line.trim()))
    .join("\n");
}

const NasaqSubstackMarkers = { stripSubstackMarkers, SUBSTACK_MARKER_LINES };

if (typeof module !== "undefined" && module.exports) module.exports = NasaqSubstackMarkers;
if (typeof window !== "undefined") window.NasaqSubstackMarkers = NasaqSubstackMarkers;
