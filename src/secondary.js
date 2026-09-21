// ما تتقاسمه نوافذ التطبيق الثانوية (الإعدادات و«حول»): نداء النواة،
// وحقن الأيقونات، وإعلان الجاهزية، وقياس اللوح. لا يعرف برجًا ولا عقدًا.
window.NasaqSecondary = (() => {
  // خارج التطبيق (معاينة متصفح) تبقى الصفحة تُعرض، وتفشل أوامر النواة برسالة واضحة
  const invoke =
    window.__TAURI__?.core?.invoke ??
    (async () => {
      throw "هذه معاينة متصفح — التشغيل الكامل عبر التطبيق نفسه.";
    });

  // النافذة مخفية حتى تُحقن الأيقونات وتُحمَّل الخطوط، فيأتي أول إطار ظاهر
  // كاملًا — نمط النافذة الرئيسية نفسه
  function announceReady(extra) {
    const sprite = document.getElementById("sprite");
    const icons = sprite
      ? fetch("icons.svg")
          .then((r) => r.text())
          .then((svg) => {
            sprite.innerHTML = svg;
          })
          .catch(() => {})
      : Promise.resolve();
    const fonts = document.fonts
      ? Promise.all([
          document.fonts.load('400 14px "Cairo"'),
          document.fonts.load('500 13px "Cairo"'),
          document.fonts.load('600 13px "Cairo"'),
          document.fonts.load('400 13px "JetBrains Mono"'),
        ]).catch(() => {})
      : Promise.resolve();
    return Promise.all([icons, fonts, extra ?? Promise.resolve()]).then(() => {
      invoke("secondary_window_ready").catch(() => {});
    });
  }

  // الإطار يتبع اللوح كما تفعل إعدادات النظام عند تبديل التبويب
  function reportPaneHeight(pane) {
    if (!pane) return;
    const height = Math.ceil(pane.getBoundingClientRect().height);
    invoke("settings_pane_resized", { pane: height }).catch(() => {});
  }

  return { invoke, announceReady, reportPaneHeight };
})();
