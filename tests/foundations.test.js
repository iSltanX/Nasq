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
  assert.ok(tokens.includes("--surface-window: light-dark(#ffffff, #1e1e1e);"));
  assert.ok(tokens.includes("--accent-nasaq-base: light-dark(#8c7bb0, #a89ac7);"));
  assert.ok(tokens.includes("--accent-shadhb-base: light-dark(#b09055, #c4ab78);"));
});

test("الخطوط: أربعة أوجه فقط، وملفاتها موجودة، وعائلاتها هي عائلات التوكنز", () => {
  const faces = [...base.matchAll(/@font-face\s*{([^}]*)}/g)].map((m) => m[1]);
  assert.strictEqual(faces.length, 4);
  for (const face of faces) {
    const url = /url\("([^"]+)"\)/.exec(face)[1];
    assert.ok(fs.existsSync(srcPath(url)), `ملف الخط غائب: ${url}`);
    const family = /font-family:\s*"([^"]+)"/.exec(face)[1];
    assert.ok(tokens.includes(`"${family}", system-ui`), `العائلة ${family} ليست في التوكنز`);
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
  "خط شعري أو شكل هندسي — لا توكن له ولا ينبغي": [
    "base|.visually-hidden|width|1",
    "base|.visually-hidden|height|1",
    "app|.rtl-caret|inline-size|2",
    "app|.rtl-caret|border-radius|1",
    "app|.rtl-caret-mirror|inset-inline-start|-10000",
    "app|.spinner|mask|0.5",
    "app|.glass-group|padding-inline|1",
    "app|.toolbar-item.has-label .label-icon|margin|2",
    "app|#nasaq-status[data-status=\"processing\"] .status-indicator|box-shadow|1.5",
    "app|#shadhb-status[data-status=\"checking\"] .status-indicator|box-shadow|1.5",
    "app|.draft-row[data-context-target], .version-row[data-context-target]|box-shadow|2",
    "app|.mark-pending, .mark-selected|text-decoration-thickness|2",
    "app|.mark-pending, .mark-selected|text-underline-offset|2",
    "app|#cut-card .card-quote|border-inline-start|2",
    "app|.covenant-bar-icon|margin-block-start|2",
    "app|.lens-header|gap|2",
    "app|.alert-app-icon|margin-block-end|6",
    "app|.popover::before|inset-block-start|-10",
    "app|.popover::before|inline-size|25",
    "app|.popover::before|block-size|11",
    "app|.glass-group, .module-switcher|box-shadow|6 -2",
    "app|.action-button[data-style=\"glass\"]|box-shadow|6 -2",
    "app|.action-button[data-style=\"glass\"]:focus-visible|box-shadow|6 -2",
    "app|.action-button:disabled:not([aria-busy=\"true\"])|box-shadow|6 -2",
    "app|.alert|transform|40",
    "forms|.row-switch::after|inset-block-start|1.5",
    "forms|.row-switch::after|inset-inline-start|1.5",
    "forms|.row-switch::after|box-shadow|0.5 1.5",
    "forms|.row-switch[aria-checked=\"true\"]::after|inset-inline-end|1.5",
    "secondary|.tab|padding|6",
    "secondary|.about .app-promise|margin-block-start|7",
    "secondary|.about .app-rights|margin-block-start|7",
  ],
  "أطوال هيكل التحميل — مقاسات غير منتظمة عمدًا لتشبه سطورًا حقيقية": [
    "app|.skeleton-paragraph:first-of-type .skeleton-line:nth-child(1)|inline-size|300",
    "app|.skeleton-paragraph:first-of-type .skeleton-line:nth-child(2)|inline-size|220",
    "app|.skeleton-paragraph:first-of-type .skeleton-line:nth-child(3)|inline-size|360",
    "app|.skeleton-paragraph:last-of-type .skeleton-line:nth-child(1)|inline-size|260",
    "app|.skeleton-paragraph:last-of-type .skeleton-line:nth-child(2)|inline-size|320",
    "app|.skeleton-paragraph:last-of-type .skeleton-line:nth-child(3)|inline-size|200",
    "app|.report-skeleton .skeleton-line:last-child|inline-size|180",
    "app|.reading-card-skeleton .skeleton-line:nth-child(2)|inline-size|200",
    "app|.reading-card-skeleton .skeleton-line:nth-child(4)|inline-size|160",
    "app|.variation[data-state=\"generating\"] .skeleton-line:nth-child(3)|inline-size|140",
    "app|.variation[data-state=\"generating\"] .skeleton-line:nth-child(5)|inline-size|100",
  ],
  "مقيس من إطارات Figma ولا متغيّر له هناك — يُرفع إلى Figma ثم يصير توكنًا": [
    "app|:root|--window-controls|60",
    "app|:root|--window-controls-inset|19",
    "app|.window-controls|block-size|14",
    "app|.sidebar-top|gap|17",
    "app|.text-area|min-block-size|64",
    "app|.text-area|max-block-size|98",
    "app|.dd-btn|padding-inline|13",
    "app|.menu, .dd-popup|min-inline-size|160",
    "app|.menu|min-inline-size|212",
    "forms|.picker-menu|inline-size|180",
    "app|.inspector-row.control .dd-btn|max-inline-size|200",
    "app|.find-step|inline-size|21",
    "app|.variation|block-size|320",
    "app|.sheet-narrow|inline-size|480",
    "app|.welcome-intro|gap|28",
    "app|.welcome-features|gap|18",
    "app|.welcome-feature-icon|inline-size|28",
    "app|.welcome-feature-icon|block-size|28",
    "app|.welcome-feature-icon svg|inline-size|24",
    "app|.welcome-feature-icon svg|block-size|24",
    "app|.empty-state:not(.empty-state-compact) .empty-body|max-inline-size|400",
    "secondary|.pane|gap|28",
    "secondary|body[data-window=\"about\"]|padding-block-start|40",
    "app|.lens-phone|inline-size|375",
  ],
  "أداة معاينة الأسس لا واجهة التطبيق": [
    "app|[data-preview] .window-controls|background|53 7 6.5 7 30 7 6.5 7 7 7 6.5 7",
    "app|[data-preview] .window-controls|background-size|60 14",
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
