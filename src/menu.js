// menu.js — الجسر بين شريط القوائم الأصلي والواجهة.
//
// عقدٌ بالتسجيل لا بالنداء: القشرة لا تعرف دالة برج باسمها، بل كل صاحب أمرٍ
// يسجّل أمره هنا (كما تُسجَّل مُغلقات Escape ومعالج الاستعادة). فالبرجان لا
// يريان بعضهما، ولا يرى هذا الملف عقدًا ولا نداءً نموذجيًا.
//
// وأمرٌ واحد قد يكون له صاحبان — «نسّق»/«افحص الشذرة» و«نسخ النتيجة»/«نسخ
// النص المشذَّب» — فيُسجَّل كلٌّ باسم برجه، ويُنفَّذ صاحب الوحدة الظاهرة.
//
// وتعطيل عناصر القوائم لا يُعاد حسابه هنا: زرّ الأمر هو مصدر الحقيقة، ومراقب
// تغيّرات يبقيهما متلازمين — فلا تنحرف قائمةٌ عن زرٍّ أبدًا.
(() => {
  // لا تُقرأ القشرة ولا هيكل النافذة عند التحميل: هذا الملف يُحمَّل قبلهما
  // ليسجّل فيه الجميع، ويُنادَيان عند الاستعمال لا عند التعريف
  const invoke = (...args) => window.NasaqShell.invoke(...args);
  const modalOpen = () => window.NasaqWindow.isModalOpen();
  const root = document.documentElement;

  // id → [{ run, button, owner }] — أكثر من واحد حين يتبدّل الأمر مع الوحدة
  const commands = new Map();
  let ready = false;

  const activeModule = () => root.dataset.module;

  // صاحب الأمر: من لا برج له يصلح دائمًا، وذو البرج لا يصلح إلا في وحدته
  function entryFor(id) {
    const list = commands.get(id);
    if (!list) return null;
    return list.find((c) => !c.owner || c.owner === activeModule()) ?? null;
  }

  // الزرّ يقرّر: مخفيٌّ أو معطَّل يعني أمرًا معطَّلًا، وبلا زرٍّ يعني دائمًا مفعّلًا
  function usable(entry) {
    if (!entry) return false;
    const button = entry.button;
    if (!button) return true;
    return !button.disabled && !button.hidden && button.offsetParent !== null;
  }

  /**
   * تسجيل أمر من أوامر الشريط.
   * @param id معرّفه كما في مواصفة `menu.rs` حرفيًا.
   * @param run ما يُنفَّذ عند اختياره.
   * @param button زرّه في الواجهة — مصدر حالة التفعيل، إن كان له زرّ.
   * @param owner "nasaq" أو "shadhb" حين يتبدّل الأمر مع الوحدة.
   * @param title دالةٌ تعيد اسمه حين يتبع الحالة (إظهار/إخفاء مثلًا).
   */
  function register(id, run, { button = null, owner = null, title = null } = {}) {
    if (!commands.has(id)) commands.set(id, []);
    commands.get(id).push({ run, button, owner, title });
    schedule();
  }

  // ---------- مزامنة حالة العناصر ----------

  let pending = null;
  function schedule() {
    if (!ready || pending) return;
    pending = requestAnimationFrame(() => {
      pending = null;
      sync();
    });
  }

  function sync() {
    // قبل الجاهزية لا يُنادى شيء: الألواح تُطبَّق قبل أن تُحمَّل القشرة
    if (!ready) return;
    const updates = [...commands.keys()].map((id) => {
      const entry = entryFor(id);
      const update = { id, enabled: usable(entry) };
      // الاسم يمرّ في المسار نفسه، فلا تحتاج حالةٌ تتبع اسمًا مسارًا ثانيًا
      if (entry?.title) update.title = entry.title();
      return update;
    });
    if (updates.length) invoke("set_menu_state", { updates }).catch(() => {});
  }

  // الأزرار مصدر الحقيقة: أي تبدّل في `disabled` أو `hidden` أو في الوحدة
  // الظاهرة يعيد المزامنة — فلا تُكتب حالة الأمر مرتين
  new MutationObserver(schedule).observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["disabled", "hidden"],
  });
  new MutationObserver(schedule).observe(root, {
    attributes: true,
    attributeFilter: ["data-module"],
  });

  // ---------- استقبال الحدث ----------

  window.__TAURI__?.event
    ?.listen("menu:action", (event) => {
      const entry = entryFor(event.payload);
      // تحت ورقة أو تنبيه مفتوح لا ينفّذ أمرٌ خلفهما، كما في الماك
      if (!usable(entry) || modalOpen()) return;
      entry.run();
    })
    .catch(() => {});

  // الواجهة جهزت حين تُحمَّل ملفاتها كلها: عناصر الشريط تُفتح الآن، فلا يضيع
  // فعلٌ قبل أن يوجد سامعه. والإعلان من هنا لا من آخر ملف، فلا يُنسى إن تبدّل
  // ترتيب التحميل أو أُطفئ برج
  function announceReady() {
    if (ready) return;
    ready = true;
    setPane(document.getElementById("content").dataset.view);
    setModule(activeModule());
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", announceReady, { once: true });
  } else {
    announceReady();
  }

  // تبديل الوحدة يعيد بناء القائمة الرابعة في النواة، فعناصرها تولد معطّلة —
  // والمزامنة بعده لا قبله، وإلا فُتحت عناصر ثم استُبدلت بأخرى مغلقة
  function setModule(module) {
    if (!ready) return;
    invoke("set_active_module", { module })
      .then(sync)
      .catch(() => {});
  }

  // علامتا «الأصل/النتيجة» — حصريّتهما محصورة في النواة
  function setPane(pane) {
    if (!ready) return;
    invoke("set_active_pane", { pane }).catch(() => {});
  }

  window.NasaqMenu = { register, announceReady, sync, setModule, setPane };
})();
