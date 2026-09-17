// المظهر — خيار واحد بثلاث قيم تتقاسمه نوافذ التطبيق كلها.
// «تلقائي» يترك light-dark() تتبع النظام (بلا سمة على الجذر)، و«فاتح»/«داكن»
// يثبّتان data-appearance فيثبّت tokens.css عليها color-scheme.
// لا يعرف برجًا ولا عقدًا.
window.NasaqAppearance = (() => {
  const VALUES = ["light", "dark", "auto"];
  const LABELS = { auto: "تلقائي", light: "فاتح", dark: "داكن" };

  const systemDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function systemPrefersDark() {
    return Boolean(systemDark && systemDark.matches);
  }

  // الوضع الليلي فعّال؟ «تلقائي» يسأل النظام، وإلا فالاختيار الصريح
  function isDark(choice) {
    return choice === "dark" || (choice === "auto" && systemPrefersDark());
  }

  // قيمة لا يعرفها المظهر تعود إلى «تلقائي» بدل أن تترك النافذة بلا مخطط
  function apply(choice) {
    const value = VALUES.includes(choice) ? choice : "auto";
    const root = document.documentElement;
    if (value === "auto") root.removeAttribute("data-appearance");
    else root.setAttribute("data-appearance", isDark(value) ? "dark" : "light");
    return value;
  }

  // تبدّل مظهر النظام أثناء التشغيل يتبعه التطبيق ما دام الاختيار «تلقائي» —
  // addListener بديل الإصدارات الأقدم من WebKit عن addEventListener
  function followSystem(currentChoice) {
    if (!systemDark) return;
    const react = () => {
      if (currentChoice() === "auto") apply("auto");
    };
    if (systemDark.addEventListener) systemDark.addEventListener("change", react);
    else if (systemDark.addListener) systemDark.addListener(react);
  }

  return { apply, followSystem, isDark, systemPrefersDark, VALUES, LABELS };
})();
