// يبني src/icons.svg (رموز <symbol>) من تصدير SVG لأيقونات ملف Figma «nasq-v10».
//
// الاستعمال:
//   node tools/figma/build-icons.js <library.svg> <chevron.backward.2.svg>
// حيث library.svg تصدير SVG للقسم «Icons · Library» (54:2) كاملًا، والثاني
// تصدير الشكل 191:363 (خارج القسم). كلاهما من أداة download_assets بصيغة svg.
//
// لا يدخل إلا ما تستعمله الشاشات فعلًا (مسح نسخ Icon/* في صفحات نَسَق وشَذْب
// ونوافذ التطبيق). الأشكال مصمتة بلون واحد، فتصير currentColor وتأخذ لونها
// من التوكنز. التصدير يرسم القسم بهامش ٤٠ حول حدوده، وكل شكل يُقصّ بمربعه.
const fs = require("fs");
const path = require("path");

const EXPORT_MARGIN = 40;

// الشكل → موضعه داخل القسم 54:2 ومقاسه (من Figma)
const USED = {
  "arrow.clockwise.16m": [864, 368, 16],
  "arrow.clockwise.20r": [896, 368, 20],
  "arrow.uturn.backward.20r": [1152, 752, 20],
  "checkmark.16m": [608, 368, 16],
  "checkmark.16r": [576, 368, 16],
  "checkmark.circle.16m": [352, 368, 16],
  "checkmark.seal.16r": [832, 1008, 16],
  "chevron.down.16m": [96, 240, 16],
  "chevron.forward.16m": [352, 240, 16],
  "chevron.up.chevron.down.16m": [864, 240, 16],
  "circle.dotted.16m": [352, 1008, 16],
  "circle.dotted.16r": [320, 1008, 16],
  "command.16r": [576, 624, 16],
  "doc.on.doc.16m": [864, 880, 16],
  "doc.on.doc.20r": [896, 880, 20],
  "doc.text.16r": [64, 752, 16],
  "doc.text.magnifyingglass.16r": [576, 1008, 16],
  "ellipsis.circle.16r": [1088, 112, 16],
  "gearshape.20r": [640, 112, 20],
  "info.circle.16r": [1088, 240, 16],
  "info.circle.20r": [1152, 240, 20],
  "iphone.20r": [1152, 1136, 20],
  "list.bullet.16r": [1344, 880, 16],
  "lock.20r": [384, 624, 20],
  "magnifyingglass.16m": [864, 112, 16],
  "magnifyingglass.16r": [832, 112, 16],
  "magnifyingglass.20r": [896, 112, 20],
  "nsq.approve.16m": [608, 1136, 16],
  "nsq.approve.16r": [576, 1136, 16],
  "nsq.nasaq.16m": [96, 1136, 16],
  "nsq.nasaq.20r": [128, 1136, 20],
  "nsq.shadhb.16m": [352, 1136, 16],
  "nsq.shadhb.20r": [384, 1136, 20],
  "rectangle.compress.vertical.20r": [1408, 752, 20],
  "rectangle.split.3x1.16m": [864, 752, 16],
  "return.16r": [1344, 1136, 16],
  "return.left.20r": [128, 880, 20],
  "scissors.16m": [96, 1008, 16],
  "scissors.16r": [64, 1008, 16],
  "sidebar.leading.20r": [128, 112, 20],
  "sidebar.trailing.20r": [384, 112, 20],
  "slider.horizontal.3.16r": [1344, 1008, 16],
  "square.and.arrow.up.20r": [896, 624, 20],
  "text.badge.minus.20r": [384, 880, 20],
  "text.badge.plus.20r": [640, 880, 20],
  "tray.and.arrow.down.20r": [384, 752, 20],
  "xmark.16r": [1344, 112, 16],
  "xmark.circle.fill.16m": [864, 1136, 16],
  "xmark.octagon.16m": [96, 368, 16],
  "xmark.octagon.20r": [128, 368, 20],
  "xmark.seal.16r": [1088, 1008, 16],
};
// أشكال خارج القسم: تُصدَّر منفردة بإحداثياتها المحلية
const STANDALONE = { "chevron.backward.2.20r": 20 };

// شجرة عناصر مبسطة: تصدير Figma لا يحوي نصوصًا، فالوسوم وحدها تكفي
function parse(svg) {
  const root = { tag: "#root", attrs: "", children: [] };
  const stack = [root];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)([^>]*?)(\/?)>/g)) {
    const [, closing, tag, attrs, selfClosing] = m;
    if (closing) {
      stack.pop();
      continue;
    }
    const node = { tag, attrs: attrs.trim(), children: [] };
    stack[stack.length - 1].children.push(node);
    if (!selfClosing) stack.push(node);
  }
  return root;
}

const idOf = (node) => (/\bid="([^"]*)"/.exec(node.attrs) || [])[1];

function* walk(node) {
  yield node;
  for (const child of node.children) yield* walk(child);
}

function variantKey(iconName, variantId) {
  // التصدير يميّز المعرّفات المكررة بلاحقة _N
  const m = /^Size=(\d+), Weight=(Regular|Medium)(?:_\d+)?$/.exec(variantId);
  if (!m) return null;
  return `${iconName}.${m[1]}${m[2] === "Regular" ? "r" : "m"}`;
}

function serialize(node) {
  let attrs = node.attrs.replace(/\s*\bid="[^"]*"/g, "");
  if (/\bfill="/.test(attrs)) {
    if (!/\bfill="black" fill-opacity="0\.85"/.test(attrs)) {
      throw new Error(`تعبئة غير متوقعة في أيقونة: <${node.tag} ${attrs}>`);
    }
    attrs = attrs.replace(/\bfill="black" fill-opacity="0\.85"/, 'fill="currentColor"');
  }
  attrs = attrs.trim();
  const open = `<${node.tag}${attrs ? " " + attrs : ""}`;
  return node.children.length ? `${open}>${node.children.map(serialize).join("")}</${node.tag}>` : `${open}/>`;
}

function variantsIn(svg) {
  const found = new Map();
  for (const node of walk(parse(svg))) {
    const id = idOf(node);
    if (node.tag !== "g" || !id || !id.startsWith("Icon/")) continue;
    const iconName = id.slice(5).replace(/_\d+$/, "");
    for (const variant of node.children) {
      const key = variantKey(iconName, idOf(variant) || "");
      if (key) found.set(key, variant.children.map(serialize).join(""));
    }
  }
  return found;
}

function main() {
  const [libraryPath, ...standalonePaths] = process.argv.slice(2);
  if (!libraryPath) throw new Error("الاستعمال: node tools/figma/build-icons.js <library.svg> <standalone.svg ...>");

  const library = variantsIn(fs.readFileSync(libraryPath, "utf8"));
  const standalone = new Map();
  for (const p of standalonePaths) {
    for (const [k, v] of variantsIn(fs.readFileSync(p, "utf8"))) standalone.set(k, v);
  }

  const symbols = [];
  for (const [key, [x, y, size]] of Object.entries(USED)) {
    const body = library.get(key);
    if (!body) throw new Error(`الشكل ${key} غائب عن تصدير المكتبة`);
    symbols.push(`<symbol id="${key}" viewBox="${x + EXPORT_MARGIN} ${y + EXPORT_MARGIN} ${size} ${size}">${body}</symbol>`);
  }
  for (const [key, size] of Object.entries(STANDALONE)) {
    const body = standalone.get(key);
    if (!body) throw new Error(`الشكل ${key} غائب عن التصديرات المنفردة`);
    symbols.push(`<symbol id="${key}" viewBox="0 0 ${size} ${size}">${body}</symbol>`);
  }
  symbols.sort();

  const out =
    '<svg xmlns="http://www.w3.org/2000/svg">\n' +
    "<!-- أيقونات نَسَق • شَذْب — مولَّدة من Figma بـ tools/figma/build-icons.js، لا تُحرَّر يدويًا -->\n" +
    symbols.join("\n") +
    "\n</svg>\n";
  const dest = path.join(__dirname, "..", "..", "src", "icons.svg");
  fs.writeFileSync(dest, out);
  console.log(`src/icons.svg: ${symbols.length} رمزًا، ${out.length} حرفًا`);
}

main();
