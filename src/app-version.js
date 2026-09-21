// app-version.js — رقم الإصدار كما رُسم في NsqV272: «٢٧٫٠» لا «27.0.0» (DM9: الإصدار ٢٧٫٠).
//
// Tauri يشترط semver بثلاثة أجزاء، والتصميم يكتب الإصدار بجزأين في «حول»
// والإعدادات وتنبيهات التحديث (254:502 و250:81 و258:18771). فالجزء الثالث
// يُسقط حين يكون صفرًا وحده، ويبقى حين يحمل إصلاحًا: 27.0.1 تُعرض كما هي.
// مصدرٌ واحد للنوافذ الثلاث، ولا شيء فيه يخصّ برجًا.
(() => {
  function display(version) {
    const value = String(version ?? "").trim();
    const short = /^\d+\.\d+\.0$/.test(value) ? value.slice(0, -2) : value;
    // الأرقام هندية والفاصلة العشرية عربية (٫) كما في «حول» والإعدادات وتنبيهات التحديث في الملف؛
    // وما ليس أرقامًا ونقاطًا (إصدار تجريبي بوسمه) يبقى كما هو
    return /^[\d.]+$/.test(short) ? short.replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]).replace(/\./g, "٫") : short;
  }

  const api = { display };
  if (typeof window !== "undefined") window.NasaqVersion = api;
  if (typeof module !== "undefined") module.exports = api;
})();
