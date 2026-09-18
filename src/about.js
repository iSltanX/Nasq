// لوحة «حول» — رقم الإصدار وحده متغيّر، والباقي نصّ التصميم كما هو.
// وتتبع المظهر المحفوظ كبقية النوافذ: لا تبقى فاتحة والتطبيق داكن
(() => {
  const { invoke, announceReady } = window.NasaqSecondary;
  const appearance = window.NasaqAppearance;

  const version = window.__TAURI__?.app
    ?.getVersion?.()
    .then((value) => {
      document.getElementById("app-version").textContent = value;
    })
    .catch(() => {});

  // موقع المؤلف: نصُّه ورابطه من المصدر المشترك، والفتح يمرّ بالنواة —
  // وقدرة هذه النافذة تسمح بهذا العنوان بالاسم وحده
  const site = document.getElementById("site-link");
  site.textContent = window.NasaqLinks.SITE_LABEL;
  site.addEventListener("click", () => {
    invoke("plugin:opener|open_url", { url: window.NasaqLinks.SITE_URL }).catch(() => {});
  });

  let choice = "auto";
  const settings = invoke("load_settings")
    .then((view) => {
      choice = appearance.apply(view.appearance);
    })
    .catch(() => {});

  window.__TAURI__?.event
    ?.listen("settings:changed", (event) => {
      choice = appearance.apply(event.payload?.appearance);
    })
    .catch(() => {});
  appearance.followSystem(() => choice);

  announceReady(Promise.all([version ?? Promise.resolve(), settings]));
})();
