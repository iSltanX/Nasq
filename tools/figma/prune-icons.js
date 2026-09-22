// يحذف من src/icons.svg الرموز التي لا تستعملها الشاشات (فحص m8، البند ٢٣): بعد m6 صارت
// معظم الرموز أحرفًا من خط النظام (SF)، فبقيت ٤٥ من ٥٨ رمزًا بلا مستعمل تُحمَّل مع كل نافذة.
// السياسة نفسها التي يعلنها build-icons.js — «لا يدخل إلا ما تستعمله الشاشات فعلًا» —
// مطبَّقةً على الملف القائم لأن تصدير Figma الأصلي لم يعد في الشجرة. قابل للإعادة، وحارسه
// في tests/foundations.test.js يمنع عودة رمزٍ بلا مستعمل.
//
//   node tools/figma/prune-icons.js            # يكتب src/icons.svg
//   node tools/figma/prune-icons.js --check    # يطبع الرموز بلا مستعمل ويخرج بـ 1 إن وُجدت
const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "..", "src");
const read = (name) => fs.readFileSync(path.join(src, name), "utf8");
const users = fs
  .readdirSync(src)
  .filter((f) => /\.(js|html|css)$/.test(f))
  .map(read)
  .join("\n");

const file = path.join(src, "icons.svg");
const svg = fs.readFileSync(file, "utf8");
const symbols = [...svg.matchAll(/<symbol[^>]*\bid="([^"]+)"[\s\S]*?<\/symbol>\s*/g)];
// مستعمَلٌ بالسمة (href="#id") أو قيمةً نصية تُركَّب في وقت التشغيل (خرائط الحالات: "scissors.16m")
const used = (id) => users.includes(`#${id}`) || new RegExp(`["'\`]${id.replace(/\./g, "\\.")}["'\`]`).test(users);
const unused = symbols.filter(([, id]) => !used(id));

if (process.argv.includes("--check")) {
  for (const [, id] of unused) console.log(id);
  process.exit(unused.length ? 1 : 0);
}
let out = svg;
for (const [block] of unused) out = out.replace(block, "");
fs.writeFileSync(file, out);
console.log(`حُذف ${unused.length} من ${symbols.length} رمزًا، وبقي ${symbols.length - unused.length}`);
