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
