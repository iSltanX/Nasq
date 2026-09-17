// updates.js — تدفّق التحديث كما رُسم (Figma 258:18771 ولوحة التدفّقات 94:285):
// الإعدادات/القائمة ← البحث عن تحديثات ← متاح: تنزيل (تقدّم) ← تثبيت وإعادة
// التشغيل.
//
// التصميم رسم **ثلاث** حالات لا أربعًا: «تحديث متاح» و«جارٍ التنزيل» و«لا
// تحديث». فلا تنبيه رابع بين التنزيل والتثبيت، لأن زر «ثبّت وأعد التشغيل»
// موافقةٌ واحدة تغطّيهما معًا — وهو نصّ الزر المرسوم لا اجتهادًا.
//
// وحالة الخطأ غير مرسومة، فبُنيت بهيئة «لا تحديث» نفسها بزرّ واحد — مسجَّلة
// فجوةً في التصميم تُغلق في المرحلة ٨.
//
// **لا بايت يُنزَّل قبل موافقة صريحة**: check() وحده يُنادى تلقائيًا، وdownload
// لا يُنادى إلا من نقرة على زر التثبيت.
(() => {
  const { invoke, registerEscapeCloser } = window.NasaqShell;
  const el = (id) => document.getElementById(id);

  const alertEl = el("update-alert");
  const titleEl = el("update-alert-title");
  const messageEl = el("update-alert-message");
  const progressEl = el("update-alert-progress");
  const fillEl = el("update-progress-fill");
  const captionEl = el("update-progress-caption");
  const cancelEl = el("update-alert-cancel");
  const confirmEl = el("update-alert-confirm");

  // «التحقق التلقائي لا يفاجئ»: لا تنبيه إلا حين يوجد تحديث فعلًا
  const AUTO = "auto";
  const MANUAL = "manual";

  let open = false;
  let busy = false;      // فحصٌ أو تنزيل جارٍ: لا يُبدأ ثانٍ فوقه
  let rid = null;        // مقبض التحديث من الفحص، حيًّا بين العرض والتنزيل
  let version = "";
  let cancelled = false;

  // الميغابايتات بأرقام هندية كبقية ما يُعرض، ورقم الإصدار لاتينيّ فهو معرّف
  const mb = (bytes) =>
    window.NasaqShell.formatNumber(Math.max(0, Math.round(bytes / 1e6)));

  function show({ title, message, caption, progress, cancel, confirm, onConfirm }) {
    titleEl.textContent = title;
    messageEl.textContent = message ?? "";
    messageEl.hidden = !message;
    progressEl.hidden = !progress;
    if (progress) {
      fillEl.style.inlineSize = `${progress.percent}%`;
      progressEl.querySelector(".update-progress-track").setAttribute("aria-valuenow", String(Math.round(progress.percent)));
      captionEl.textContent = caption ?? "";
    }
    cancelEl.hidden = !cancel;
    if (cancel) cancelEl.textContent = cancel;
    confirmEl.hidden = !confirm;
    if (confirm) confirmEl.textContent = confirm;
    confirmEl.onclick = onConfirm ?? null;
    if (!open) {
      open = true;
      window.NasaqWindow.presentModal(alertEl, {
        initialFocus: confirm ? "#update-alert-confirm" : "#update-alert-cancel",
      });
    }
  }

  function close() {
    if (!open) return;
    open = false;
    window.NasaqWindow.dismissModal(alertEl);
  }

  // «إلغاء» أثناء التنزيل يوقف ما بعده: البايتات الواصلة تُهمل ولا يُثبَّت شيء
  cancelEl.addEventListener("click", () => {
    cancelled = true;
    close();
  });

  registerEscapeCloser(() => open, () => cancelEl.click());

  // ---------- الحالات الثلاث ----------

  function showAvailable(version, current) {
    show({
      title: `يتوفّر نَسَق ${version}`,
      message: `لديك الإصدار ${current}. يُعاد تشغيل نَسَق بعد التثبيت، وتبقى مسوداتك كما هي.`,
      cancel: "لاحقًا",
      confirm: "ثبّت وأعد التشغيل",
      onConfirm: install,
    });
  }

  function showUpToDate(current) {
    show({
      title: "نَسَق محدَّث",
      message: `أنت تستخدم أحدث إصدار (${current}).`,
      confirm: "حسنًا",
      onConfirm: close,
    });
  }

  // غير مرسومة: هيئة «لا تحديث» نفسها برسالة السبب
  function showFailure(message) {
    show({ title: "تعذّر التحديث", message, confirm: "حسنًا", onConfirm: close });
  }

  function showDownloading(done, total) {
    show({
      title: `جارٍ تنزيل نَسَق ${version}`.trim(),
      progress: { percent: total ? Math.min(100, (done / total) * 100) : 0 },
      caption: total ? `${mb(done)} م.ب من ${mb(total)} م.ب` : "جارٍ التحضير…",
      cancel: "إلغاء",
    });
  }

  // ---------- الأفعال ----------

  async function currentVersion() {
    try {
      return await window.__TAURI__.app.getVersion();
    } catch {
      return "";
    }
  }

  // المسار الرسمي وحده، كما استقرّ في v8.2.0: تنزيلٌ بقناة تقدّم، ثم تثبيت،
  // ثم إعادة تشغيل. لا مُنزِّل مخصّص ولا تنفيذ يدويّ للملفات ولا إضعاف
  // للتحقّق — الإضافة تتحقّق من التوقيع داخليًا.
  //
  // موافقة واحدة تغطّي الثلاثة، لأن زرّها المرسوم «ثبّت وأعد التشغيل».
  async function install() {
    if (rid == null || busy) return;
    busy = true;
    cancelled = false;
    let done = 0;
    let total = 0;
    showDownloading(0, 0);
    try {
      const channel = new window.__TAURI__.core.Channel();
      channel.onmessage = (msg) => {
        if (!msg) return;
        if (msg.event === "Started") total = msg.data?.contentLength ?? 0;
        else if (msg.event === "Progress") {
          done += msg.data?.chunkLength ?? 0;
          if (!cancelled) showDownloading(done, total);
        }
      };
      const bytesRid = await invoke("plugin:updater|download", { rid, onEvent: channel });
      // «إلغاء» لا يقطع طلبًا جاريًا، ولكنه يمنع ما بعده: البايتات الواصلة
      // تُهمل ولا يُثبَّت منها شيء
      if (cancelled) return;
      await invoke("plugin:updater|install", { updateRid: rid, bytesRid });
      // التثبيت تمّ: إعادة التشغيل هي الخطوة الرابعة في التدفّق المرسوم
      await invoke("plugin:process|restart", {});
    } catch (error) {
      if (!cancelled) showFailure(String(error?.message ?? error));
    } finally {
      busy = false;
    }
  }

  // الفحص وحده — لا ينزّل بايتًا. origin يقرّر ما يُعرض حين لا تحديث
  async function check(origin) {
    if (busy) return;
    busy = true;
    try {
      const meta = await invoke("plugin:updater|check", {});
      invoke("save_settings", { patch: { lastUpdateCheck: Math.floor(Date.now() / 1000) } }).catch(() => {});
      if (meta && meta.rid != null) {
        rid = meta.rid;
        version = meta.version;
        showAvailable(version, await currentVersion());
      } else if (origin === MANUAL) {
        showUpToDate(await currentVersion());
      }
    } catch (error) {
      // الفحص التلقائي لا يقاطع أحدًا بخبر فشلٍ لم يطلبه
      if (origin === MANUAL) showFailure(String(error?.message ?? error));
    } finally {
      busy = false;
    }
  }

  // ---------- المنافذ ----------

  // «نَسَق ← التحقق من وجود تحديثات…» — بلا زرّ، فهو مفعّل ما دامت الواجهة حيّة
  window.NasaqMenu.register("app.check-updates", () => check(MANUAL));

  // الفحص التلقائي عند الإقلاع حين يأذن به المستخدم في الإعدادات
  window.NasaqShell.settingsReady.then((loaded) => {
    if (loaded?.autoUpdates) check(AUTO);
  });

  window.NasaqUpdates = { check: () => check(MANUAL) };
})();
