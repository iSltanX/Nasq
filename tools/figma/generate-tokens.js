// مولّد src/tokens.css من متغيرات ملف Figma «nasq-v10» (DZQACOUgD70llKedxWcHbK).
//
// يعمل داخل Figma (Plugin API) عبر أداة use_figma، ويعيد { css, hash }:
// يُكتب css في src/tokens.css كما هو، ثم يُطابَق hash محليًا (FNV-1a 32 على
// وحدات UTF-16) للتأكد من أن النقل حرفي. لا يُحرَّر tokens.css يدويًا.
//
// البنية:
// - Appearance (فاتح/داكن) → light-dark()، وتباينه المرتفع في prefers-contrast
//   بالقيم المختلفة وحدها، واختيار المظهر من الإعدادات عبر html[data-appearance].
// - Module (نَسَق/شَذْب) → :root و[data-module="shadhb"] بإحالات var().
// - Material (افتراضي/تقليل الشفافية) → prefers-reduced-transparency أو
//   html[data-reduce-transparency].
// - Dimensions وTypography → قيم px، وأنماط النص → اختزال font كامل.
// - Motion (افتراضي/تقليل الحركة) → prefers-reduced-motion.
// - أنماط المؤثرات → --elevation-popover و--elevation-window و--focus-ring
//   (لا --shadow-* لأن Appearance يملك ألوانًا بهذه الأسماء).
const cols = await figma.variables.getLocalVariableCollectionsAsync();
const vars = await figma.variables.getLocalVariablesAsync();
const byId = new Map(vars.map((v) => [v.id, v]));
const colById = new Map(cols.map((c) => [c.id, c]));
const colByName = Object.fromEntries(cols.map((c) => [c.name, c]));
const modeId = (colName, modeName) => colByName[colName].modes.find((m) => m.name === modeName).modeId;
const cssName = (n) => "--" + n.toLowerCase().replace(/[\/\s·]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-+/g, "-");
const hex2 = (x) => Math.round(x * 255).toString(16).padStart(2, "0");
const num = (x) => String(Math.round(x * 1000) / 1000);
const colorLit = (c) =>
  c.a === undefined || c.a >= 0.999
    ? "#" + hex2(c.r) + hex2(c.g) + hex2(c.b)
    : `rgb(${Math.round(c.r * 255)} ${Math.round(c.g * 255)} ${Math.round(c.b * 255)} / ${num(c.a)})`;

function resolveLiteral(v, appearanceMode) {
  const col = colById.get(v.variableCollectionId);
  const mId = col.name === "Appearance" ? modeId("Appearance", appearanceMode) : col.modes[0].modeId;
  const val = v.valuesByMode[mId];
  if (val && typeof val === "object" && val.type === "VARIABLE_ALIAS") return resolveLiteral(byId.get(val.id), appearanceMode);
  return val;
}

const L = [];
const push = (s) => L.push(s);
push("/* tokens.css — مولَّد آليًا من متغيرات ملف Figma «nasq-v10» وأنماطه (صفحات v11).");
push("   لا يُحرَّر يدويًا: يُعاد توليده من Figma حين يتغير التصميم. */");
push("");
push(":root {");
push("  color-scheme: light dark;");

push("");
push("  /* Appearance — فاتح | داكن */");
const icLines = [];
for (const id of colByName["Appearance"].variableIds) {
  const v = byId.get(id);
  if (v.resolvedType !== "COLOR") continue;
  const l = colorLit(resolveLiteral(v, "Light"));
  const d = colorLit(resolveLiteral(v, "Dark"));
  const li = colorLit(resolveLiteral(v, "Light · Increased Contrast"));
  const di = colorLit(resolveLiteral(v, "Dark · Increased Contrast"));
  push(`  ${cssName(v.name)}: ${l === d ? l : `light-dark(${l}, ${d})`};`);
  if (li !== l || di !== d) icLines.push(`    ${cssName(v.name)}: ${li === di ? li : `light-dark(${li}, ${di})`};`);
}

push("");
push("  /* Material — افتراضي */");
const mat = colByName["Material"];
const matRT = [];
for (const id of mat.variableIds) {
  const v = byId.get(id);
  const d = v.valuesByMode[mat.modes[0].modeId];
  const r = v.valuesByMode[mat.modes[1].modeId];
  push(`  ${cssName(v.name)}: var(${cssName(byId.get(d.id).name)});`);
  matRT.push(`${cssName(v.name)}: var(${cssName(byId.get(r.id).name)});`);
}

push("");
push("  /* Dimensions */");
for (const id of colByName["Dimensions"].variableIds) {
  const v = byId.get(id);
  push(`  ${cssName(v.name)}: ${num(resolveLiteral(v))}px;`);
}

push("");
push("  /* Typography */");
const fam = {
  display: resolveLiteral(vars.find((v) => v.name === "font/family/display")),
  text: resolveLiteral(vars.find((v) => v.name === "font/family/text")),
};
push(`  --font-display: "${fam.display}", system-ui, sans-serif;`);
push(`  --font-text: "${fam.text}", system-ui, sans-serif;`);
for (const id of colByName["Typography"].variableIds) {
  const v = byId.get(id);
  if (v.resolvedType !== "FLOAT") continue;
  push(`  ${cssName(v.name)}: ${num(resolveLiteral(v))}px;`);
}
const weight = { Light: 300, Regular: 400, Medium: 500, SemiBold: 600, Bold: 700, ExtraBold: 800 };
const styles = (await figma.getLocalTextStylesAsync()).filter((s) => !s.name.startsWith("Doc/"));
for (const s of styles) {
  const family = s.fontName.family === fam.display ? "var(--font-display)" : "var(--font-text)";
  push(`  ${cssName("type/" + s.name)}: ${weight[s.fontName.style]} ${num(s.fontSize)}px/${num(s.lineHeight.value)}px ${family};`);
}

push("");
push("  /* Motion — افتراضي */");
const mot = colByName["Motion"];
const motRM = [];
const motVal = (v, mId) => {
  const val = v.valuesByMode[mId];
  if (v.resolvedType === "BOOLEAN") return val ? "1" : "0";
  if (v.resolvedType === "EASING") {
    const b = val.easingFunctionCubicBezier;
    return `cubic-bezier(${num(b.x1)}, ${num(b.y1)}, ${num(b.x2)}, ${num(b.y2)})`;
  }
  return v.name.includes("duration") ? `${num(val)}ms` : `${num(val)}px`;
};
for (const id of mot.variableIds) {
  const v = byId.get(id);
  const a = motVal(v, mot.modes[0].modeId);
  const b = motVal(v, mot.modes[1].modeId);
  push(`  ${cssName(v.name)}: ${a};`);
  if (a !== b) motRM.push(`    ${cssName(v.name)}: ${b};`);
}

push("");
push("  /* Effects */");
const effects = await figma.getLocalEffectStylesAsync();
const shadowOf = (s) =>
  s.effects
    .filter((e) => e.type === "DROP_SHADOW")
    .map((e) => {
      const b = e.boundVariables || {};
      const color = b.color ? `var(${cssName(byId.get(b.color.id).name)})` : colorLit(e.color);
      return `${num(e.offset.x)}px ${num(e.offset.y)}px ${num(e.radius)}px ${num(e.spread || 0)}px ${color}`;
    })
    .join(", ");
const effectName = {
  "Material/Solid · Popover": "--elevation-popover",
  "Elevation/Window": "--elevation-window",
  "Focus/Ring": "--focus-ring",
};
for (const s of effects) {
  if (!effectName[s.name]) continue;
  push(`  ${effectName[s.name]}: ${shadowOf(s)};`);
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

const css = L.join("\n") + "\n";
let h = 0x811c9dc5;
for (let i = 0; i < css.length; i++) {
  h ^= css.charCodeAt(i);
  h = Math.imul(h, 0x01000193) >>> 0;
}
return { hash: h.toString(16), lines: L.length, chars: css.length, css };
