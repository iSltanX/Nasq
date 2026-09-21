// حرّاس الأساس المولَّد من Figma: التوكنز والخطوط والأيقونات — يعمل بـ: npm test
// تفحص الملفات نفسها: لا اسم توكن مكرر (تضارب يُسقط قيمة في وضع ما)، ولا إحالة
// إلى توكن غير معرّف، ولا خط أو أيقونة ناقصة أو بلون مثبّت
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const srcPath = (...p) => path.join(__dirname, "..", "src", ...p);
const tokens = fs.readFileSync(srcPath("tokens.css"), "utf8");
const base = fs.readFileSync(srcPath("base.css"), "utf8");
const icons = fs.readFileSync(srcPath("icons.svg"), "utf8");

// كتل CSS بسياقها: [{ context: "@media …" | "", selector, body }]
function blocks(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  const walk = (text, context) => {
    let i = 0;
    while (i < text.length) {
      const open = text.indexOf("{", i);
      if (open === -1) break;
      const selector = text.slice(i, open).trim();
      let depth = 1;
      let j = open + 1;
      while (depth && j < text.length) {
        if (text[j] === "{") depth++;
        else if (text[j] === "}") depth--;
        j++;
      }
      const body = text.slice(open + 1, j - 1);
      if (selector.startsWith("@media")) walk(body, selector);
      else out.push({ context, selector, body });
      i = j;
    }
  };
  walk(clean, "");
  return out;
}

const declared = (body) => [...body.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]);

test("التوكنز: لا اسم مكرر في كتل :root الأساسية", () => {
  const names = blocks(tokens)
    .filter((b) => b.context === "" && b.selector === ":root")
    .flatMap((b) => declared(b.body));
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  assert.deepStrictEqual(dup, [], `أسماء مكررة: ${dup.join(", ")}`);
  assert.ok(names.length > 250, "عدد التوكنز أقل من المتوقع — هل التوليد ناقص؟");
});

test("التوكنز: كل ما يُبدَّل في الأوضاع معرّف أصلًا، وكل إحالة var() تجد توكنها", () => {
  const all = blocks(tokens);
  const rootNames = new Set(all.filter((b) => b.context === "" && b.selector === ":root").flatMap((b) => declared(b.body)));
  for (const b of all) {
    if (b.context === "" && b.selector === ":root") continue;
    for (const n of declared(b.body)) assert.ok(rootNames.has(n), `${b.context} ${b.selector} يبدّل ${n} غير المعرّف`);
  }
  for (const m of tokens.matchAll(/var\((--[a-z0-9-]+)\)/g)) {
    assert.ok(rootNames.has(m[1]), `إحالة إلى توكن غير معرّف: ${m[1]}`);
  }
});

test("التوكنز: الأوضاع كلها حاضرة وقيم الهوية كما في Figma", () => {
  for (const q of ["prefers-contrast: more", "prefers-reduced-transparency: reduce", "prefers-reduced-motion: reduce"]) {
    assert.ok(tokens.includes(`@media (${q})`), `وضع ${q} غائب`);
  }
  assert.ok(tokens.includes('[data-module="shadhb"] {'), "كتلة شَذْب غائبة");
  assert.ok(tokens.includes(':root[data-appearance="dark"] { color-scheme: dark; }'));
  // قيم NsqV272 (m6): سطح القراءة، ولونا الوحدتين للفعل الرئيس، والطين للمختار
  assert.ok(tokens.includes("--surface-reading: light-dark(#f5f5f7, #242426);"));
  assert.ok(tokens.includes("--accent-nasaq: light-dark(#0a6e72, #1f7f83);"));
  assert.ok(tokens.includes("--accent-shadhb: light-dark(#4a6a4d, #4f7a53);"));
  assert.ok(tokens.includes("--accent-clay: #ad6236;"));
  assert.ok(tokens.includes("--fill-selected: var(--accent-clay-subtle);"), "المختار بالطين لا بلون الوحدة (DM7-04)");
});

// سلّم NsqV272 (m6): Cairo للواجهة بأوزانه الأربعة (٤٠٠ و٥٠٠ و٦٠٠ و٧٠٠)، وAlmarai للقراءة
// (٤٠٠ و٧٠٠)، وJetBrains Mono للشيفرة — سبعة أوجه، لا أكثر
test("الخطوط: سبعة أوجه فقط، وملفاتها موجودة، وعائلاتها هي عائلات التوكنز", () => {
  const faces = [...base.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => m[1]);
  assert.strictEqual(faces.length, 7);
  for (const face of faces) {
    const url = /url\("([^"]+)"\)/.exec(face)[1];
    assert.ok(fs.existsSync(srcPath(url)), `ملف الخط غائب: ${url}`);
    const family = /font-family:\s*"([^"]+)"/.exec(face)[1];
    assert.ok(tokens.includes(`: "${family}", `), `العائلة ${family} ليست في التوكنز`);
  }
});

// المرحلة ٨: الاتجاه المعاكس — لا ملف خط يُشحن بلا وجه يحمّله. كانت ثلاثة ملفات
// (‏Almarai-ExtraBold وCairo-Medium وCairo-Regular) تدخل الحزمة بلا @font-face
test("الخطوط: لا ملف خط في الحزمة بلا وجه يحمّله", () => {
  const loaded = new Set(
    [...base.matchAll(/url\("fonts\/([^"]+)"\)/g)].map((m) => m[1])
  );
  const onDisk = fs
    .readdirSync(srcPath("fonts"))
    .filter((f) => /\.(ttf|otf|woff2?)$/i.test(f));
  for (const file of onDisk) {
    assert.ok(loaded.has(file), `ملف خط يُشحن بلا @font-face: ${file}`);
  }
  assert.strictEqual(onDisk.length, loaded.size, "عدد ملفات الخطوط لا يطابق عدد الأوجه");
});

test("الأيقونات: معرّفات فريدة، ولكل رمز viewBox، ولا لون مثبّت", () => {
  const ids = [...icons.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length >= 50, "عدد الأيقونات أقل من المتوقع");
  assert.strictEqual(new Set(ids).size, ids.length, "معرّفات مكررة");
  const symbols = [...icons.matchAll(/<symbol ([^>]*)>([\s\S]*?)<\/symbol>/g)];
  assert.strictEqual(symbols.length, ids.length);
  for (const [, attrs, body] of symbols) {
    assert.ok(/viewBox="[\d.\s]+"/.test(attrs), `رمز بلا viewBox: ${attrs}`);
    assert.ok(!/\bid="/.test(body), `معرّف داخلي في ${attrs}`);
    for (const fill of body.matchAll(/fill="([^"]+)"/g)) {
      assert.strictEqual(fill[1], "currentColor", `لون مثبّت في ${attrs}`);
    }
  }
});

test("الأيقونات: كل رمز يشير إليه الهيكل أو الأبراج موجود في icons.svg", () => {
  const ids = new Set([...icons.matchAll(/<symbol id="([^"]+)"/g)].map((m) => m[1]));
  // اسم الرمز في السمة مكتوبًا، أو قيمةً نصية تُركَّب في وقت التشغيل (خرائط
  // الحالات) — الشكل نفسه: kebab بنقاط فمقاس ١٦ أو ٢٠ فوزن r أو m
  const NAME_RE = /["'`]#?([a-z][a-z0-9.]*\.\d\d[rm])["'`]/g;
  for (const file of [
    "index.html",
    "settings.html",
    "about.html",
    "nasaq.js",
    "shadhb.js",
    "shell.js",
    "layout.js",
    "settings.js",
  ]) {
    const code = fs.readFileSync(srcPath(file), "utf8");
    for (const m of code.matchAll(/<use href="#([^"]+)"/g)) {
      assert.ok(ids.has(m[1]), `${file} يشير إلى رمز غائب: ${m[1]}`);
    }
    for (const m of code.matchAll(NAME_RE)) {
      assert.ok(ids.has(m[1]), `${file} يركّب رمزًا غائبًا: ${m[1]}`);
    }
  }
});

test("أوراق الأنماط: لا لون مثبّت، وكل إحالة var() تجد توكنها", () => {
  const defined = new Set([
    ...[...tokens.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
    ...[...base.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]),
    // ومنها ما تضبطه الواجهة وقت التشغيل (موضع سهم النافذة المنبثقة مثلًا)
    ...["layout.js", "shell.js", "nasaq.js", "shadhb.js", "settings.js"].flatMap((file) =>
      [...fs.readFileSync(srcPath(file), "utf8").matchAll(/setProperty\("(--[a-z0-9-]+)"/g)].map((m) => m[1])
    ),
  ]);
  for (const sheet of ["app.css", "secondary.css"]) {
    const css = fs.readFileSync(srcPath(sheet), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    assert.ok(!/#[0-9a-f]{3,8}\b|rgba?\(/i.test(css), `لون مثبت في ${sheet} بدل التوكنز`);
    // للورقة أن تعرّف متغيّراتها المحلية (عرض الشريط الجانبي مثلًا)
    const known = new Set([...defined, ...[...css.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1])]);
    for (const m of css.matchAll(/var\((--[a-z0-9-]+)/g)) {
      assert.ok(known.has(m[1]), `${sheet} يحيل إلى توكن غير معرّف: ${m[1]}`);
    }
  }
});

// ════════ حرّاس المرحلة m5: لا قيمة تصميمية خارج التوكنز إلا بسببٍ مكتوب ════════

const SHEETS = ["base.css", "app.css", "forms.css", "secondary.css"];
const sheet = (f) => fs.readFileSync(srcPath(f), "utf8").replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

// أسماء الألوان التي يفهمها CSS. transparent ليست لونًا بل غيابه، وcurrentColor إحالة
const NAMED = /\b(black|white|red|green|blue|gray|grey|orange|yellow|purple|pink|brown|silver|gold|navy|teal|olive|maroon|lime|aqua|fuchsia|cyan|magenta)\b/i;

test("m5: لا لون خام في أي ورقة أنماط — الألوان كلها من tokens.css", () => {
  for (const file of SHEETS) {
    const css = sheet(file);
    const lit = css.match(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi);
    assert.deepStrictEqual(lit, null, `${file}: لون مثبّت خارج التوكنز: ${lit && lit.join(", ")}`);
    // اسم لونٍ لا يُسمح به إلا قناعًا (أبيض/أسود فيه شفافية لا لون)
    for (const m of css.matchAll(/(^|[;{])\s*([a-z-]+)\s*:([^;}]*)/g)) {
      const [, , prop, val] = m;
      if (!NAMED.test(val)) continue;
      assert.ok(/^(-webkit-)?mask(-image)?$/.test(prop), `${file}: اسم لون في ${prop} — الأسماء لا تُقبل إلا في القناع`);
    }
  }
});

// كل طولٍ بـpx خارج var() له سببه. الإضافة بلا سبب تُسقط الاختبار: استعمل توكنًا،
// أو أضف البند هنا تحت سببه. والبند الذي يزول من الكود يُحذف من القائمة.
const RAW_PX_ALLOWED = {
  "مقاس تقني لا تصميمي: للقارئ الصوتي وحده، ومرآة قياس مؤشر السطر الفارغ خارج الشاشة": [
    "base|.visually-hidden|width|1",
    "base|.visually-hidden|height|1",
    "app|.rtl-caret-mirror|inset-inline-start|-10000",
  ],
  "مقاس مكوّنٍ مقيس من NsqV272 ولا متغيّر له في الملف (عرض ثابت أو ارتفاع مكوّن) — يُرفع إلى Figma ثم يصير توكنًا": [
    // Title Bar 2164:3821: إشارات النظام ١٤، وSidebar Toggle 2408:10618 ارتفاعه ٢٦
    "app|.window-controls|inline-size|14",
    "app|.window-controls|block-size|14",
    "app|.title-toggle|block-size|26",
    // Search Field 26:388 ارتفاعه ٣٤ وعرضه في شريط البحث ٢٨٠، وصفّ التلميح ٣٤ (2009:281)
    // لوحة المسودات (Drafts-Sidebar-Open 2009:968) عرضها ٢٨٠، وحقل بحثها فيها ارتفاعه ٣٠
    "app|.drafts-panel|inline-size|280",
    "app|.search-field|block-size|30",
    "app|.search-field, .find-field|block-size|34",
    "app|.find-field|inline-size|280",
    "app|.hint-row|min-block-size|34",
    // Empty State 27:1169 عرضه ٥٢٠، ولوح «الأصل» ٤٤٠ (Result-Ready 2008:328)
    "app|.empty-state > *|max-inline-size|520",
    "app|[data-module=\"nasaq\"][data-nasaq-state=\"result\"] .column-source, [data-module=\"nasaq\"][data-nasaq-state=\"review\"] .column-source|inline-size|440",
    // Popup Button 2390:36: «النمط» ١٦٠ و«المستوى» ١٨٠، وPrimary Action في الشريط ٢٠٠
    "app|.dd-btn|min-inline-size|160",
    "app|#settings-content .popup-control:nth-child(2) .dd-btn|min-inline-size|180",
    "app|.primary-action|inline-size|200",
    // حلقة تركيز Primary Action 2120:64: ظلّ منتشر ٣ بلون focus/ring
    "app|.primary-action:focus-visible, .primary-action[aria-busy=\"true\"]:focus-visible|box-shadow|3",
    // Dropdown Menu 30:39 عرضه ٢٢٠ (أدناه ٢٠٠ حتى لا تضيق عن أقصر بند)
    "app|.dd-popup, .menu, .picker-menu|min-inline-size|200",
    "forms|.picker-menu|min-inline-size|200",
    // لوح شَذْب (Review-Decision 2009:1632) ٤٢٠، وفي الضيّق ٣٢٠؛ وCut Decision 2124:32 ارتفاعه ٤٤
    "app|.inspector|inline-size|420",
    // ولوح «جاهز» ٤٠٠ (info-sidebar في Ready 2009:1548)، والفعل الرئيس في اللوح بارتفاع مكوّنه ٤٢ (Primary Action 2120:64)
    "app|[data-module=\"shadhb\"][data-shadhb-state=\"ready\"] .inspector, [data-module=\"shadhb\"][data-shadhb-state=\"checking\"] .inspector|inline-size|400",
    "app|.panel-actions .primary-action|block-size|42",
    "app|.inspector|inline-size|320",
    "app|.decision-button|block-size|44",
    // Alert 30:26 عرضه ٤٠٠، وSheet 30:27 ٤٤٠ (وورقة التنويعات ٧٢٠)، وPopover 30:36 ٣٦٠
    "app|.alert|inline-size|400",
    "app|.sheet|inline-size|720",
    "app|.sheet-narrow|inline-size|440",
    "app|.popover|inline-size|360",
    "app|.variation|min-block-size|280",
    "app|.lens-phone|max-block-size|320",
    // Settings / General 2128:576: التسمية ١٢٠ والعنصر ٢٢٠، وToggle 26:449 مضماره ٣٦، وSettings Tab 26:110 ارتفاعه ٣٠
    "forms|.form-row > .row-label|inline-size|120",
    "forms|.row-picker, .row-input|inline-size|220",
    "forms|.form-row > .row-field|inline-size|220",
    "forms|.row-switch|inline-size|36",
    "secondary|.tab|block-size|30",
    // About-Window 2009:2911: صفّ إشارات النظام ١٤، والأيقونة ٨٠
    "secondary|.about|padding-block-start|14",
    "secondary|.about img|inline-size|80",
    "secondary|.about img|block-size|80",
  ],
};

// خصائص لا تحمل مقاسًا تصميميًا
const NOT_A_MEASURE = /^(flex|flex-grow|flex-shrink|z-index|order|content)$/;

function rawLengths(file) {
  const css = sheet(file);
  const out = [];
  const stack = [];
  let last = 0;
  for (const m of css.matchAll(/[{};]/g)) {
    const seg = css.slice(last, m.index);
    if (m[0] === "{") stack.push(seg.trim().replace(/\s+/g, " "));
    else {
      const d = seg.trim();
      const k = d.indexOf(":");
      if (d && k > 0 && !d.startsWith("@") && !NOT_A_MEASURE.test(d.slice(0, k).trim())) {
        const prop = d.slice(0, k).trim();
        const bare = d.slice(k + 1).replace(/var\(--[a-z0-9-]+(?:,[^()]*)?\)/gi, "T");
        const px = [...bare.matchAll(/(-?\d*\.?\d+)px\b/g)].map((x) => x[1]).filter((x) => Number(x) !== 0);
        if (px.length) out.push(`${file.replace(".css", "")}|${stack[stack.length - 1] || ""}|${prop}|${px.join(" ")}`);
      }
      if (m[0] === "}") stack.pop();
    }
    last = m.index + 1;
  }
  return out;
}

test("m5: كل طول px خارج التوكنز مذكورٌ في القائمة البيضاء بسببه", () => {
  const allowed = new Map();
  for (const [reason, list] of Object.entries(RAW_PX_ALLOWED)) for (const e of list) allowed.set(e, reason);
  const found = SHEETS.flatMap(rawLengths);
  const extra = found.filter((e) => !allowed.has(e));
  assert.deepStrictEqual(
    extra,
    [],
    `طولٌ خام جديد بلا سبب — استعمل توكنًا من tokens.css أو أضفه إلى RAW_PX_ALLOWED تحت سببه:\n  ${extra.join("\n  ")}`
  );
  const gone = [...allowed.keys()].filter((e) => !found.includes(e));
  assert.deepStrictEqual(gone, [], `بنودٌ في القائمة البيضاء لم تعد في الكود — تُحذف منها:\n  ${gone.join("\n  ")}`);
});
