// اختبارات حارسة للعزل الأمامي — يعمل بـ: npm test
// تفحص نصوص المصدر نفسها: ترتيب التحميل، حدود الملكية بين القشرة والوضع،
// خمود هيكل شَذْب، واكتمال دوال نسق بعد انقسام main.js، ومناطق كل برج في
// هيكل النافذة — فأي انزلاق مستقبلي في قواعد العزل يفشل هنا قبل أن يصل الواجهة
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const srcPath = (name) => path.join(__dirname, "..", "src", name);
const src = (name) => fs.readFileSync(srcPath(name), "utf8");
const html = src("index.html");
const layout = src("layout.js");
const shell = src("shell.js");
const nasaq = src("nasaq.js");
const shadhb = src("shadhb.js");
const css = src("app.css");
// نوافذ المرحلة ٥ الثانوية
const settingsHtml = src("settings.html");
const settingsJs = src("settings.js");
const aboutHtml = src("about.html");
const secondaryJs = src("secondary.js");
// وحدات المرحلة ٦: المشترك بين النافذتين، وتدفّقا أول تشغيل والتحديث
const providersJs = src("providers.js");
const formsJs = src("forms.js");
const onboardingJs = src("onboarding.js");
const updatesJs = src("updates.js");

test("ترتيب التحميل: الهيكل فالقشرة قبل نسق، وشَذْب أخيرًا، وmain.js زال", () => {
  const order = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.deepStrictEqual(order, [
    "lines.js",
    "drafts-model.js",
    "fragments.js",
    "substack-markers.js",
    "prune.js",
    "appearance.js",
    "layout.js",
    "shell.js",
    "providers.js",
    "forms.js",
    "onboarding.js",
    "updates.js",
    "nasaq.js",
    "shadhb.js",
  ]);
  assert.ok(!fs.existsSync(srcPath("main.js")), "main.js ما زال موجودًا");
});

test("القشرة لا تعرف نداءات نسق النموذجية ولا تنادي دوال الوضع باسمها", () => {
  for (const marker of ['invoke("format_text"', 'invoke("generate_variation"', 'invoke("adjust_lines"']) {
    assert.ok(!shell.includes(marker), `القشرة تحوي ${marker}`);
  }
  // الاستعادة عبر التسجيل حصرًا — لا نداء مباشرًا لدالة نسق من القشرة
  assert.ok(!shell.includes("restoreDraft(mother"), "القشرة تنادي restoreDraft مباشرة");
  assert.ok(shell.includes("requestRestore(mother, version)"));
});

test("نسق لا يشير إلى هيكل شَذْب ولا يستهلك واجهته", () => {
  assert.ok(!/NasaqShadhb|shadhb/i.test(nasaq), "nasaq.js يشير إلى shadhb");
  assert.ok(!nasaq.includes("NasaqPrune"), "nasaq.js يستهلك المقص — ليس من شأنه");
});

test("وضع شَذْب مدروع ومنضبط: درع، بوابة، نداء نواة وحيد، ولا عقد في الواجهة", () => {
  assert.ok(shadhb.includes("try {") && shadhb.includes("} catch"), "لا درع try/catch");
  assert.ok(shadhb.includes("shadhbEnabled !== true"), "لا بوابة مفتاح");
  // النداء الوحيد المسموح: prune_text — أوامر نسق والتخزين محظورة عليه
  assert.ok(shadhb.includes('invoke("prune_text"'), "نداء الفحص غائب");
  for (const banned of [
    'invoke("format_text"',
    'invoke("generate_variation"',
    'invoke("adjust_lines"',
    'invoke("save_drafts"',
    'invoke("save_settings"',
    'invoke("export_drafts"',
  ]) {
    assert.ok(!shadhb.includes(banned), `شَذْب ينادي ${banned}`);
  }
  assert.ok(!/temperature|prompt/i.test(shadhb), "أثر عقد نموذج في الواجهة");
});

test("شَذْب لا يلمس دواخل نسق ولا يكتب في الخانة إلا عبر الجسر", () => {
  // دوال نسق وحالته محظورة بالاسم — الوصلة الوحيدة واجهة القشرة والمقص
  assert.ok(
    !/formatText|recordSessionVersion|lastFormatMeta|sessionVersions|adjustLines|outputUndoStack|syncResultTools/.test(shadhb),
    "شَذْب يلمس دواخل نسق"
  );
  // القراءة من الخانة مسموحة، والكتابة عبر sendToNasaq حصرًا
  assert.ok(!/inputText\.value\s*=/.test(shadhb), "شَذْب يكتب في الخانة مباشرة");
  assert.ok(shadhb.includes("shell.sendToNasaq("), "الجسر الوحيد غير مستعمل");
  const bridgeUses = (shadhb.match(/sendToNasaq/g) || []).length;
  assert.ok(bridgeUses >= 1, "لا عبور عبر الجسر");
});

test("المفتاح في القشرة صمّام إطفاء يعمل التطبيق بعده على نَسَق وحده", () => {
  assert.ok(shell.includes("readShadhbFlag()"), "المفتاح لا يُقرأ من دالته");
  assert.ok(shell.includes('"off"'), "مسار الإطفاء غائب");
  assert.ok(shell.includes("sendToNasaq"), "الجسر غائب من القشرة");
  // الوعد بالعودة إلى «واجهة v4.3 حرفيًا» زال، وحلّ محله تعريف المفتاح الفعلي
  assert.ok(!/v4\.3/.test(shell), "الوعد بواجهة v4.3 باقٍ في القشرة");
  assert.ok(/يعمل التطبيق على نَسَق وحده/.test(shell), "تعريف المفتاح الجديد غائب عن القشرة");
  assert.ok(!/v4\.\d|v5\.\d/.test(shadhb), "وسم جيل سابق باقٍ في shadhb.js");
  // المبدّل مخفي في الهيكل — شَذْب وحده يُظهره حين يكون المفتاح مفعَّلًا
  assert.ok(/<div id="mode-switch"[^>]*hidden>/.test(html), "المبدّل ليس مخفيًا افتراضيًا");
});

test("لا إعلانات عليا مكررة بين القشرة ونسق — التكرار يقتل الملف الثاني", () => {
  const names = (code) =>
    [...code.matchAll(/^(?:const|let|(?:async )?function)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]);
  const shellNames = new Set(names(shell));
  const dup = names(nasaq).filter((n) => shellNames.has(n));
  assert.deepStrictEqual(dup, [], `إعلانات مكررة: ${dup.join(", ")}`);
});

test("اكتمال نسق بعد الانقسام: كل دوال الوضع الجوهرية حاضرة في nasaq.js", () => {
  for (const fn of [
    "formatText",
    "cleanOnly",
    "adjustLines",
    "splitSentences",
    "cleanEmptyLines",
    "adoptTurnForm",
    "adoptVariation",
    "generateVariations",
    "openReadingLens",
    "restoreDraft",
    "recordSessionVersion",
    "resetSession",
    "pushOutputUndo",
    "undoOutput",
    "syncPlatformLimitWarning",
    "syncResultTools",
    "currentSelection",
  ]) {
    assert.ok(new RegExp(`function ${fn}\\(`).test(nasaq), `دالة ${fn} غائبة عن nasaq.js`);
  }
});

test("اكتمال القشرة: البنية المشتركة والوصلات المسجلة حاضرة في shell.js", () => {
  for (const fn of [
    "showToast",
    "showError",
    "copyText",
    "renderAppearance",
    "renderDrafts",
    "persistDrafts",
    "depositDraftVersions",
    "configureDraftsDisplay",
    "registerRestoreHandler",
    "registerEscapeCloser",
  ]) {
    assert.ok(new RegExp(`function ${fn}\\(`).test(shell), `دالة ${fn} غائبة عن shell.js`);
  }
  assert.ok(shell.includes("window.NasaqShell = {"), "واجهة القشرة الرسمية غائبة");
});

test("عزل أبراج النواة: لا استيراد متبادل ولا تسرب ثوابت ولا عقد في الأساس", () => {
  const rust = (name) => fs.readFileSync(path.join(__dirname, "..", "src-tauri", "src", name), "utf8");
  const nasaqRs = ["nasaq/mod.rs", "nasaq/contracts.rs", "nasaq/commands.rs", "nasaq/tests.rs"].map(rust).join("\n");
  assert.ok(!/shadhb|PRUNE_/.test(nasaqRs), "برج نسق يشير إلى برج التشذيب");
  const shadhbRs = ["shadhb/mod.rs", "shadhb/contracts.rs", "shadhb/verify.rs", "shadhb/commands.rs"].map(rust).join("\n");
  assert.ok(!/nasaq::|CREATIVE_TEMPERATURE|VARIATIONS_|FORMAT_THINKING_BUDGET/.test(shadhbRs), "برج التشذيب يستهلك ثوابت نسق");
  const sharedRs = ["shared/mod.rs", "shared/llm.rs", "shared/settings.rs", "shared/drafts.rs", "shared/clipboard.rs"].map(rust).join("\n");
  assert.ok(!/أنت «|قواعد القصّ|نمط التنسيق:/.test(sharedRs), "عقد تسرب إلى الأساس المشترك");
});

test("نسق يسجّل وصلاته الأربع لدى القشرة", () => {
  assert.ok(nasaq.includes("configureDraftsDisplay({ versionTypeOf: versionType, typeOrder: TYPE_ORDER })"));
  assert.ok(nasaq.includes("registerRestoreHandler(restoreDraft)"));
  assert.ok(nasaq.includes("registerEscapeCloser(() => !variationsOverlay.hidden, closeVariations)"));
  assert.ok(nasaq.includes("registerEscapeCloser(() => !readingLensOverlay.hidden, closeReadingLens)"));
});

// ---------- حرّاس صياغات شَذْب ----------
// حالتا الفراغ مفترقتان جوهريًا، وشرط «بعد التشذيب» — كلاهما صار حالة مرسومة

test("شَذْب: حالتا الفراغ مفترقتان — لا قصّات ≠ استُبعدت كل القصّات", () => {
  assert.ok(shadhb.includes("لم يجد شَذْب موضع حذف آمن في هذه الشذرة."), "حالة اللا-اقتراحات غائبة");
  assert.ok(
    html.includes("لم يجد شَذْب موضع حذف آمن في هذه الشذرة، ونصّك كما هو."),
    "ملاحظة «لا قصّات» غائبة عن الهيكل"
  );
  assert.ok(shadhb.includes("تعذّر التحقق من القصّات"), "حالة الإسقاط الكامل غائبة");
  // «مُحكَمة كما هي» كانت تدّعي حكمًا أدبيًا سببه الفعلي فشل التحقق
  assert.ok(!shadhb.includes("مُحكَمة كما هي"), "الصياغة القديمة ما زالت في shadhb.js");
  // الحالتان تفترقان على عدّاد الإسقاط — الفارق الجوهري لا الشكلي
  assert.ok(/cuts\.length === 0 && dropped > 0/.test(shadhb), "التمييز بعدّاد الإسقاط غائب");
});

test("شَذْب: «بعد التشذيب» مشروط بحذف فعلي", () => {
  assert.ok(/status === "cut"/.test(shadhb), "شرط الحذف الفعلي غائب من shadhb.js");
  assert.ok(
    /preview\.textContent = applied > 0 \? state\.currentText : ""/.test(shadhb),
    "«بعد التشذيب» يظهر بلا حذف فعلي"
  );
});

// ---------- حرّاس هيكل النافذة (المرحلة 2 — Figma nasq-v10) ----------
// محلّل وسوم صغير: لكل معرّف سلسلة أسلافه، فيُعرف في أي منطقة من النافذة
// يقع وأي برج يملكه (data-for)
const VOID = new Set(["meta", "link", "input", "br", "img", "hr", "use", "path"]);
function regionsById(markup) {
  const stack = [];
  const out = {};
  const clean = markup.replace(/<!--[\s\S]*?-->/g, "");
  for (const m of clean.matchAll(/<(\/?)([a-zA-Z0-9-]+)([^>]*?)(\/?)>/g)) {
    const [, closing, tag, attrs, selfClosing] = m;
    const name = tag.toLowerCase();
    if (closing) {
      const i = stack.map((n) => n.name).lastIndexOf(name);
      if (i !== -1) stack.length = i;
      continue;
    }
    const attr = (a) => (new RegExp(`\\s${a}="([^"]*)"`).exec(attrs) || [])[1];
    const node = { name, id: attr("id"), cls: attr("class") || "", dataFor: attr("data-for") };
    if (node.id) {
      const chain = [...stack, node];
      out[node.id] = {
        owner: [...chain].reverse().find((n) => n.dataFor)?.dataFor ?? null,
        within: chain.map((n) => n.id).filter(Boolean),
        classes: chain.map((n) => n.cls).join(" "),
      };
    }
    if (!selfClosing && !VOID.has(name)) stack.push(node);
  }
  return out;
}
const regions = regionsById(html);

test("الهيكل: كل برج في مناطقه، وCSS لا يُظهر منطقة برج إلا في وحدته", () => {
  assert.ok(/<html[^>]*\sdata-module="nasaq"/.test(html), "الجذر لا يبدأ على نسق");
  const owners = new Set([...html.matchAll(/data-for="([^"]+)"/g)].map((m) => m[1]));
  assert.deepStrictEqual([...owners].sort(), ["nasaq", "shadhb"]);
  assert.ok(
    /:root:not\(\[data-module="shadhb"\]\) \[data-for="shadhb"\],\s*\[data-module="shadhb"\] \[data-for="nasaq"\]\s*\{\s*display:\s*none !important;/.test(css),
    "إخفاء منطقة البرج الآخر ليس بقيادة data-module"
  );
  for (const id of ["format-btn", "copy-btn", "undo-btn", "save-draft-btn", "output-text", "output-placeholder", "drafts-list", "notes-box", "fragment-card", "output-search-bar"]) {
    assert.strictEqual(regions[id]?.owner, "nasaq", `${id} ليس في منطقة نسق`);
  }
  for (const id of ["prune-btn", "send-to-nasaq-btn", "copy-pruned-btn", "cuts-list", "cuts-count", "reading-card", "covenant-bar", "outcome-covenant", "cut-card", "prune-preview", "shard-marks", "shadhb-placeholder", "shadhb-status", "shadhb-count"]) {
    assert.strictEqual(regions[id]?.owner, "shadhb", `${id} ليس في منطقة شَذْب`);
  }
  // المشترك وحده بلا مالك: خانة النص والمبدّل والرسائل
  for (const id of ["input-text", "mode-switch", "error-bar", "toast", "input-count"]) {
    assert.strictEqual(regions[id]?.owner, null, `${id} صار ملكًا لبرج`);
  }
});

test("الهيكل: فعل شَذْب وجسره في شريط الأدوات، والضمانة في المفتّش — خارج منطقة التمرير", () => {
  for (const id of ["prune-btn", "send-to-nasaq-btn"]) {
    assert.ok(regions[id].within.includes("toolbar"), `${id} ليس في شريط الأدوات`);
  }
  assert.ok(regions["covenant-bar"].within.includes("inspector"), "الضمانة ليست في المفتّش");
  for (const id of ["prune-btn", "send-to-nasaq-btn", "covenant-bar"]) {
    assert.ok(!regions[id].within.includes("scroll-view"), `${id} داخل منطقة التمرير`);
  }
  assert.ok(regions["prune-preview"].classes.includes("column-result"), "«بعد التشذيب» ليس عمود النتيجة");
  assert.ok(/<h2 class="column-header">بعد التشذيب<\/h2>/.test(html), "عنوان عمود «بعد التشذيب» غائب");
});

test("الهيكل: data-module يكتبه شَذْب وحده، والهيكل لا يعرف برجًا ولا ينادي النواة إلا للجاهزية", () => {
  const writesModule = /setAttribute\("data-module"|dataset\.module\s*=/;
  assert.ok(writesModule.test(shadhb), "شَذْب لا يبدّل الوحدة");
  for (const [name, code] of [["layout.js", layout], ["shell.js", shell], ["nasaq.js", nasaq]]) {
    assert.ok(!writesModule.test(code), `${name} يكتب data-module`);
  }
  assert.ok(!/formatText|prune_text|format_text|NasaqShell|NasaqShadhb|NasaqPrune|registerEscapeCloser/.test(layout), "الهيكل يعرف دواخل برج أو قشرة");
  const calls = [...layout.matchAll(/invoke\("([^"]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(calls, ["main_window_ready"]);
  // لا إعلان عام يزاحم القشرة أو نسق في النطاق المشترك
  assert.ok(/^\(\(\) => \{/m.test(layout) && !/^(?:const|let|var|function)\s/m.test(layout), "الهيكل خارج غلافه");
});

test("لا أثر للهوية القديمة: لا عبارات ولا ملفات ولا ألوان مثبتة", () => {
  for (const phrase of ["البوابة الأخيرة قبل النشر", "لا نكتب عنك أبدًا", "من أعمال سلطان"]) {
    for (const [name, code] of [["index.html", html], ["shell.js", shell], ["nasaq.js", nasaq], ["shadhb.js", shadhb]]) {
      assert.ok(!code.includes(phrase), `«${phrase}» في ${name}`);
    }
  }
  for (const gone of ["styles.css", "spike-chrome.html", "spike-chrome.css", "spike-chrome.js"]) {
    assert.ok(!fs.existsSync(srcPath(gone)), `${gone} ما زال موجودًا`);
    assert.ok(!html.includes(gone), `index.html يشير إلى ${gone}`);
  }
  assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(css.replace(/\/\*[\s\S]*?\*\//g, "")), "لون مثبت في app.css بدل التوكنز");
  // لا ترسم الواجهة أيقونات بيدها: كلها من icons.svg
  for (const [name, code] of [["index.html", html], ["shadhb.js", shadhb], ["nasaq.js", nasaq]]) {
    assert.ok(!/<path|<polyline|<circle|<line /.test(code), `رسم يدوي في ${name}`);
  }
});

// ---------- حرّاس المرحلة ٣ — نَسَق كاملًا (Figma nasq-v10، 100:542 و259:6139) ----------
// الأوراق والتنبيهات والنوافذ المنبثقة أدوارها صريحة وخارج #window، ولكل حالة من
// حالات نَسَق عنصرها، والحالة تكتبها آلة الحالات لا يشتقها CSS، والتنبيه لصاحبه،
// والأرقام هندية

// الوسم الافتتاحي لعنصر بمعرّفه أيًّا كان ترتيب خصائصه
const openTag = (id) => ([...html.matchAll(/<[a-z][^>]*>/g)].map((m) => m[0]).find((t) => new RegExp(`\\sid="${id}"`).test(t)) || "");
const functionBody = (code, name) => {
  const start = code.indexOf(`function ${name}(`);
  if (start === -1) return "";
  let depth = 0;
  for (let i = code.indexOf("{", start); i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}" && --depth === 0) return code.slice(start, i + 1);
  }
  return "";
};

test("المرحلة ٣: الورقة والتنبيه والنافذة المنبثقة بأدوارها وخارج النافذة", () => {
  for (const id of ["variations-sheet", "delete-alert", "reading-lens"]) {
    assert.ok(regions[id], `${id} غائب`);
    assert.strictEqual(regions[id].owner, "nasaq", `${id} ليس في منطقة نسق`);
    assert.ok(!regions[id].within.includes("window"), `${id} داخل #window فلا يخمل ما تحته`);
  }
  assert.match(openTag("variations-sheet"), /class="sheet"/);
  assert.match(openTag("variations-sheet"), /role="dialog"/);
  assert.match(openTag("variations-sheet"), /aria-modal="true"/);
  assert.match(openTag("delete-alert"), /class="alert"/);
  assert.match(openTag("delete-alert"), /role="alertdialog"/);
  assert.match(openTag("delete-alert"), /aria-modal="true"/);
  // النافذة المنبثقة عابرة لا تحبس النافذة
  assert.match(openTag("reading-lens"), /class="popover"/);
  assert.match(openTag("reading-lens"), /role="dialog"/);
  assert.doesNotMatch(openTag("reading-lens"), /aria-modal/);
  // تُعرض عبر واجهة الهيكل لا بإظهار عنصر داخل الصفحة
  assert.ok(nasaq.includes("window.NasaqWindow.presentModal(variationsOverlay"), "الورقة لا تُعرض كورقة");
  assert.ok(nasaq.includes("window.NasaqWindow.presentPopover(readingLensOverlay"), "العدسة لا تُعرض كنافذة منبثقة");
  assert.ok(shell.includes("window.NasaqWindow.presentModal(deleteAlert"), "تأكيد الحذف لا يُعرض كتنبيه");
  for (const fn of ["openMenu", "openMenuAt", "presentModal", "dismissModal", "presentPopover", "dismissPopover", "isModalOpen"]) {
    assert.ok(new RegExp(`window\\.NasaqWindow = \\{[^}]*\\b${fn}\\b`).test(layout), `الهيكل لا يعرض ${fn}`);
  }
});

test("المرحلة ٣: لا نافذة منبثقة داخل الصفحة لنَسَق، ولا حذف على خطوتين", () => {
  // لا طبقة داخل الصفحة بعد المرحلة ٥: الإعدادات و«حول» نافذتان من النظام
  assert.ok(!/\binterim-overlay\b/.test(html) && !/\binterim-/.test(css), "طبقة مؤقتة باقية");
  for (const gone of ["settings-overlay", "settings-title", "close-settings"]) {
    assert.ok(!html.includes(gone) && !shell.includes(gone), `${gone} باقٍ`);
  }
  for (const gone of ["variations-overlay", "reading-lens-overlay", "interim-sheet-wide", "interim-lens", "variation-col", "adopt-btn"]) {
    assert.ok(!html.includes(gone) && !css.includes(gone) && !nasaq.includes(gone), `${gone} باقٍ`);
  }
  assert.ok(!/armTwoStepDelete|تأكيد الحذف"/.test(shell), "الحذف على خطوتين باقٍ في القشرة");
  // الخطأ داخل العمود لا شريطًا أعلى المحتوى، وشريط البحث تحت شريط الأدوات لا داخل التمرير
  assert.ok(regions["error-bar"].classes.includes("column-source"), "خانات التنبيه ليست فوق الأصل");
  assert.ok(regions["nasaq-error"].classes.includes("column-result"), "تنبيه نسق ليس في عمود النتيجة");
  assert.ok(!regions["output-search-bar"].within.includes("scroll-view"), "شريط البحث داخل منطقة التمرير");
});

test("المرحلة ٣: لكل حالة من حالات نَسَق عنصرها وتسميتها", () => {
  const labels = {
    empty: "لم يُنسَّق بعد",
    processing: "جارٍ التنسيق…",
    result: "منسَّق",
    review: "بانتظار اختيارك",
    error: "تعذّر التنسيق",
  };
  const stateFn = functionBody(nasaq, "nasaqState");
  assert.ok(stateFn, "آلة الحالات nasaqState غائبة");
  for (const [state, label] of Object.entries(labels)) {
    assert.ok(nasaq.includes(`${state}: "${label}"`), `حالة ${state} بلا تسميتها «${label}»`);
    assert.ok(stateFn.includes(`"${state}"`), `nasaqState لا تبلغ حالة ${state}`);
  }
  // فارغة: حالة البداية، أثناء التنسيق: هيكل نائب ومؤشر، نتيجة، مراجعة: بطاقتان، خطأ: تنبيه بفعل
  assert.strictEqual(regions["output-placeholder"].owner, "nasaq");
  assert.ok(regions["loading"].classes.includes("result-progress"), "لا هيكل نائب للنتيجة");
  const progress = html.slice(html.indexOf('id="loading"'), html.indexOf('id="output-text"'));
  assert.strictEqual((progress.match(/class="skeleton-line"/g) || []).length, 6, "الهيكل النائب ليس ستة أسطر");
  assert.ok(progress.includes('class="spinner spinner-16"'), "لا مؤشر في سطر التقدّم");
  assert.strictEqual(regions["output-text"].owner, "nasaq");
  for (const id of ["turn-card-broken", "turn-card-joined", "adopt-broken", "adopt-joined", "revert-broken", "revert-joined"]) {
    assert.ok(regions[id]?.within.includes("fragment-card"), `${id} ليس في قسم المراجعة`);
  }
  for (const id of ["nasaq-error", "nasaq-error-source"]) {
    const slot = html.slice(html.indexOf(`id="${id}"`), html.indexOf(`id="${id}"`) + 1200);
    assert.ok(/data-error-action/.test(slot), `${id} بلا فعل`);
    assert.strictEqual(regions[id]?.owner, "nasaq", `${id} ليس لنسق`);
  }
  assert.ok(nasaq.includes('action: { label: "أعد المحاولة", run: formatText }'), "«أعد المحاولة» لا تعيد التنسيق");
  // «نسّق» بحالة تحميل، والتقرير بهيكله النائب، والمؤشر في شريط الحالة
  assert.match(openTag("format-btn"), /data-style="glass"/);
  assert.ok(nasaq.includes('formatBtn.dataset.style = hasText && !hasResult ? "primary" : "glass";'), "«نسّق» المعطّل مسطح غائر لا زجاجي");
  assert.ok(regions["report-skeleton"]?.within.includes("report-section"), "لا هيكل نائب للتقرير");
  assert.strictEqual(regions["nasaq-status"]?.owner, "nasaq");
  assert.ok(nasaq.includes('formatBtn.setAttribute("aria-busy", String(busy))'), "«نسّق» بلا حالة تحميل");
});

test("المرحلة ٣: حالة نَسَق صريحة من آلة الحالات لا مشتقة بـ :has", () => {
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/[^{}]*:has\([^{]*\{/g)].map((m) => m[0].trim());
  for (const rule of rules) {
    assert.ok(
      !/output-text|#loading|polish-status|nasaq|#toast|input-count|output-count|stacked-row|row-value/.test(rule),
      `اشتقاق بـ :has باقٍ: ${rule}`
    );
  }
  assert.ok(/document\.documentElement\.dataset\.nasaqState = state/.test(nasaq), "آلة الحالات لا تكتب data-nasaq-state");
  for (const [name, code] of [["shell.js", shell], ["layout.js", layout], ["shadhb.js", shadhb]]) {
    assert.ok(!/nasaqState\s*=|setAttribute\(\s*"data-nasaq-state"/.test(code), `${name} يكتب حالة نسق`);
  }
  // القشرة لا تنادي دوال نسق باسمها
  assert.ok(!/\b(renderState|undoOutput|formatText|adoptTurnForm|generateVariations|openReadingLens|retryVariation|revertTurnDecision)\(/.test(shell), "القشرة تنادي دالة نسق");
});

test("المرحلة ٣: التنبيه لصاحبه — لا يعبر من برج إلى آخر", () => {
  // خانات كل برج معلَّمة به، والحاوية المشتركة فوق الأصل لا تملك خانة بلا صاحب
  const slots = [...html.matchAll(/<div[^>]*\bdata-error-slot\b[^>]*>/g)].map((m) => m[0]);
  assert.ok(slots.length >= 4, "خانات التنبيه ناقصة");
  const slotOwners = [...html.matchAll(/<div([^>]*\bdata-error-slot\b[^>]*)>/g)].map((m) => {
    const index = m.index;
    const idMatch = /\sid="([^"]+)"/.exec(m[1]);
    if (idMatch) return regions[idMatch[1]].owner;
    const ownDataFor = /\sdata-for="([^"]+)"/.exec(m[1]);
    if (ownDataFor) return ownDataFor[1];
    // خانة بلا معرّف ولا data-for: صاحبها أقرب سلف معلَّم
    const before = html.slice(0, index);
    const opened = [...before.matchAll(/data-for="([^"]+)"/g)].map((x) => x[1]);
    return opened.at(-1) || null;
  });
  assert.ok(!slotOwners.includes(null), "خانة تنبيه بلا صاحب");
  assert.ok(/showError\(msg, \{ note = "", action = null, owner = activeProduct\(\) \} = \{\}\)/.test(shell), "التنبيه لا يعرف صاحبه");
  assert.ok(/const errorSlotsOf = \(owner\) =>/.test(shell), "التنبيه لا يُكتب في خانات صاحبه وحده");
  assert.ok(shell.includes('showError: (msg, options = {}) => showError(msg, { ...options, owner: "shadhb" })'), "واجهة شَذْب لا تحمل صاحبها");
  assert.ok(shell.includes('clearError: () => clearError("shadhb")'), "واجهة شَذْب تمحو تنبيه غيرها");
  const nasaqShows = [...nasaq.matchAll(/showError\(([^;]*?)\);/gs)].map((m) => m[1]);
  assert.ok(nasaqShows.length > 0 && nasaqShows.every((args) => args.includes('owner: "nasaq"')), "نسق يعرض تنبيهًا بلا صاحبه");
  const nasaqClears = [...nasaq.matchAll(/clearError\(([^)]*)\)/g)].map((m) => m[1]);
  assert.ok(nasaqClears.length > 0 && nasaqClears.every((arg) => arg === '"nasaq"'), "نسق يمحو تنبيهًا بلا صاحبه");
  assert.ok(nasaq.includes('e.detail?.owner !== "nasaq"'), "نسق يتبع زوال تنبيهات غيره");
});

test("المرحلة ٣: الاختصارات قرينة أزرارها — لا تعمل تحت ورقة، و⌘Z في الحقل للكتابة", () => {
  const enterHandler = nasaq.slice(nasaq.indexOf('e.key === "Enter"'), nasaq.indexOf("formatText();", nasaq.indexOf('e.key === "Enter"')));
  assert.ok(enterHandler.includes("isModalOpen()"), "⌘↩ يعمل تحت ورقة مفتوحة");
  assert.ok(/\{ keys: \{ meta: true, code: "KeyZ" \}, button: undoBtn, run: undoOutput, outsideFields: true \}/.test(nasaq), "⌘Z يسرق تراجع الكتابة");
  assert.ok(/if \(s\.outsideFields && editable\(e\.target\)\) return;/.test(nasaq), "حارس الحقول غائب عن الاختصارات");
  const shortcutsHandler = nasaq.slice(nasaq.indexOf("const SHORTCUTS = ["));
  assert.ok(shortcutsHandler.includes("formatBtn.offsetParent === null") && shortcutsHandler.includes("isModalOpen()"), "الاختصارات تعمل خارج نسق أو تحت ورقة");
  const settingsHandler = shell.slice(
    shell.indexOf('e.key === ","'),
    shell.indexOf('invoke("open_settings")', shell.indexOf('e.key === ","'))
  );
  assert.ok(settingsHandler.includes("isModalOpen()"), "⌘، يفتح الإعدادات فوق ورقة أو تنبيه");
});

test("المرحلة ٣: الأرقام الهندية في كل ما يعرضه نَسَق والقشرة", () => {
  for (const [name, code] of [["nasaq.js", nasaq], ["shell.js", shell]]) {
    assert.ok(!/toLocaleString\(\s*"ar"\s*\)/.test(code), `${name} يعرض أرقامًا بـ toLocaleString("ar")`);
    assert.ok(!/Intl\.(?:DateTimeFormat|NumberFormat)\(\s*"ar"\s*[,)]/.test(code), `${name} ينسّق بـ "ar" بلا النظام الهندي`);
    assert.ok(!/\$\{DRAFTS_MAX\}/.test(code), `${name} يعرض السقف بأرقام لاتينية`);
  }
  assert.ok(nasaq.includes("${arabicDigits.format(activeIndex + 1)} من ${arabicDigits.format(matches.length)}"), "عدّاد البحث ليس «١ من ٣»");
  assert.ok(nasaq.includes('"لا تطابق"'), "حالة عدم التطابق في البحث غائبة");
  assert.ok(/draftsCountBadge\.textContent = arabicDigits\.format/.test(shell), "شارة العدد ليست بالهندية");
  assert.ok(/new Intl\.DateTimeFormat\("ar-u-nu-arab"/.test(shell), "تواريخ المسودات ليست بالهندية");
  assert.ok(!/opt\.pct \+ "٪"/.test(shell), "نسبة التنزيل بأرقام لاتينية");
});

test("المرحلة ٣: تلميح لكل مستوى تدخل ولكل منصة", () => {
  const block = (name) => (nasaq.match(new RegExp(`const ${name} = \\{([\\s\\S]*?)\\n\\};`)) || [])[1] || "";
  const levelsBlock = (nasaq.match(/const LEVELS = \{([\s\S]*?)\n\};/) || [])[1] || "";
  const levels = [...levelsBlock.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]).filter((k) => k !== "PLATFORM").sort();
  assert.ok(levels.length >= 5, "تعذّرت قراءة LEVELS");
  const levelKeys = [...block("LEVEL_HINTS").matchAll(/\[LEVELS\.(\w+)\]:\s*"[^"]+"/g)].map((m) => m[1]).sort();
  assert.deepStrictEqual(levelKeys, levels);
  const platformKeys = [...block("PLATFORM_HINTS").matchAll(/"([^"]+)":\s*"[^"]+"/g)].map((m) => m[1]);
  const platforms = JSON.parse((nasaq.match(/const PLATFORMS = (\[[^\]]+\]);/) || [])[1]);
  assert.deepStrictEqual(platformKeys, platforms);
});

test("المرحلة ٣: «تنظيف فقط» يعالج المسافة الصلبة والمحارف الخفية كما كان", () => {
  // الدالة تُستخرج من المصدر وتُشغَّل: المسافة الصلبة ضاعت مرة عند إعادة كتابة الملف
  const cleanOnly = new Function(`${functionBody(nasaq, "cleanOnly")}; return cleanOnly;`)();
  assert.strictEqual(cleanOnly("كلمة\u00A0\u00A0\u00A0كلمة"), "كلمة كلمة");
  assert.strictEqual(cleanOnly("نص \u00A0، ثم"), "نص، ثم");
  assert.strictEqual(cleanOnly("a\u200Bb\uFEFFc  d"), "abc d");
  assert.strictEqual(cleanOnly("سطر\n\n\n\nسطر"), "سطر\n\nسطر");
});

test("المرحلة ٣: التصدير لسابستاك وحدها، والنسخ لا يحمل خريطة الرموز من أي طريق", () => {
  assert.ok(nasaq.includes("exportBtn.disabled = !tools || !metaSubstackFace();"), "التصدير يعمل لغير سابستاك");
  assert.ok(nasaq.includes('document.addEventListener("copy"'), "نسخ التحديد لا يمر بالتجريد");
  assert.ok(nasaq.includes('document.addEventListener("dragstart"'), "سحب التحديد إلى خارج النافذة لا يمر بالتجريد");
  assert.ok(nasaq.includes('const MARKED_TEXT = "#output-text, #reading-lens-text, .variation-text";'), "حاويات النص المنسوخ ناقصة");
  const marked = functionBody(nasaq, "markedSelectionText");
  assert.ok(marked.includes("selection.containsNode(node, true)"), "تحديد يمتد إلى النتيجة من خارجها لا يُجرَّد");
  assert.ok(marked.includes("node.offsetParent !== null"), "نتيجة نَسَق المخفية تجرّد نسخ الوحدة الظاهرة");
  assert.ok(marked.includes("stripSubstackMarkers(selection.toString())"), "نسخ التحديد لا يجرّد الرموز");
  assert.ok(nasaq.includes("document.getSelection().containsNode(e.target, true)"), "السحب يعترض عنصرًا غير التحديد");
});

test("المرحلة ٣: ورقة التنويعات تعرض دفعتها للمدخلات نفسها، ولا تنطلق دفعة فوق دفعة جارية", () => {
  assert.ok(!functionBody(nasaq, "closeVariations").includes("variationsBatch"), "الإغلاق يُسقط دفعة نداءاتها مدفوعة");
  const show = functionBody(nasaq, "showVariations");
  assert.ok(show.includes("if (variationStates.length && variationInputsCurrent()) {") && !show.includes("invoke("), "إعادة فتح الورقة للمدخلات نفسها تطلق نداءات");
  assert.ok(nasaq.includes('variationsBtn.addEventListener("click", showVariations);') && nasaq.includes("button: variationsBtn, run: showVariations }"), "«أرِني تنويعات…» يولّد من جديد لمدخلات لها دفعة");
  assert.ok(nasaq.includes('regenBtn.addEventListener("click", generateVariations);'), "«ولّد ثلاثًا جديدة» لا يولّد");
  const generate = functionBody(nasaq, "generateVariations");
  const running = generate.indexOf("if (variationsGenerating()) return;");
  assert.ok(running !== -1 && running < generate.indexOf('invoke("generate_variation"'), "دفعة جديدة تنطلق فوق دفعة جارية");
  assert.ok(
    functionBody(nasaq, "renderState").includes("(variationsGenerating() && !variationInputsCurrent())"),
    "«أرِني تنويعات…» لا ينتظر دفعة جارية لمدخلات غيرها"
  );
});

test("المرحلة ٣: كبسولات الشريط واحدة — فعل كل وحدة بمقاس «نسّق»، والمحدَّد يبقى بحافته", () => {
  assert.match(openTag("prune-btn"), /class="action-button"/, "فعل شَذْب بغير كبسولة الفعل الرئيس");
  assert.ok(!css.includes(".glass-button"), "بقيت كبسولة ثانية بمقاس مختلف");
  const disabled = css.slice(css.indexOf('.action-button:disabled:not([aria-busy="true"]) {'), css.indexOf("}", css.indexOf('.action-button:disabled:not([aria-busy="true"]) {')));
  assert.ok(disabled.includes("box-shadow: inset 0 0 0 var(--stroke-hairline) var(--material-edge)"), "الفعل المعطّل مسطح بلا حافة الزجاج");
  assert.ok(!/\.action-button\[data-style="primary"\]:disabled/.test(css), "قاعدة تعطيل مسطحة للأسلوب البارز");
  const pressed = css.slice(css.indexOf('.toolbar-item[aria-pressed="true"] {'), css.indexOf("}", css.indexOf('.toolbar-item[aria-pressed="true"] {')));
  assert.ok(pressed.includes("box-shadow: inset 0 0 0 var(--stroke-hairline) var(--material-edge)"), "الزر المحدَّد بلا حافة الزجاج");
});

test("المرحلة ٣: زر الإعدادات الصغير أسفل الشريط الجانبي في الوحدتين", () => {
  const footers = Object.fromEntries(
    [...html.matchAll(/<footer class="sidebar-footer[^"]*" data-for="(nasaq|shadhb)">([\s\S]*?)<\/footer>/g)].map((m) => [m[1], m[2]])
  );
  for (const module of ["nasaq", "shadhb"]) {
    const f = footers[module] || "";
    assert.ok(/data-open-settings[^>]*aria-label="الإعدادات"/.test(f) && f.includes('href="#gearshape.16r"'), `لا ترس في ذيل ${module}`);
  }
  assert.strictEqual((html.match(/data-open-settings/g) || []).length, 2);
  assert.ok(shell.includes('document.querySelectorAll("[data-open-settings]")'), "زر الترس لا يفتح الإعدادات");
});

// ---------- حرّاس المرحلة ٤ — شَذْب كاملًا (Figma nasq-v10، صفحة 51:9) ----------
// سبع حالات صريحة تكتبها آلة الحالات في data-shadhb-state، والقصّات في الشريط
// الجانبي والقرار في المفتّش، والعلامات طبقةٌ فوق الخانة المشتركة، والتنبيه
// لصاحبه، والإشعارات بنبراتها، والأرقام هندية من المنسّق المشترك

const SHADHB_STATES = ["before", "ready", "checking", "review", "polished", "no-cuts", "error"];
const stateKey = (state) => (state.includes("-") ? `"${state}"` : state);

test("المرحلة ٤: لكل حالة من حالات شَذْب السبع عنصرها وتسميتها", () => {
  const labels = {
    before: "لم يُفحص بعد",
    ready: "لم يُفحص بعد",
    checking: "جارٍ الفحص…",
    polished: "حُسمت كل القصّات",
    "no-cuts": "لا قصّات مقترحة",
    error: "تعذّر التحقق",
  };
  const stateFn = functionBody(shadhb, "shadhbState");
  assert.ok(stateFn, "آلة الحالات shadhbState غائبة");
  for (const state of SHADHB_STATES) {
    assert.ok(stateFn.includes(`"${state}"`), `shadhbState لا تبلغ حالة ${state}`);
  }
  for (const [state, label] of Object.entries(labels)) {
    assert.ok(shadhb.includes(`${stateKey(state)}: "${label}"`), `حالة ${state} بلا تسميتها «${label}»`);
  }
  // «مراجعة» تسميتها محسوبة بعدد ما لم يُحسم، بجمع عربي سليم من المنسّق المشترك
  assert.ok(shadhb.includes("`بانتظار قرارك في ${count(n,"), "تسمية المراجعة ليست بعدد ما لم يُحسم");
  assert.ok(shadhb.includes('"قصّتين"'), "صيغة المثنى غائبة عن تسمية المراجعة");
  // أقسام المفتّش وأعمدة العرض الواحد مجدولة لكل حالة لا مشتقة
  const sections = (shadhb.match(/const SECTIONS = \{([\s\S]*?)\n    \};/) || [])[1] || "";
  assert.ok(sections, "جدول أقسام المفتّش غائب");
  for (const state of SHADHB_STATES) {
    assert.ok(sections.includes(`${stateKey(state)}: {`), `جدول الأقسام بلا حالة ${state}`);
  }
  // لكل حالة عنصرها في المحتوى: نائب، تقدّم بمؤشر وخمسة أسطر، نص، ملاحظة، تنبيه
  assert.strictEqual(regions["shadhb-placeholder"].owner, "shadhb");
  assert.ok(regions["shadhb-progress"].classes.includes("result-progress"), "لا هيكل نائب لشَذْب");
  const progress = html.slice(html.indexOf('id="shadhb-progress"'), html.indexOf('id="prune-preview"'));
  assert.strictEqual((progress.match(/class="skeleton-line"/g) || []).length, 5, "هيكل شَذْب النائب ليس خمسة أسطر");
  assert.ok(progress.includes('class="spinner spinner-16"'), "لا مؤشر في سطر التقدّم");
  assert.ok(progress.includes("جارٍ فحص الشذرة… نصّك لن يتغيّر"), "سطر التقدّم لا يطمئن أن النص لن يتغيّر");
  const skeleton = html.slice(html.indexOf('id="reading-card-skeleton"'), html.indexOf('id="reading-card"'));
  assert.strictEqual((skeleton.match(/class="skeleton-line"/g) || []).length, 4, "هيكل بطاقة القراءة ليس أربعة أسطر");
  // «افحص الشذرة» بلون الوحدة دائمًا، معطّلًا بلا نص وبحالة تحميل أثناء الفحص
  assert.match(openTag("prune-btn"), /data-style="primary"/);
  assert.match(openTag("prune-btn"), /disabled/);
  assert.ok(shadhb.includes("pruneBtn.disabled = busy || !hasText;"), "«افحص الشذرة» يعمل بلا نص");
  assert.ok(shadhb.includes('pruneBtn.setAttribute("aria-busy", String(busy))'), "«افحص الشذرة» بلا حالة تحميل");
  // «نسخ» و«أرسل إلى نَسَق» حاضران بحالتيهما لا ظاهرَين ومخفيَّين
  for (const id of ["copy-pruned-btn", "send-to-nasaq-btn"]) {
    assert.doesNotMatch(openTag(id), /\shidden/, `${id} يختفي بدل أن يُعطَّل`);
    assert.match(openTag(id), /disabled/, `${id} يبدأ فعّالًا بلا نص مشذَّب`);
  }
  assert.ok(!/sendBtn\.hidden/.test(shadhb), "الجسر يختفي بدل أن يُعطَّل");
  // الجسر يكتب فوق الخانة: تغيّرها بعد الفحص يُعطّله ويقول سببه، لا يُعرض متاحًا ويرفض
  assert.ok(
    /sendBtn\.disabled = busy \|\| applied === 0 \|\| !check\.ok \|\| gone;/.test(shadhb),
    "الجسر يُعرض متاحًا والخانة تغيّرت بعد الفحص"
  );
  assert.ok(/sendBtn\.title = gone/.test(shadhb), "الجسر المعطّل لا يقول سببه");
});

test("المرحلة ٤: حالة شَذْب صريحة من آلة الحالات لا مشتقة بـ :has", () => {
  const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/[^{}]*:has\([^{]*\{/g)].map((m) => m[0].trim());
  for (const rule of rules) {
    assert.ok(
      !/cuts-|cut-row|shadhb|reading-card|covenant|prune|shard|marked-text|no-cuts/.test(rule),
      `اشتقاق بـ :has باقٍ: ${rule}`
    );
  }
  assert.ok(/root\.dataset\.shadhbState = now/.test(shadhb), "آلة الحالات لا تكتب data-shadhb-state");
  for (const [name, code] of [["shell.js", shell], ["layout.js", layout], ["nasaq.js", nasaq]]) {
    assert.ok(!/shadhbState\s*=|setAttribute\(\s*"data-shadhb-state"/.test(code), `${name} يكتب حالة شَذْب`);
  }
  // العمود الظاهر يقوده الحالة عبر واجهة الهيكل، لا ظهورُ عنصر
  assert.ok(/window\.NasaqWindow\.showView\(view\)/.test(shadhb), "شَذْب لا يقود العمود الظاهر");
  assert.ok(/window\.NasaqWindow = \{[^}]*\bshowView\b/.test(layout), "الهيكل لا يعرض showView");
  for (const id of ["prune-preview", "shadhb-progress", "shadhb-error", "shadhb-error-source"]) {
    assert.doesNotMatch(openTag(id), /data-reveals/, `${id} يشتق العمود من ظهوره`);
  }
});

test("المرحلة ٤: القصّات في الشريط الجانبي والقرار في المفتّش", () => {
  assert.ok(regions["cuts-list"].within.includes("sidebar"), "القصّات ليست في الشريط الجانبي");
  assert.ok(regions["cuts-count"].within.includes("sidebar"), "عدد القصّات ليس في الشريط الجانبي");
  for (const id of ["cut-card", "cut-card-quote", "cut-card-tag", "apply-cut-btn", "keep-cut-btn"]) {
    assert.ok(regions[id]?.within.includes("inspector"), `${id} ليس في المفتّش`);
    assert.strictEqual(regions[id].owner, "shadhb", `${id} ليس في منطقة شَذْب`);
  }
  // صفّ القصّة هو صفّ الشريط الجانبي المشترك بسطرين، وخيارٌ قابل للتحديد
  assert.ok(shadhb.includes('row.className = "sidebar-row cut-row"'), "صف القصّة ليس صفَّ الشريط المشترك");
  assert.ok(shadhb.includes('row.setAttribute("role", "option")'), "الصفوف ليست خيارات قابلة للتحديد");
  assert.ok(css.includes("block-size: var(--size-row-2line)"), "صفّ القصّة ليس بمقاس السطرين");
  // الأزرار داخل الصف والترقيم وحالتا الفراغ في القائمة: كلها زالت
  for (const gone of [
    "cut-entry",
    "cut-do",
    "cut-keep",
    "cut-chip",
    "cut-index",
    "cuts-empty",
    "dropped-note",
    "prune-preview-wrap",
    "shadhb-loading",
    "shadhb-status-dot",
    "shadhb-status-badge",
    "card-row",
    "card-label",
    "card-value",
    "loading-state",
    "when-empty",
  ]) {
    for (const [name, code] of [["index.html", html], ["app.css", css], ["shadhb.js", shadhb]]) {
      assert.ok(!code.includes(gone), `${gone} باقٍ في ${name}`);
    }
  }
  // بطاقة القراءة صفوف مركومة من مكوّن المفتّش المشترك
  assert.ok(shadhb.includes('row.className = "stacked-row"'), "بطاقة القراءة ليست صفوفًا مركومة");
});

test("المرحلة ٤: العلامات في الشذرة طبقةٌ فوق الخانة، والخانة تبقى قابلة للتحرير", () => {
  assert.strictEqual(regions["shard-marks"].owner, "shadhb");
  assert.ok(regions["shard-marks"].classes.includes("editor-stack"), "طبقة العلامات ليست في موضع الخانة");
  assert.ok(regions["input-text"].classes.includes("editor-stack"), "الخانة خارج الموضع المشترك");
  assert.strictEqual(regions["input-text"].owner, null, "الخانة صارت ملكًا لبرج");
  for (const cls of ["mark-pending", "mark-selected", "mark-cut"]) {
    assert.ok(css.includes(`.${cls}`), `علامة ${cls} غائبة عن app.css`);
    assert.ok(shadhb.includes(`"${cls}"`), `علامة ${cls} لا تُكتب من آلة الحالات`);
  }
  // الشفافية تكتبها آلة الحالات بسمة صريحة، فلا يبقى نصٌّ شفاف بلا علامات تحته
  assert.ok(/toggleAttribute\("data-shadhb-marks", show\)/.test(shadhb), "طبقة العلامات غير مقودة من آلة الحالات");
  assert.ok(
    /:root\[data-module="shadhb"\]\[data-shadhb-marks\] #input-text \{\s*color: transparent;/.test(css),
    "شفافية الخانة ليست بقيادة سمة العلامات"
  );
  // شَذْب لا يقفل الخانة ولا يكتب فيها: التحرير يبقى، والعلامات ترتفع عند تغيّره
  assert.ok(!/readOnly|"readonly"/.test(shadhb), "شَذْب يقفل خانة النص");
  assert.ok(!/inputText\.value\s*=/.test(shadhb), "شَذْب يكتب في الخانة مباشرة");
  assert.ok(/const diverged = \(\) =>/.test(shadhb), "لا حارس لتغيّر الخانة بعد الفحص");
  // قصّة بلا اقتباس حرفي ليست قصّة: تُسقَط قبل أي عرض فلا يصل «undefined» إلى الواجهة
  assert.ok(
    /typeof c\.quote === "string" && c\.quote\.length > 0/.test(shadhb),
    "قصّة بلا اقتباس حرفي تصل إلى العرض"
  );
  assert.ok(
    /\(proposed\.length - cuts\.length\)/.test(shadhb),
    "القصّات المسقَطة في الواجهة لا تُحسب في عدد المسقطات"
  );
});

test("المرحلة ٤: تنبيه شَذْب بتصميم Banner في خانتَيه، وملاحظة «لا قصّات» بلا إغلاق", () => {
  for (const id of ["shadhb-error", "shadhb-error-source"]) {
    assert.strictEqual(regions[id]?.owner, "shadhb", `${id} ليس في منطقة شَذْب`);
    const slot = html.slice(html.indexOf(`id="${id}"`), html.indexOf(`id="${id}"`) + 1200);
    assert.ok(/data-error-close/.test(slot), `${id} بلا إغلاق`);
    assert.ok(/xmark\.octagon\.20r/.test(slot), `${id} بلا رمز الخطر`);
  }
  assert.ok(regions["shadhb-error"].classes.includes("column-result"), "تنبيه شَذْب ليس في عمود النتيجة");
  assert.ok(regions["shadhb-error-source"].classes.includes("column-source"), "خانة التنبيه ليست فوق الشذرة");
  for (const id of ["no-cuts-source", "no-cuts-result"]) {
    const note = html.slice(html.indexOf(`id="${id}"`), html.indexOf(`id="${id}"`) + 700);
    assert.ok(/class="banner"/.test(note), `${id} ليس بتصميم Banner`);
    assert.ok(/info\.circle\.20r/.test(note), `${id} بلا رمز المعلومات`);
    assert.ok(!/data-error-close|data-error-slot|data-error-action/.test(note), `${id} تنبيه خطأ لا ملاحظة`);
  }
  assert.ok(css.includes("#no-cuts-source"), "الملاحظة تتكرر في العمودين");
  // التنبيه لصاحبه: شَذْب يعرض عبر واجهة القشرة المربوطة به، ويتبع زواله
  assert.ok(/shell\.showError\(/.test(shadhb), "شَذْب لا يعرض تنبيهه عبر واجهة القشرة");
  assert.ok(shadhb.includes('e.detail?.owner !== "shadhb"'), "شَذْب لا يتبع زوال تنبيهه");
});

test("المرحلة ٤: إشعارات شَذْب بنبراتها الأربع", () => {
  const calls = shadhb
    .split("showToast(")
    .slice(1)
    .map((chunk) => chunk.slice(0, chunk.indexOf(");")));
  assert.ok(calls.length >= 4, "إشعارات شَذْب ناقصة");
  const tones = new Set();
  for (const call of calls) {
    const found = [...call.matchAll(/"(success|neutral|warning|danger)"/g)].map((m) => m[1]);
    assert.ok(found.length > 0, `إشعار بلا نبرة: ${call.slice(0, 48)}`);
    for (const tone of found) tones.add(tone);
  }
  assert.deepStrictEqual([...tones].sort(), ["danger", "neutral", "success", "warning"]);
});

test("المرحلة ٤: الأرقام الهندية في كل ما يعرضه شَذْب", () => {
  assert.ok(!/toLocaleString\(\s*"ar"\s*\)/.test(shadhb), 'شَذْب يعرض أرقامًا بـ toLocaleString("ar")');
  assert.ok(!/Intl\.(?:NumberFormat|DateTimeFormat)/.test(shadhb), "شَذْب ينسّق أرقامه بمنسّق خاص لا بالمشترك");
  assert.ok(shadhb.includes("const AR = shell.formatNumber"), "شَذْب لا يستعمل المنسّق المشترك");
  // والجمع العربي من المنسّق نفسه لا مكرَّرًا: لا قاعدة رتبتين داخل شَذْب
  assert.ok(shadhb.includes("const count = shell.countLabel"), "شَذْب يكرّر قاعدة الجمع العربي");
  assert.ok(!/n % 100/.test(shadhb), "قاعدة الرتبتين مكرَّرة في شَذْب");
  assert.ok(/^  countLabel,$/m.test(shell), "القشرة لا تنشر منسّق الجمع");
  assert.ok(/formatNumber: \(n\) => arabicDigits\.format\(n\)/.test(shell), "القشرة لا تنشر المنسّق المشترك");
  // عدّاد شَذْب مستقل عن عدّاد نَسَق، وكلمات الشذرة وحدها
  assert.strictEqual(regions["shadhb-count"]?.owner, "shadhb");
  assert.ok(css.includes(':root[data-module="shadhb"] #input-count'), "عدّاد نَسَق ظاهر في شَذْب");
});

test("المرحلة ٤: النصّ النائب يسمّي خامَ كل وحدة، والهيكل يقرأه بلا معرفة ببرج", () => {
  assert.ok(/data-placeholder-shadhb="الصق الشذرة هنا أو اكتبها مباشرة…"/.test(html), "نصّ شَذْب النائب غائب");
  assert.ok(/data-placeholder-nasaq="الصق نصّك هنا أو ابدأ الكتابة مباشرة…"/.test(html), "نصّ نَسَق النائب غائب");
  const fn = functionBody(layout, "applyModulePlaceholders");
  assert.ok(fn, "الهيكل لا يطبّق النصّ النائب");
  assert.ok(fn.includes("`data-placeholder-${root.dataset.module}`"), "الهيكل لا يقرأ السمة بالوحدة الفعّالة");
  assert.ok(!/nasaq|shadhb/i.test(fn), "دالة النصّ النائب تعرف برجًا بعينه");
});

test("المرحلة ٤: منطق القصّ والتحقق لم يُمَس — شَذْب يستهلكه ولا يعيد كتابته", () => {
  const prune = src("prune.js");
  for (const fn of ["applyCuts", "tidyAfterCut", "verifySubset", "wordCores"]) {
    assert.ok(new RegExp(`function ${fn}\\(`).test(prune), `دالة ${fn} غائبة عن المقص`);
    assert.ok(!new RegExp(`function ${fn}\\(`).test(shadhb), `شَذْب يعيد كتابة ${fn}`);
  }
  assert.ok(!/EDGE_PUNCT_RE/.test(shadhb), "شَذْب يعيد تعريف تجريد علامات الوقف");
  for (const call of ["prune.applyCuts(", "prune.verifySubset(", "prune.tidyAfterCut(", "prune.wordCores("]) {
    assert.ok(shadhb.includes(call), `شَذْب لا يستهلك ${call}`);
  }
  // العلامة والقصّ يقرآن الظهور من المصدر نفسه، فلا يختلفان على أي ظهور يقصدان
  // (معامل في المقص، لا حقل في عقد النموذج — والافتراضي الظهور الأول)
  assert.ok(/occurrence/.test(functionBody(shadhb, "locate")), "العلامة لا تقرأ الظهور");
  assert.ok(
    shadhb.includes("{ quote: cut.quote, occurrence: cut.occurrence }"),
    "القصّ لا يقرأ الظهور من مصدر العلامة نفسه"
  );
});

// ---------- حرّاس المرحلة ٥: نافذتا الإعدادات و«حول» ----------

test("المرحلة ٥: نافذة الإعدادات كما رُسمت — تبويبان وثلاثة أقسام وصفوفها", () => {
  const tabs = [...settingsHtml.matchAll(/data-tab="([a-z]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(tabs, ["general", "updates"], "التبويبان ليسا كما في اللوحة");

  const headers = [...settingsHtml.matchAll(/class="section-header">([^<]+)</g)].map((m) => m[1]);
  assert.deepStrictEqual(headers, ["النموذج", "الاتصال", "المظهر"], "أقسام «عام» ليست كما رُسمت");

  for (const id of ["api-key", "model-name", "base-url", "provider-picker", "appearance-picker", "test-connection", "auto-updates", "app-version", "check-updates"]) {
    assert.ok(settingsHtml.includes(`id="${id}"`), `صفّ ${id} غائب عن الصفحة`);
  }

  // تذييلان منصوصان في التصميم حرفًا بحرف
  assert.ok(
    settingsHtml.includes("يُحفظ المفتاح في سلسلة المفاتيح على جهازك، ولا يُرسَل نصّك إلا حين تطلب التنسيق أو الفحص."),
    "تذييل قسم النموذج ليس نصّ التصميم"
  );
  assert.ok(settingsHtml.includes("«تلقائي» يتبع مظهر النظام ويتبدّل معه فورًا."), "تذييل المظهر ليس نصّ التصميم");
  assert.ok(settingsHtml.includes("لا يُنزَّل أي تحديث قبل موافقتك."), "تذييل التحديثات ليس نصّ التصميم");
});

test("المرحلة ٥: المفتاح لا يعبر الجسر إلى صفحة الإعدادات", () => {
  // الصفحة تعرف أنه محفوظ فحسب، ولا تقرأ قيمته من النواة أبدًا
  assert.ok(settingsJs.includes("view.hasApiKey"), "الحقل المقنّع لا يتبع علم الحفظ");
  assert.ok(!/view\.apiKey|\.apiKey\b(?!\s*:)/.test(settingsJs.replace(/apiKey: apiKeyInput\.value/g, "")), "الصفحة تقرأ المفتاح من النواة");
  // والقشرة لم تعد تقرأه أيضًا بعد زوال الطبقة المؤقتة
  assert.ok(!/\bs\.apiKey\b|settings\.apiKey/.test(shell), "القشرة ما زالت تقرأ المفتاح");
  // وأول تشغيل صار من شأن ورقة الترحيب لا القشرة (المرحلة ٦): تعرف أنه محفوظ ولا تقرؤه
  assert.ok(onboardingJs.includes("view.hasApiKey"), "أول تشغيل لا يعرف أن المفتاح محفوظ");
  assert.ok(!/view\.apiKey/.test(onboardingJs), "ورقة الترحيب تقرأ المفتاح من النواة");
});

test("المرحلة ٥: النافذتان مخفيتان حتى تعلنا جاهزيتهما", () => {
  assert.ok(secondaryJs.includes('invoke("secondary_window_ready")'), "إعلان الجاهزية غائب");
  assert.ok(settingsJs.includes("announceReady()"), "صفحة الإعدادات لا تعلن جاهزيتها");
  assert.ok(src("about.js").includes("announceReady("), "لوحة «حول» لا تعلن جاهزيتها");
  // والإطار يتبع اللوح كما تفعل إعدادات النظام
  assert.ok(secondaryJs.includes('invoke("settings_pane_resized"'), "الإطار لا يتبع اللوح");
});

test("المرحلة ٥: المظهر مصدره ملف الإعدادات لا مخزن المتصفح", () => {
  assert.ok(shell.includes("settings.appearance"), "القشرة لا تقرأ المظهر من الإعدادات");
  assert.ok(shell.includes("legacyAppearanceChoice") && shell.includes("forgetLegacyAppearance"), "لا ترحيل للاختيار القديم");
  assert.ok(!/localStorage\.setItem\(APPEARANCE_KEY/.test(shell), "المظهر ما زال يُحفظ في مخزن المتصفح");
  assert.ok(shell.includes('listen("settings:changed"'), "المظهر لا يتبع نافذة الإعدادات");
  // وحدة واحدة تطبّقه في النوافذ كلها
  assert.ok(src("appearance.js").includes("data-appearance"), "وحدة المظهر لا تضبط السمة");
  // والنوافذ الثلاث تتبعه: لا تبقى «حول» فاتحة والتطبيق داكن
  const about = src("about.js");
  // تطبّقه عن المحفوظ عند الفتح، لا عن الحدث وحده
  assert.ok(/invoke\("load_settings"\)/.test(about), "«حول» لا تقرأ المظهر المحفوظ");
  assert.ok(/appearance\.apply\(view\.appearance\)/.test(about), "«حول» لا تطبّق المظهر عند الفتح");
  assert.ok(about.includes('listen("settings:changed"'), "«حول» لا تتبع تغيير المظهر");
  assert.ok(aboutHtml.includes('src="appearance.js"'), "«حول» لا تحمّل وحدة المظهر");
});

test("المرحلة ٥: ما يتغيّر ديناميكيًا يُعلَن لقارئ الشاشة", () => {
  for (const id of ["connection-status", "update-status"]) {
    const tag = new RegExp(`<[^>]*id="${id}"[^>]*>`).exec(settingsHtml)[0];
    assert.ok(/role="status"/.test(tag) && /aria-live="polite"/.test(tag), `${id} يتغيّر بلا إعلان`);
  }
});

test("المرحلة ٥: ما يُكتب يُحفظ بعد سكتة لا عند مغادرة الحقل وحدها", () => {
  // إغلاق النافذة بعد الكتابة مباشرة كان يُضيّع ما كُتب
  for (const field of ["apiKeyInput", "modelInput", "baseUrlInput"]) {
    assert.ok(
      new RegExp(`${field}\\.addEventListener\\("input"`).test(settingsJs),
      `${field} لا يُحفظ إلا عند مغادرته`
    );
  }
  assert.ok(settingsJs.includes("function debounce("), "لا سكتة بين الكتابة والحفظ");
  // والمفتاح لا يُمحى من الحقل إلا بعد أن يستقرّ حفظه
  assert.ok(/if \(await save\(\{ apiKey: apiKeyInput\.value \}\)\) apiKeyInput\.value = "";/.test(settingsJs), "الحقل يُفرَّغ قبل أن ينجح الحفظ");
});

test("المرحلة ٥: المزوّدات نفسها في الواجهة وفي النواة", () => {
  // جدولان يتباعدان بصمت لولا هذا الحارس
  const rust = fs.readFileSync(path.join(__dirname, "..", "src-tauri", "src", "shared", "settings.rs"), "utf8");
  // \b يمنع DEFAULT_BASE_URL من مطابقة ANTHROPIC_DEFAULT_BASE_URL،
  // و\s* يسمح بالإعلان على سطرين
  const constOf = (name) => new RegExp(`\\b${name}: &str =\\s*"([^"]+)"`).exec(rust)[1];
  const jsOf = (key, field) =>
    new RegExp(`${key}: \\{[^}]*${field}: "([^"]+)"`, "s").exec(providersJs)[1];
  assert.strictEqual(jsOf("claude", "baseUrl"), constOf("ANTHROPIC_DEFAULT_BASE_URL"));
  assert.strictEqual(jsOf("claude", "model"), constOf("ANTHROPIC_DEFAULT_MODEL"));
  assert.strictEqual(jsOf("gemini", "baseUrl"), constOf("DEFAULT_BASE_URL"));
  assert.strictEqual(jsOf("gemini", "model"), constOf("DEFAULT_MODEL"));
  assert.strictEqual(jsOf("openai", "model"), constOf("OPENAI_DEFAULT_MODEL"));
});

test("المرحلة ٥: لوحة «حول» بنصوص التصميم ومقاسه", () => {
  for (const text of ["نَسَق", "كلماتك كما هي، بنَسَقٍ أوضح.", "© ٢٠٢٦ سلطان"]) {
    assert.ok(aboutHtml.includes(text), `نصّ «${text}» غائب عن لوحة «حول»`);
  }
  assert.ok(aboutHtml.includes('src="app-icon.png"'), "أيقونة التطبيق غائبة");
  assert.ok(fs.existsSync(srcPath("app-icon.png")), "ملف الأيقونة غير موجود في src");
  const rust = fs.readFileSync(path.join(__dirname, "..", "src-tauri", "src", "app", "secondary.rs"), "utf8");
  assert.ok(rust.includes("ABOUT_WIDTH: f64 = 284.0") && rust.includes("ABOUT_HEIGHT: f64 = 213.0"), "مقاس «حول» ليس مقاس التصميم");
});

// ---------- حرّاس المرحلة ٦: أول تشغيل والتحديثات (Figma 255:521 و258:18771) ----------

test("المرحلة ٦: لا بايت يُنزَّل قبل موافقة صريحة", () => {
  // القاعدة الحاكمة للتدفّق كلّه. التنزيل والتثبيت وإعادة التشغيل لا تُنادى
  // إلا من داخل install()، وinstall لا يُنادى إلا من زر «ثبّت وأعد التشغيل»
  const install = /async function install\(\)[\s\S]*?\n  \}/.exec(updatesJs)[0];
  for (const call of ["plugin:updater|download", "plugin:updater|install", "plugin:process|restart"]) {
    assert.ok(install.includes(call), `${call} ليس داخل install`);
    assert.strictEqual(
      updatesJs.split(call).length - 1,
      1,
      `${call} يُنادى من أكثر من موضع`
    );
  }
  assert.ok(/onConfirm: install,/.test(updatesJs), "زر الموافقة لا يقود التثبيت");
  // والفحص التلقائي يفحص فحسب — لا اسم للتنزيل في مساره
  const check = /async function check\(origin\)[\s\S]*?\n  \}/.exec(updatesJs)[0];
  assert.ok(check.includes("plugin:updater|check"), "الفحص لا ينادي الفحص");
  assert.ok(!/download|install|restart/.test(check), "مسار الفحص يذكر التنزيل");
});

test("المرحلة ٦: الحالات الثلاث المرسومة بنصوصها، ولا رابعة", () => {
  // التصميم رسم ثلاثًا: متاح، جارٍ التنزيل، لا تحديث — والخطأ غير مرسوم
  assert.ok(updatesJs.includes("يتوفّر نَسَق ${version}"), "عنوان «تحديث متاح» ليس نصّ التصميم");
  assert.ok(
    updatesJs.includes("يُعاد تشغيل نَسَق بعد التثبيت، وتبقى مسوداتك كما هي."),
    "رسالة «تحديث متاح» ليست نصّ التصميم"
  );
  assert.ok(updatesJs.includes("ثبّت وأعد التشغيل"), "زر التثبيت ليس نصّ التصميم");
  assert.ok(updatesJs.includes("جارٍ تنزيل نَسَق ${version}"), "عنوان التنزيل ليس نصّ التصميم");
  assert.ok(updatesJs.includes("نَسَق محدَّث"), "عنوان «لا تحديث» ليس نصّ التصميم");
  // «جاهز للتثبيت» ليس في التصميم: زرٌّ واحد يغطّي التنزيل والتثبيت
  assert.ok(!/جاهز للتثبيت/.test(updatesJs), "حالة رابعة لم يرسمها التصميم");
});

test("المرحلة ٦: ميغابايتات التنزيل بأرقام هندية، ورقم الإصدار لاتينيّ", () => {
  // العدد يُقرأ فيُعرَّب، والإصدار معرّف لا عدد — كما في لوحة «حول»
  assert.ok(/formatNumber\(Math\.max\(0, Math\.round\(bytes \/ 1e6\)\)\)/.test(updatesJs), "الميغابايت بلا تعريب");
  assert.ok(/م\.ب من \$\{mb\(total\)\} م\.ب/.test(updatesJs), "سطر التقدّم ليس نصّ التصميم");
  assert.ok(!/toLocaleString\(|toLocaleNumber\(/.test(updatesJs), "تعريب خارج وحدة القشرة");
});

test("المرحلة ٦: أول تشغيل ورقةٌ في النافذة لا نافذةَ إعدادات", () => {
  // كانت القشرة تفتح نافذة الإعدادات حين لا مفتاح — والتصميم ورقةٌ بخطوتين
  assert.ok(!/hasApiKey\)\s*invoke\("open_settings"/.test(shell), "القشرة ما زالت تفتح الإعدادات عند أول تشغيل");
  assert.ok(html.includes('id="welcome-sheet"'), "ورقة الترحيب غائبة");
  assert.ok(/data-step="welcome"/.test(html), "الورقة لا تبدأ عند خطوة الترحيب");
  assert.ok(onboardingJs.includes('setStep("connect")'), "لا انتقال إلى الخطوة الثانية");
  // «لاحقًا» يُبقي التطبيق مفتوحًا: يغلق الورقة ولا يُنهي شيئًا
  assert.ok(/el\("welcome-skip"\)\.addEventListener\("click", close\)/.test(onboardingJs), "«لاحقًا» لا يُبقي التطبيق");
  // و«نسّق» بلا مزوّد يعيد الخطوة الثانية وحدها، لا الأولى
  assert.ok(/requireProvider\(\)\s*\{\s*if \(hasProvider\(\)\) return true;\s*open\("connect"\);/.test(onboardingJs), "«نسّق» لا يعيد فتح الخطوة الثانية");
  assert.ok(nasaq.includes("window.NasaqOnboarding.requireProvider()"), "نَسَق لا يسأل عن المزوّد قبل النداء");
  // Esc: سلّم الإغلاق يفحص الأحدث تسجيلًا أولًا، فالقائمة تُسجَّل بعد الورقة
  // لتُغلق قبلها — وإلا أغلق Esc الورقة وقائمتها معًا في ضغطة واحدة
  const sheetCloser = onboardingJs.indexOf('registerEscapeCloser(() => opened');
  const pickerCloser = onboardingJs.indexOf('registerEscapeCloser(() => picker.isOpen()');
  assert.ok(sheetCloser !== -1 && pickerCloser !== -1, "مُغلقا Esc غير مسجَّلين");
  assert.ok(sheetCloser < pickerCloser, "Esc يغلق الورقة قبل قائمتها");
  // والخطوة الأولى بلا زر إلغاء، فلا يُغلقها Esc
  assert.ok(/opened && sheet\.dataset\.step === "connect"/.test(onboardingJs), "Esc يغلق خطوة الترحيب التي لا إلغاء فيها");
});

test("المرحلة ٦: «تنظيف فقط» محليّ يعمل بلا مزوّد", () => {
  // البوابة بعد المسار المحلي لا قبله: لا يحتاج شبكة ولا مفتاحًا
  const fn = /async function formatText\(\)[\s\S]*?\n  setModelBusy\(true\);/.exec(nasaq)[0];
  assert.ok(
    fn.indexOf("LEVELS.CLEAN") < fn.indexOf("requireProvider"),
    "بوّابة المزوّد قبل المسار المحلي"
  );
});

test("المرحلة ٦: نصوص ورقة الترحيب من التصميم", () => {
  for (const text of [
    "مرحبًا بك في نَسَق",
    "رتّب نصّك قبل النشر واحذف ما يزيد عنه، دون أن نكتب عنك كلمة.",
    "نَسَق يرتّب",
    "يوزّع الأسطر والوقفات لتُقرأ بوضوح، والكلمات كما كتبتها.",
    "شَذْب يقترح",
    "يدلّك على ما يمكن حذفه، وأنت من يقرّر في كل قصّة.",
    "نصّك على جهازك",
    "لا يُرسَل شيء إلا حين تطلب، والمسودات محفوظة محليًا.",
    "اربط نموذجًا",
    "يعمل نَسَق بمفتاحك من مزوّد تختاره، أو بنموذج على جهازك عبر Ollama.",
    "يُحفظ المفتاح في سلسلة المفاتيح على جهازك، ويمكنك تغييره لاحقًا من الإعدادات.",
    "كيف أحصل على مفتاح؟",
  ]) {
    assert.ok(html.includes(text), `نصّ «${text}» غائب عن ورقة الترحيب`);
  }
  // ثلاث ميزات لا أكثر ولا أقل، كما رُسمت
  assert.strictEqual((html.match(/class="welcome-feature"/g) ?? []).length, 3, "عدد الميزات ليس ثلاثًا");
});

test("المرحلة ٦: المكوّن المشترك مصدرٌ واحد لا نسختان", () => {
  // «Form Section» والمنتقي في ملفّيهما، وتحمّلهما النافذتان معًا
  assert.ok(fs.existsSync(srcPath("forms.css")), "forms.css غير موجود");
  for (const page of [html, settingsHtml]) {
    assert.ok(page.includes('href="forms.css"'), "نافذة لا تحمّل forms.css");
    assert.ok(page.includes('src="providers.js"') && page.includes('src="forms.js"'), "نافذة لا تحمّل الوحدتين المشتركتين");
  }
  // ولا نسخة ثانية بقيت في مكانها القديم
  const forms = src("forms.css");
  const secondary = src("secondary.css");
  for (const rule of [".form-row {", ".row-picker {", ".picker-menu-item {"]) {
    assert.ok(forms.includes(rule), `${rule} ليس في forms.css`);
    assert.ok(!secondary.includes(rule), `${rule} ما زال في secondary.css`);
  }
  assert.ok(!/const PROVIDERS = \{/.test(settingsJs), "جدول المزوّدات ما زال في صفحة الإعدادات");
  assert.ok(formsJs.includes("attachPicker"), "المنتقي ليس في forms.js");
  // واسم القائمة picker-menu لا menu: النافذة الرئيسية لها menu خاصّتها
  assert.ok(!/^\.menu \{/m.test(forms), "قائمة المنتقي تصطدم بقوائم النافذة الرئيسية");
});

test("المرحلة ٦: تدفّقا التطبيق لا يملكهما برج", () => {
  // ورقة الترحيب وتنبيه التحديث عن التطبيق نفسه: بلا data-for، ولا يعرفان برجًا
  for (const id of ["welcome-sheet", "update-alert", "welcome-picker-menu"]) {
    assert.strictEqual(regions[id]?.owner, null, `${id} صار ملكًا لبرج`);
  }
  for (const file of [onboardingJs, updatesJs]) {
    for (const banned of ['invoke("format_text"', 'invoke("generate_variation"', 'invoke("adjust_lines"', 'invoke("prune_text"']) {
      assert.ok(!file.includes(banned), `تدفّق التطبيق ينادي ${banned}`);
    }
    assert.ok(!/NasaqPrune|NasaqShadhb/.test(file), "تدفّق التطبيق يلمس شَذْب");
  }
});

test("المرحلة ٦: الفحص التلقائي يقرأ autoUpdates ولا يفاجئ", () => {
  // العلم كان يُحفظ ولا يقرؤه أحد — وهذه قراءته
  assert.ok(/loaded\?\.autoUpdates\) check\(AUTO\)/.test(updatesJs), "الفحص التلقائي لا يقرأ الإعداد");
  // ولا يعرض «لا تحديث» ولا خطأً إلا لمن طلب الفحص بنفسه
  assert.ok(/else if \(origin === MANUAL\) \{\s*showUpToDate/.test(updatesJs), "«لا تحديث» تظهر للفحص التلقائي");
  assert.ok(/if \(origin === MANUAL\) showFailure/.test(updatesJs), "خطأ الفحص التلقائي يقاطع المستخدم");
  // والإعدادات تُحمَّل مرة واحدة تتقاسمها القشرة والتدفّقان
  assert.strictEqual(shell.split('invoke("load_settings")').length - 1, 1, "load_settings يُنادى أكثر من مرة في القشرة");
  for (const file of [onboardingJs, updatesJs]) {
    assert.ok(file.includes("NasaqShell.settingsReady"), "تدفّق لا يستعمل الإعدادات المحمَّلة");
    assert.ok(!file.includes('invoke("load_settings")'), "تدفّق يعيد تحميل الإعدادات");
  }
});

test("المرحلة ٦: صفحات المفاتيح مسموحة بالاسم لا بنطاق مفتوح", () => {
  const cap = JSON.parse(
    fs.readFileSync(path.join(__dirname, "..", "src-tauri", "capabilities", "default.json"), "utf8")
  );
  const opener = cap.permissions.find((p) => p && p.identifier === "opener:allow-open-url");
  const allowed = opener.allow.map((a) => a.url);
  // كل رابط في جدول المزوّدات له إذن صريح، ولا إذن زائد بنجمة نطاق
  for (const m of providersJs.matchAll(/keyUrl: "([^"]+)"/g)) {
    assert.ok(allowed.includes(m[1]), `رابط ${m[1]} بلا إذن`);
  }
  for (const url of allowed) {
    assert.ok(!/^https:\/\/\*/.test(url), `إذن بنطاق مفتوح: ${url}`);
  }
  // والنافذتان الثانويتان لا تنزّلان ولا تثبّتان
  for (const name of ["settings", "about"]) {
    const other = JSON.parse(
      fs.readFileSync(path.join(__dirname, "..", "src-tauri", "capabilities", `${name}.json`), "utf8")
    );
    assert.ok(!other.permissions.includes("updater:allow-download"), `${name} تملك التنزيل`);
    assert.ok(!other.permissions.includes("updater:allow-install"), `${name} تملك التثبيت`);
  }
});
