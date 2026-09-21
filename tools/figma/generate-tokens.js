// مولّد src/tokens.css من متغيرات ملف Figma «NsqV272» (EVuGwuf3VRGqLcHmJCQyAR) وأنماطه.
//
// يعمل داخل Figma (Plugin API) عبر أداة use_figma، ويعيد { css, hash }:
// يُكتب css في src/tokens.css كما هو، ثم يُطابَق hash محليًا (FNV-1a 32 على
// وحدات UTF-16) للتأكد من أن النقل حرفي. لا يُحرَّر tokens.css يدويًا.
//
// البنية (مجموعات الملف التسع؛ «Prototype State» للنموذج التفاعلي وحده فلا تُولَّد):
// - Primitives → قيمها كما هي، عدا `_archive/*`. الألوان بلا وحدة، والأطوال px، والمدد ms.
// - Appearance (فاتح | داكن | تباين مرتفع لكلٍّ) → light-dark()، والتباين المرتفع في
//   prefers-contrast بالقيم المختلفة وحدها، واختيار المظهر من الإعدادات عبر
//   html[data-appearance].
// - Component Aliases → var() إلى متغيّرها حين تتّفق الأوضاع الأربعة عليه، وإلا قيمها.
// - Module (نَسَق | شَذْب) → :root و[data-module="shadhb"] بإحالات var().
// - Material (افتراضي | تقليل الشفافية) → prefers-reduced-transparency أو
//   html[data-reduce-transparency].
// - Dimensions (Wide | Standard | Compact): شاشات الملف كلها على Standard، فهو :root،
//   والآخران تحت html[data-dimensions].
// - Typography → px، وأنماط النص → اختزال font كامل باسم `--type-*`.
// - Motion (افتراضي | تقليل الحركة) → ms، وprefers-reduced-motion.
// - أنماط المؤثرات → `--elevation-*` (لا `--shadow-*`: Appearance يملك ألوانًا بهذه الأسماء).
const cols = await figma.variables.getLocalVariableCollectionsAsync();
const vars = await figma.variables.getLocalVariablesAsync();
const byId = new Map(vars.map((v) => [v.id, v]));
const colById = new Map(cols.map((c) => [c.id, c]));
const colByName = Object.fromEntries(cols.map((c) => [c.name, c]));
const cssName = (n) => "--" + n.toLowerCase().replace(/[\/\s·]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-");
const hex2 = (x) => Math.round(x * 255).toString(16).padStart(2, "0");
const num = (x) => String(Math.round(x * 1000) / 1000);
const colorLit = (c) =>
  c.a === undefined || c.a >= 0.999
    ? "#" + hex2(c.r) + hex2(c.g) + hex2(c.b)
    : `rgb(${Math.round(c.r * 255)} ${Math.round(c.g * 255)} ${Math.round(c.b * 255)} / ${num(c.a)})`;
const APPEARANCE = ["Light", "Dark", "Light Increased Contrast", "Dark Increased Contrast"];
const isArchived = (v) => v.name.startsWith("_archive/");

// قيمة المتغيّر في وضع مظهرٍ بعينه: تتبع الإحالات حتى الحرف، وكل مجموعة بأوضاع المظهر
// الأربعة تُقرأ بوضعها المسمّى، وغيرها بوضعها الأول
function literal(v, appearance) {
  const col = colById.get(v.variableCollectionId);
  const named = col.modes.find((m) => m.name === appearance);
  const val = v.valuesByMode[(named || col.modes[0]).modeId];
  if (val && typeof val === "object" && val.type === "VARIABLE_ALIAS") return literal(byId.get(val.id), appearance);
  return val;
}
const unit = (v) => (v.name.startsWith("duration/") || v.name.startsWith("motion/") ? "ms" : "px");
const floatLit = (v, val) => `${num(val)}${unit(v)}`;

const names = new Map();
const L = [];
const push = (s) => L.push(s);
const declare = (v, value) => {
  const n = cssName(v.name);
  if (names.has(n)) throw new Error(`اسمان يتصادمان في CSS: ${v.name} و${names.get(n)}`);
  names.set(n, v.name);
  push(`  ${n}: ${value};`);
};

push("/* tokens.css — مولَّد آليًا من متغيرات ملف Figma «NsqV272» وأنماطه.");
push("   لا يُحرَّر يدويًا: يُعاد توليده من Figma حين يتغير التصميم (tools/figma/generate-tokens.js). */");
push("");
push(":root {");
push("  color-scheme: light dark;");

push("");
push("  /* Primitives */");
for (const id of colByName["Primitives"].variableIds) {
  const v = byId.get(id);
  if (!v || isArchived(v)) continue;
  const val = literal(v, "Light");
  declare(v, v.resolvedType === "COLOR" ? colorLit(val) : v.name === "radius/full" ? "9999px" : floatLit(v, val));
}

// مجموعة بأوضاع المظهر الأربعة: إحالةٌ واحدة في الأوضاع كلها إلى متغيّرٍ مولَّد → var()،
// وإلا فالقيم: light-dark() والتباين المرتفع بما اختلف وحده
const icLines = [];
function appearanceCollection(colName) {
  const col = colByName[colName];
  for (const id of col.variableIds) {
    const v = byId.get(id);
    if (!v || v.resolvedType !== "COLOR") continue;
    const raw = APPEARANCE.map((a) => v.valuesByMode[col.modes.find((m) => m.name === a).modeId]);
    const alias = raw.every((r) => r && r.type === "VARIABLE_ALIAS" && r.id === raw[0].id) ? byId.get(raw[0].id) : null;
    if (alias && !isArchived(alias)) { declare(v, `var(${cssName(alias.name)})`); continue; }
    const [l, d, li, di] = APPEARANCE.map((a) => colorLit(literal(v, a)));
    declare(v, l === d ? l : `light-dark(${l}, ${d})`);
    if (li !== l || di !== d) icLines.push(`    ${cssName(v.name)}: ${li === di ? li : `light-dark(${li}, ${di})`};`);
  }
}
push("");
push("  /* Appearance — فاتح | داكن */");
appearanceCollection("Appearance");
push("");
push("  /* Component Aliases */");
appearanceCollection("Component Aliases");

push("");
push("  /* Material — افتراضي */");
const mat = colByName["Material"];
const matRT = [];
const matLit = (v, mode) => {
  const val = v.valuesByMode[mode.modeId];
  if (val && val.type === "VARIABLE_ALIAS") return `var(${cssName(byId.get(val.id).name)})`;
  return v.resolvedType === "COLOR" ? colorLit(val) : floatLit(v, val);
};
for (const id of mat.variableIds) {
  const v = byId.get(id);
  const a = matLit(v, mat.modes[0]);
  const b = matLit(v, mat.modes[1]);
  declare(v, a);
  if (a !== b) matRT.push(`${cssName(v.name)}: ${b};`);
}

push("");
push("  /* Dimensions — Standard */");
const dim = colByName["Dimensions"];
const dimMode = (name) => dim.modes.find((m) => m.name === name);
const dimOther = { Wide: [], Compact: [] };
for (const id of dim.variableIds) {
  const v = byId.get(id);
  const std = v.valuesByMode[dimMode("Standard").modeId];
  declare(v, floatLit(v, std));
  for (const k of Object.keys(dimOther)) {
    const o = v.valuesByMode[dimMode(k).modeId];
    if (o !== std) dimOther[k].push(`  ${cssName(v.name)}: ${floatLit(v, o)};`);
  }
}

push("");
push("  /* Typography */");
for (const id of colByName["Typography"].variableIds) {
  const v = byId.get(id);
  if (v.resolvedType !== "FLOAT") continue;
  declare(v, floatLit(v, literal(v, "Light")));
}
// عائلات الملف: Cairo للواجهة وAlmarai للقراءة (DM6-02)، وJetBrains Mono للشيفرة،
// وSF Pro للاختصارات والرموز
const family = {
  Cairo: '"Cairo", system-ui, sans-serif',
  Almarai: '"Almarai", system-ui, sans-serif',
  "JetBrains Mono": '"JetBrains Mono", ui-monospace, "SF Mono", monospace',
  "SF Pro": '-apple-system, "SF Pro", system-ui, sans-serif',
};
push(`  --font-ui: ${family.Cairo};`);
push(`  --font-reading: ${family.Almarai};`);
push(`  --font-code: ${family["JetBrains Mono"]};`);
push(`  --font-system: ${family["SF Pro"]};`);
const familyVar = { Cairo: "var(--font-ui)", Almarai: "var(--font-reading)", "JetBrains Mono": "var(--font-code)", "SF Pro": "var(--font-system)" };
const weight = { Light: 300, Regular: 400, Medium: 500, SemiBold: 600, Bold: 700 };
for (const s of await figma.getLocalTextStylesAsync()) {
  if (!(s.fontName.family in familyVar)) throw new Error(`عائلة خارج البيت في نمط ${s.name}: ${s.fontName.family}`);
  if (!(s.fontName.style in weight)) throw new Error(`وزن غير معروف في نمط ${s.name}: ${s.fontName.style}`);
  if (s.lineHeight.unit !== "PIXELS") throw new Error(`ارتفاع سطر ليس px في نمط ${s.name}`);
  const n = cssName("type/" + s.name);
  if (names.has(n)) throw new Error(`اسمان يتصادمان في CSS: نمط ${s.name} و${names.get(n)}`);
  names.set(n, "style:" + s.name);
  push(`  ${n}: ${weight[s.fontName.style]} ${num(s.fontSize)}px/${num(s.lineHeight.value)}px ${familyVar[s.fontName.family]};`);
}

push("");
push("  /* Motion — افتراضي */");
const mot = colByName["Motion"];
const motRM = [];
for (const id of mot.variableIds) {
  const v = byId.get(id);
  const a = floatLit(v, v.valuesByMode[mot.modes[0].modeId]);
  const b = floatLit(v, v.valuesByMode[mot.modes[1].modeId]);
  declare(v, a);
  if (a !== b) motRM.push(`    ${cssName(v.name)}: ${b};`);
}

push("");
push("  /* Effects */");
for (const s of await figma.getLocalEffectStylesAsync()) {
  const shadows = s.effects.filter((e) => e.type === "DROP_SHADOW").map((e) => {
    const b = e.boundVariables || {};
    const color = b.color ? `var(${cssName(byId.get(b.color.id).name)})` : colorLit(e.color);
    return `${num(e.offset.x)}px ${num(e.offset.y)}px ${num(e.radius)}px ${num(e.spread || 0)}px ${color}`;
  });
  if (!shadows.length) continue; // Material/Blur قيمته متغيّر material/blur
  const n = "--elevation-" + s.name.split("/").pop().toLowerCase();
  if (names.has(n)) throw new Error(`اسمان يتصادمان في CSS: ${s.name}`);
  names.set(n, "effect:" + s.name);
  push(`  ${n}: ${shadows.join(", ")};`);
}
push("}");

push("");
push("/* اختيار المظهر من الإعدادات يتقدّم على مظهر النظام */");
push(':root[data-appearance="light"] { color-scheme: light; }');
push(':root[data-appearance="dark"] { color-scheme: dark; }');

push("");
push('/* الوحدة: ألوان نَسَق افتراضيًا، وشَذْب حين data-module="shadhb" */');
const mod = colByName["Module"];
for (const [sel, idx] of [[":root", 0], ['[data-module="shadhb"]', 1]]) {
  push(`${sel} {`);
  for (const id of mod.variableIds) {
    const v = byId.get(id);
    const a = v.valuesByMode[mod.modes[idx].modeId];
    if (idx === 0) names.set(cssName(v.name), v.name);
    push(`  ${cssName(v.name)}: var(${cssName(byId.get(a.id).name)});`);
  }
  push("}");
}

push("");
push("@media (prefers-contrast: more) {");
push("  :root {");
for (const l of icLines) push(l);
push("  }");
push("}");

push("");
push("/* تقليل الشفافية: من النظام، أو من سمة يضعها التطبيق حين لا يدعم المحرك الاستعلام */");
push("@media (prefers-reduced-transparency: reduce) {");
push("  :root {");
for (const l of matRT) push("    " + l);
push("  }");
push("}");
push(":root[data-reduce-transparency] {");
for (const l of matRT) push("  " + l);
push("}");

push("");
push("@media (prefers-reduced-motion: reduce) {");
push("  :root {");
for (const l of motRM) push(l);
push("  }");
push("}");

push("");
push("/* Dimensions: شاشات الملف كلها على Standard؛ الوضعان الآخران لمن يطلبهما صراحةً */");
for (const [k, lines] of Object.entries(dimOther)) {
  push(`:root[data-dimensions="${k.toLowerCase()}"] {`);
  for (const l of lines) push(l);
  push("}");
}

const css = L.join("\n") + "\n";
let h = 0x811c9dc5;
for (let i = 0; i < css.length; i++) {
  h ^= css.charCodeAt(i);
  h = Math.imul(h, 0x01000193) >>> 0;
}
return { hash: h.toString(16), lines: L.length, chars: css.length, css };
