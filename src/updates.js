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
  const glyphEl = el("update-alert-glyph");
  const noteEl = el("update-alert-note");
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
  // «ابحث عن تحديثات» طُلب وفحصٌ آخر أو تنزيلٌ مُلغى جارٍ: يجري حين ينتهي، فلا
  // يُبتلع الطلب بلا جواب (فحص m3)
  let pendingManual = false;

  // الميغابايتات بأرقام هندية كبقية ما يُعرض، ورقم الإصدار لاتينيّ فهو معرّف
  const mb = (bytes) =>
    window.NasaqShell.formatNumber(Math.max(0, Math.round(bytes / 1e6)));

  function show({ title, message, caption, note, progress, cancel, confirm, onConfirm, failed = false, cancelTone = "" }) {
    titleEl.textContent = title;
    // رمز الإخفاق في صفّ العنوان لتنبيهَي الفشل وحدهما (Alert-Check-Failed 2009:2883)
    glyphEl.hidden = !failed;
    noteEl.textContent = note ?? "";
    noteEl.hidden = !note;
    cancelEl.classList.toggle("is-destructive", cancelTone === "destructive");
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

  // Esc هو «إلغاء» حيث يظهر وحده: لا يُغلق حالة التثبيت التي لا إلغاء فيها
  registerEscapeCloser(() => open && !cancelEl.hidden, () => cancelEl.click());

  // ---------- الحالات الخمس: ثلاث مرسومة في ٢٥٨:١٨٧٧١ واثنتان في المرحلة ٨ ----------

  function showAvailable(version, current) {
    show({
      // Alert-Update-Available 2009:2839. الزرّ «نزّل التحديث» موافقةٌ واحدة على التنزيل فالتثبيت فإعادة
      // التشغيل، فالرسالة تقول ذلك صراحةً؛ ولا وصف لمحتوى الإصدار فهو لا يُعرف هنا
      title: "تحديث جديد متاح",
      message: `الإصدار ${version} متوفر الآن${current ? ` ولديك ${current}` : ""}. مسوداتك الحالية وإعداداتك لن تتأثر بهذا التحديث، ويُعاد تشغيل نَسَق بعد تثبيته.`,
      cancel: "لاحقًا",
      confirm: "نزّل التحديث",
      onConfirm: install,
    });
  }

  function showUpToDate(current) {
    show({
      title: "أحدث إصدار مثبت",
      message: `نَسَق يعمل حاليًا بأحدث إصدار متوفر (${current}).`,
      confirm: "حسنًا",
      onConfirm: close,
    });
  }

  // حالتا الفشل مرسومتان في المرحلة ٨ (Figma 325:1489 و325:1509): هيئة «لا
  // تحديث» نفسها، ولكلٍّ رسالتها بالعربية. سبب الخطأ التقني لا يُعرض — يُطبع
  // في سجلّ الويب-فيو وحده للتشخيص
  function showCheckFailure(reason) {
    console.warn("تعذّر التحقق من التحديثات:", reason);
    show({
      title: "فشل التحقق من التحديثات",
      message: "تعذّر الاتصال بخادم التحديثات. يُرجى التحقق من اتصالك بالإنترنت ثم إعادة المحاولة.",
      failed: true,
      cancel: "إلغاء",
      confirm: "حاول مجددًا",
      onConfirm: retryCheck,
    });
  }

  function showDownloadFailure(reason) {
    console.warn("تعذّر تنزيل التحديث:", reason);
    show({
      title: "فشل تنزيل التحديث",
      message: "لم يكتمل تنزيل التحديث ولم يُثبَّت منه شيء. مسوداتك الحالية وإعداداتك لم تتأثر.",
      failed: true,
      cancel: "إلغاء",
      confirm: "حاول مجددًا",
      onConfirm: install,
    });
  }

  function showDownloading(done, total) {
    show({
      title: "جارٍ تنزيل التحديث",
      progress: { percent: total ? Math.min(100, (done / total) * 100) : 0 },
      caption: total ? `${mb(done)} م.ب من ${mb(total)} م.ب` : "جارٍ التحضير…",
      note: "الإلغاء يمنع التثبيت التلقائي بعد اكتمال التنزيل على جهازك.",
      cancel: "إلغاء",
      cancelTone: "destructive",
    });
  }

  // التنزيل اكتمل والتثبيت جارٍ: لا «إلغاء»، فالتثبيت لا يُلغى (Figma 353:10700،
  // فحص m3-01). والشريط ممتلئ، والسطر يقول ما سيحدث بعده
  function showInstalling() {
    show({
      title: "جارٍ تثبيت التحديث",
      progress: { percent: 100 },
      caption: "يُعاد تشغيل نَسَق حين يكتمل التثبيت.",
    });
  }

  // ---------- الأفعال ----------

  async function currentVersion() {
    try {
      return window.NasaqVersion.display(await window.__TAURI__.app.getVersion());
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
      showInstalling();
      await invoke("plugin:updater|install", { updateRid: rid, bytesRid });
      // التثبيت تمّ: إعادة التشغيل هي الخطوة الرابعة في التدفّق المرسوم. ولا «إلغاء»
      // بعد اكتمال التنزيل (showInstalling)، فلا يُعاد التشغيل بعد أن قال الكاتب
      // «إلغاء» — كان الزر ظاهرًا أثناء التثبيت ولا يوقفه (فحص m3-01)
      await invoke("plugin:process|restart", {});
    } catch (error) {
      if (!cancelled) showDownloadFailure(String(error?.message ?? error));
    } finally {
      // تنزيلٌ لم يُلغَ تنبيهُه الظاهر بتقدّمه جوابُ كل طلبٍ جاء أثناءه: لا فحص بعده
      if (!cancelled) pendingManual = false;
      settle();
    }
  }

  // «حاول مجددًا» بعد فشل الفحص: التنبيه يُغلق ثم يجري الفحص اليدوي نفسه
  function retryCheck() {
    close();
    check(MANUAL);
  }

  function settle() {
    busy = false;
    if (!pendingManual) return;
    pendingManual = false;
    check(MANUAL);
  }

  // الفحص وحده — لا ينزّل بايتًا. origin يقرّر ما يُعرض حين لا تحديث
  async function check(origin) {
    if (busy) {
      if (origin === MANUAL) pendingManual = true;
      return;
    }
    busy = true;
    try {
      const meta = await invoke("plugin:updater|check", {});
      invoke("save_settings", { patch: { lastUpdateCheck: Math.floor(Date.now() / 1000) } }).catch(() => {});
      if (meta && meta.rid != null) {
        rid = meta.rid;
        version = window.NasaqVersion.display(meta.version);
        showAvailable(version, await currentVersion());
      } else if (origin === MANUAL) {
        showUpToDate(await currentVersion());
      }
    } catch (error) {
      // الفحص التلقائي لا يقاطع أحدًا بخبر فشلٍ لم يطلبه
      if (origin === MANUAL) showCheckFailure(String(error?.message ?? error));
    } finally {
      settle();
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
