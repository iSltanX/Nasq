// اختبارات حارسة للعزل الأمامي (المرحلة 2) — يعمل بـ: npm test
// تفحص نصوص المصدر نفسها: ترتيب التحميل، حدود الملكية بين القشرة والوضع،
// خمود هيكل شَذْب، واكتمال دوال نسق بعد انقسام main.js — فأي انزلاق
// مستقبلي في قواعد العزل يفشل هنا قبل أن يصل الواجهة
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const src = (name) => fs.readFileSync(path.join(__dirname, "..", "src", name), "utf8");
const html = src("index.html");
const shell = src("shell.js");
const nasaq = src("nasaq.js");
const shadhb = src("shadhb.js");
const css = src("styles.css");

test("ترتيب التحميل: القشرة قبل نسق، وشَذْب أخيرًا، وmain.js زال", () => {
  const order = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);
  assert.deepStrictEqual(order, [
    "lines.js",
    "drafts-model.js",
    "fragments.js",
    "substack-markers.js",
    "prune.js",
    "shell.js",
    "nasaq.js",
    "shadhb.js",
    // سجلّ تجربة شَذْب (مؤقت خلف مفتاح) — آخر الملفات دومًا؛ إزالته تعيد
    // القائمة لثمانية عناصر كما كانت
    "shadhb-trial-log.js",
  ]);
  assert.ok(!fs.existsSync(path.join(__dirname, "..", "src", "main.js")), "main.js ما زال موجودًا");
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

// ---------- حرّاس صقل الواجهة (المرحلة 5 — v5.1) ----------
// عرضٌ فقط: تثبيت الصياغات والمواضع الجديدة كي لا تنزلق، وبنفس أسلوب
// فحص نصوص المصدر المتبع أعلاه

test("v5.1: حالتا فراغ القصّات صريحتان والصياغة القديمة الموهِمة زالت", () => {
  assert.ok(shadhb.includes("لم يبقَ اقتراح حذف صالح بعد التحقق."), "حالة الإسقاط الكامل غائبة");
  assert.ok(shadhb.includes("لم يجد شَذْب موضع حذف آمن."), "حالة اللا-اقتراحات غائبة");
  // «مُحكَمة كما هي» كانت تدّعي حكمًا أدبيًا سببه الفعلي فشل التحقق
  assert.ok(!shadhb.includes("مُحكَمة كما هي"), "الصياغة القديمة ما زالت في shadhb.js");
  // الحالتان تفترقان على droppedCuts — الفارق الجوهري لا الشكلي
  assert.ok(/droppedCuts > 0/.test(shadhb), "التمييز بعدّاد الإسقاط غائب");
});

test("v5.1: «بعد التشذيب» مشروط بحذف فعلي وعنوانه ينسب النص لصاحبه", () => {
  assert.ok(/status === "cut"/.test(shadhb), "شرط الحذف الفعلي غائب من shadhb.js");
  assert.ok(html.includes("بعد التشذيب — من نصّك فقط"), "عنوان المعاينة الجديد غائب من الهيكل");
});

test("v5.1: شريط الفحص في لوحة الإدخال خلف data-mode — لا أثر له خارج شَذْب", () => {
  assert.ok(/<div id="shadhb-inspect-bar"/.test(html), "شريط الفحص غائب من الهيكل");
  // الزر داخل لوحة الإدخال (بين خانة النص ولوحة نتائج نسق) لا في لوحة النتائج
  const inputPane = html.slice(html.indexOf('id="input-text"'), html.indexOf('id="nasaq-output-pane"'));
  assert.ok(inputPane.includes('id="prune-btn"'), "زر الفحص ليس في لوحة الإدخال");
  // مخفي افتراضيًا في CSS ولا يُظهره إلا data-mode — فبإطفاء المفتاح لا أثر له
  assert.ok(/\.shadhb-inspect-bar\s*\{\s*display:\s*none;?\s*\}/.test(css), "الشريط ليس مخفيًا افتراضيًا");
  assert.ok(css.includes('[data-mode="shadhb"] .shadhb-inspect-bar'), "إظهار الشريط ليس بقيادة data-mode");
});

test("v5.1: تذييل النتائج ثابت خارج جسد التمرير وفيه الضمانة والجسر", () => {
  const pane = html.slice(html.indexOf('id="shadhb-pane"'));
  const bodyStart = pane.indexOf('class="shadhb-body"');
  const footerStart = pane.indexOf('class="shadhb-footer"');
  assert.ok(bodyStart !== -1 && footerStart > bodyStart, "التذييل غائب أو قبل جسد التمرير");
  const body = pane.slice(bodyStart, footerStart);
  const footer = pane.slice(footerStart);
  assert.ok(!body.includes('id="covenant-bar"') && footer.includes('id="covenant-bar"'), "الضمانة ليست في التذييل الثابت");
  assert.ok(!body.includes('id="send-to-nasaq-btn"') && footer.includes('id="send-to-nasaq-btn"'), "زر الجسر ليس في التذييل الثابت");
});
