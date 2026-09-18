// rtl-caret.js — مؤشر الكتابة على السطر الفارغ في حقلٍ عربي (المرحلة ٩).
//
// علّة WebKit: في textarea باتجاه rtl يُرسم المؤشر على السطر الفارغ في الجهة
// اليسرى — بعد Enter، وفي سطر فارغ وسط النص — أيًّا كانت خصائص CSS (قيس في
// WKWebView: unicode-bidi وtext-align وtext-align-last وwhite-space، وفي
// contenteditable أيضًا). النص نفسه يُكتب يمينًا ما إن يُكتب حرف؛ الخلل في رسم
// المؤشر وحده.
//
// فالعلاج هنا لا يمسّ القيمة ولا الاتجاه: على السطر الفارغ وحده يُخفى المؤشر
// الأصلي، ويُرسم مؤشرٌ في بداية السطر (يمينه) على ارتفاعه، ويومض إيقاع مؤشر
// النظام. وفي غير ذلك يبقى المؤشر الأصلي كما هو. لا شيء هنا يخصّ برجًا.
(() => {
  const BLINK_CLASS = "rtl-caret-blink";
  // خصائص تحدّد التفاف الأسطر، فتنسخها المرآة لتقع الأسطر حيث تقع في الحقل
  const MIRRORED = [
    "boxSizing", "fontFamily", "fontSize", "fontWeight", "fontStyle", "fontFeatureSettings",
    "lineHeight", "letterSpacing", "wordSpacing", "textTransform", "tabSize",
    "whiteSpace", "overflowWrap", "wordBreak", "unicodeBidi", "direction",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
  ];

  // على سطر فارغ: المؤشر مطويّ، وقبله بداية النص أو فاصل سطر، وبعده نهايته أو فاصل
  function onEmptyLine(field) {
    const at = field.selectionStart;
    if (at !== field.selectionEnd || !field.value) return false;
    const before = at === 0 || field.value[at - 1] === "\n";
    const after = at === field.value.length || field.value[at] === "\n";
    return before && after;
  }

  function attach(field) {
    const caret = document.createElement("span");
    caret.className = "rtl-caret";
    caret.setAttribute("aria-hidden", "true");
    caret.hidden = true;
    document.body.appendChild(caret);

    const mirror = document.createElement("div");
    mirror.className = "rtl-caret-mirror";
    mirror.setAttribute("aria-hidden", "true");
    document.body.appendChild(mirror);

    let frame = 0;

    function hide() {
      caret.hidden = true;
      field.style.caretColor = "";
    }

    function place() {
      frame = 0;
      if (document.activeElement !== field || field.disabled || !onEmptyLine(field)) {
        hide();
        return;
      }
      const style = getComputedStyle(field);
      for (const prop of MIRRORED) mirror.style[prop] = style[prop];
      mirror.style.width = `${field.clientWidth + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth)}px`;
      mirror.style.whiteSpace = "pre-wrap";

      // النص حتى المؤشر، ثم علامة بعرض صفر: موضعها العمودي موضع السطر الفارغ
      mirror.textContent = field.value.slice(0, field.selectionStart);
      const marker = document.createElement("span");
      marker.textContent = "​";
      mirror.appendChild(marker);

      const box = field.getBoundingClientRect();
      const top = marker.getBoundingClientRect().top - mirror.getBoundingClientRect().top;
      const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;
      const inlineStart = box.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);

      caret.style.top = `${box.top + top - field.scrollTop}px`;
      caret.style.left = `${inlineStart - 2}px`;
      caret.style.height = `${lineHeight}px`;
      caret.style.backgroundColor = style.color;
      field.style.caretColor = "transparent";
      caret.hidden = false;

      // الوميض يبدأ من الظهور مع كل حركة، كمؤشر النظام
      caret.classList.remove(BLINK_CLASS);
      void caret.offsetWidth;
      caret.classList.add(BLINK_CLASS);
    }

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };

    for (const type of ["input", "focus", "keyup", "mouseup", "select"]) field.addEventListener(type, schedule);
    field.addEventListener("blur", hide);
    document.addEventListener("selectionchange", schedule);
    document.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
  }

  const api = { attach, onEmptyLine };
  if (typeof window !== "undefined") window.NasaqRtlCaret = api;
  if (typeof module !== "undefined") module.exports = api;
})();
