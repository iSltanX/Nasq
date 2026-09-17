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

test("ترتيب التحميل: الهيكل فالقشرة قبل نسق، وشَذْب أخيرًا، وmain.js زال", () => {
  const order = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.deepStrictEqual(order, [
    "lines.js",
    "drafts-model.js",
    "fragments.js",
    "substack-markers.js",
    "prune.js",
    "layout.js",
    "shell.js",
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

test("المفتاح في القشرة مع مسار إطفاء يعيد واجهة v4.3", () => {
  assert.ok(shell.includes("readShadhbFlag()"), "المفتاح لا يُقرأ من دالته");
  assert.ok(shell.includes('"off"'), "مسار الإطفاء غائب");
  assert.ok(shell.includes("sendToNasaq"), "الجسر غائب من القشرة");
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
    "applyAppearanceChoice",
    "openSettings",
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

// ---------- حرّاس صياغات شَذْب (v5.1) ----------
// منطق العرض في shadhb.js: حالتا الفراغ وشرط «بعد التشذيب» — باقية كما هي

test("v5.1: حالتا فراغ القصّات صريحتان والصياغة القديمة الموهِمة زالت", () => {
  assert.ok(shadhb.includes("لم يبقَ اقتراح حذف صالح بعد التحقق."), "حالة الإسقاط الكامل غائبة");
  assert.ok(shadhb.includes("لم يجد شَذْب موضع حذف آمن."), "حالة اللا-اقتراحات غائبة");
  // «مُحكَمة كما هي» كانت تدّعي حكمًا أدبيًا سببه الفعلي فشل التحقق
  assert.ok(!shadhb.includes("مُحكَمة كما هي"), "الصياغة القديمة ما زالت في shadhb.js");
  // الحالتان تفترقان على droppedCuts — الفارق الجوهري لا الشكلي
  assert.ok(/droppedCuts > 0/.test(shadhb), "التمييز بعدّاد الإسقاط غائب");
});

test("v5.1: «بعد التشذيب» مشروط بحذف فعلي", () => {
  assert.ok(/status === "cut"/.test(shadhb), "شرط الحذف الفعلي غائب من shadhb.js");
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
  for (const id of ["prune-btn", "send-to-nasaq-btn", "copy-pruned-btn", "cuts-list", "reading-card", "covenant-bar", "prune-preview", "shadhb-placeholder", "shadhb-status-badge"]) {
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
