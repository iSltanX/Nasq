// app-version.js — رقم الإصدار كما رُسم: «27.0» لا «27.0.0».
//
// Tauri يشترط semver بثلاثة أجزاء، والتصميم يكتب الإصدار بجزأين في «حول»
// والإعدادات وتنبيهات التحديث (254:502 و250:81 و258:18771). فالجزء الثالث
// يُسقط حين يكون صفرًا وحده، ويبقى حين يحمل إصلاحًا: 27.0.1 تُعرض كما هي.
// مصدرٌ واحد للنوافذ الثلاث، ولا شيء فيه يخصّ برجًا.
(() => {
  function display(version) {
    const value = String(version ?? "").trim();
    return /^\d+\.\d+\.0$/.test(value) ? value.slice(0, -2) : value;
  }

  const api = { display };
  if (typeof window !== "undefined") window.NasaqVersion = api;
  if (typeof module !== "undefined") module.exports = api;
})();
