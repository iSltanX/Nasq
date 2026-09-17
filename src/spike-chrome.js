// تجربة إطار النافذة (المرحلة 0) — مؤقتة، تُحذف حين تحل واجهة المرحلة 2 محلها
(() => {
  const log = document.getElementById("log");
  document.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      log.textContent = "نُقر: " + b.textContent;
    })
  );
  const invoke = window.__TAURI__?.core?.invoke;
  Promise.all([document.fonts.load('400 13px "Almarai"'), document.fonts.load('700 13px "Almarai"')]).then(
    () => invoke && invoke("main_window_ready")
  );
})();
