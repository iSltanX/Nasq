// forms.js — الحالة السطرية، وسلوك «المنتقي» (Picker) كما في الماك: القائمة تنفتح فوق زرّها
// لا تحته، والبند الحالي معلَّم بصحّ ومميَّز عند الفتح.
//
// مشتركة بين نافذة الإعدادات وورقة «اربط نموذجًا» في النافذة الرئيسية، فلا
// تُكتب مرتين ولا تنحرف إحداهما عن الأخرى. لا تعرف إعدادًا ولا مزوّدًا: تأخذ
// بنودًا وتعيد القيمة المختارة.
(() => {
  // كل قائمة ومرساتها: النافذة قد تحمل أكثر من منتقٍ، والمفتوح منها واحد
  function attach(menu) {
    let openPicker = null;

    // الإغلاق يعيد التركيز إلى زرّه إلا حين يكون سببه نقرة في مكان آخر:
    // النقرة تعرف أين تذهب
    function close(returnFocus = true) {
      menu.hidden = true;
      menu.replaceChildren();
      if (openPicker) {
        openPicker.setAttribute("aria-expanded", "false");
        if (returnFocus) openPicker.focus();
        openPicker = null;
      }
    }

    function open(picker, items, current, onPick) {
      // النقر على زرّ قائمته مفتوحة يغلقها، كما في الماك
      if (openPicker === picker) {
        close();
        return;
      }
      close();
      openPicker = picker;
      picker.setAttribute("aria-expanded", "true");
      for (const item of items) {
        if (item.separator) {
          const line = document.createElement("div");
          line.className = "picker-menu-separator";
          menu.append(line);
          continue;
        }
        const button = document.createElement("button");
        button.type = "button";
        button.className = "picker-menu-item";
        button.setAttribute("role", "menuitemradio");
        const active = item.value === current;
        button.setAttribute("aria-checked", String(active));
        if (active) button.dataset.active = "true";
        const label = document.createElement("span");
        label.textContent = item.label;
        const check = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
        use.setAttribute("href", "#checkmark.16m");
        check.append(use);
        check.setAttribute("aria-hidden", "true");
        button.append(label, check);
        button.addEventListener("click", () => {
          close();
          onPick(item.value);
        });
        menu.append(button);
      }
      menu.hidden = false;
      picker.setAttribute("aria-controls", menu.id);
      const rect = picker.getBoundingClientRect();
      // القائمة بعرض زرّها على الأقل (Select 26:420 وقائمته ٢٢٠)، وحافتها الأولى على حافته.
      // الموضع فيزيائي (left) محسوبٌ ومحصور داخل النافذة: inset-inline-start على عنصرٍ ثابت
      // وضعته WebKit من اليسار ففاضت القائمة خارج النافذة في التطبيق الحقيقي (فحص m7-02،
      // وكان m6-18 قد قاسه في Chromium وحده)
      menu.style.minInlineSize = `${Math.round(rect.width)}px`;
      const box = menu.getBoundingClientRect();
      const top = Math.min(Math.max(4, rect.top - 4), window.innerHeight - box.height - 4);
      const rtl = getComputedStyle(picker).direction === "rtl";
      const wanted = rtl ? rect.right - box.width : rect.left;
      const left = Math.min(Math.max(4, wanted), window.innerWidth - box.width - 4);
      menu.style.insetBlockStart = `${top}px`;
      menu.style.insetInlineStart = "auto";
      menu.style.left = `${left}px`;
      // التركيز على البند الحالي، وإلا فالأول: قائمة محدِّدات في querySelector تعيد الأسبق في
      // الشجرة لا الأسبق في القائمة، فكان التركيز يقع على البند الأول دائمًا
      (menu.querySelector(".picker-menu-item[data-active='true']") ?? menu.querySelector(".picker-menu-item"))?.focus();
    }

    // تنقّل القوائم كما في الماك: الأسهم بين البنود، وHome/End إلى طرفيها
    menu.addEventListener("keydown", (e) => {
      const items = [...menu.querySelectorAll(".picker-menu-item")];
      if (!items.length) return;
      const at = items.indexOf(document.activeElement);
      const go = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: items.length - 1 }[e.key];
      if (go === undefined) return;
      e.preventDefault();
      items[(go + items.length) % items.length].focus();
    });

    // Esc يغلقها، ولكن ترتيبه بيد النافذة: النافذة الرئيسية لها سلّم إغلاق
    // (registerEscapeCloser) والقائمة أعلاه من الورقة تحتها، والإعدادات
    // تكفيها مستمعة واحدة. فتُصدَّر isOpen وclose وتُترك الأولوية لصاحبها
    document.addEventListener("pointerdown", (e) => {
      if (!menu.hidden && !menu.contains(e.target) && !openPicker?.contains(e.target)) close(false);
    });

    return { open, close, isOpen: () => !menu.hidden };
  }

  // Inline Status 27:1029 — تسميةٌ ثم علامتها بلون الحالة: ✓ للنجاح، ورمز التحذير للتحذير
  // والخطأ، ورمز المعلومة، ودوّارٌ أثناء العمل. رسالةٌ فارغة تُخفيه
  const STATUS_MARKS = { success: "✓", warning: "􀇾", danger: "􀇾", info: "􀅴" };
  function setStatus(node, message, tone = "success") {
    if (!message) {
      node.hidden = true;
      return;
    }
    node.querySelector(".row-status-label").textContent = message;
    const mark = node.querySelector(".row-status-mark");
    mark.textContent = STATUS_MARKS[tone] ?? "";
    mark.classList.toggle("sf", tone !== "success" && tone !== "loading");
    mark.classList.toggle("spinner", tone === "loading");
    node.dataset.tone = tone;
    node.hidden = false;
  }

  window.NasaqForms = { attachPicker: attach, setStatus };
})();
