// فحص m4 — السلوك التفاعلي ولوحة المفاتيح: حرّاس ما قيس في المتصفح وأُصلح.
// يعمل بـ: npm test. بعضها يشغّل الملف نفسه في vm (menu.js)، وبعضها يقرأ الكود
// والأنماط، لأن ما يحرسه قاعدةٌ في البنية لا دالةٌ صرفة.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const src = (name) => fs.readFileSync(path.join(__dirname, "..", "src", name), "utf8");

// ---------- m4-01: أمرٌ في الشريط زرّه مخفيٌّ دائمًا معطّلٌ دائمًا ----------
// السجلّ يعدّ الزرّ المخفي أمرًا معطّلًا (menu.js usable)، وأزرار «مصدر القائمة»
// (.menu-source) مخفيةٌ أبدًا — تُنسخ بنودها إلى قائمةٍ منبثقة. فزرٌّ منها مصدرًا
// لحالة أمرٍ في الشريط يُطفئ الأمر في كل حال: كان «تصدير نسخة احتياطية…» و«استيراد
// ودمج…» في قائمة «ملف» معطّلين في كل حالة (m4/cmd-matrix)
test("m4-01: لا أمر في الشريط يأخذ حالته من زرٍّ في مصدر قائمة مخفي", () => {
  const html = ["index.html", "settings.html", "about.html"].map(src).join("\n");
  const hiddenIds = new Set();
  for (const block of html.matchAll(/<div[^>]*class="menu-source"[^>]*>([\s\S]*?)<\/div>/g)) {
    for (const m of block[1].matchAll(/id="([^"]+)"/g)) hiddenIds.add(m[1]);
  }
  assert.ok(hiddenIds.size > 0, "لم يُعثر على مصدر قائمة — تغيّر الترميز فحدّث الحارس");
  const offenders = [];
  for (const file of fs.readdirSync(path.join(__dirname, "..", "src")).filter((f) => f.endsWith(".js"))) {
    const code = src(file);
    const idOf = new Map([...code.matchAll(/const (\w+) = el\("([^"]+)"\)/g)].map((m) => [m[1], m[2]]));
    const buttons = [];
    for (const m of code.matchAll(/NasaqMenu\.register\(\s*"([^"]+)"[\s\S]*?\{\s*button:\s*(?:el\("([^"]+)"\)|(\w+))/g)) {
      buttons.push([m[1], m[2] || idOf.get(m[3])]);
    }
    // حلقة التسجيل في nasaq.js: [المعرّف، الفعل، الزرّ]
    for (const m of code.matchAll(/\[\s*"([\w.-]+)",[^\]\n]*,\s*(\w+)\s*\]/g)) buttons.push([m[1], idOf.get(m[2])]);
    for (const [command, id] of buttons) if (hiddenIds.has(id)) offenders.push(`${file}: ${command} ← #${id}`);
  }
  assert.deepStrictEqual(offenders, []);
});

// ---------- m4-02: تحت ورقةٍ أو تنبيه مفتوح لا يُعرض أمرٌ مفعّلًا ----------
// المستمع يرفض الأمر تحت الورقة (menu.js)، فعنصرٌ مفعّل في الشريط لا يفعل شيئًا
// إن اختير. في الماك تُعطَّل عناصر الشريط التي لا تعمل تحت الورقة
function bootMenu({ modal }) {
  const calls = [];
  const listeners = {};
  const window = {
    NasaqShell: { invoke: async (cmd, args) => { calls.push({ cmd, args }); } },
    NasaqWindow: { isModalOpen: () => modal.open },
    __TAURI__: { event: { listen: async (name, cb) => { listeners[name] = cb; } } },
  };
  const element = { dataset: { view: "result", module: "nasaq" } };
  const document = {
    readyState: "complete",
    documentElement: element,
    body: {},
    getElementById: () => element,
    addEventListener() {},
  };
  class MutationObserver { observe() {} }
  vm.runInNewContext(src("menu.js"), {
    window, document, MutationObserver, requestAnimationFrame: (cb) => { cb(); return 1; },
  });
  const lastState = () => {
    const sets = calls.filter((c) => c.cmd === "set_menu_state");
    return sets.length ? Object.fromEntries(sets.at(-1).args.updates.map((u) => [u.id, u.enabled])) : {};
  };
  return { menu: window.NasaqMenu, lastState, emit: (id) => listeners["menu:action"]({ payload: id }) };
}

test("m4-02: الأمر المتاح يُعرض معطّلًا ما دامت ورقة مفتوحة، ويعود بعد إغلاقها", async () => {
  const modal = { open: false };
  const { menu, lastState, emit } = bootMenu({ modal });
  let ran = 0;
  menu.register("file.new-session", () => ran++);
  menu.sync();
  assert.strictEqual(lastState()["file.new-session"], true);
  modal.open = true;
  menu.sync();
  assert.strictEqual(lastState()["file.new-session"], false, "عنصرٌ مفعّل لا يفعل شيئًا تحت الورقة");
  emit("file.new-session");
  assert.strictEqual(ran, 0);
  modal.open = false;
  menu.sync();
  assert.strictEqual(lastState()["file.new-session"], true);
  emit("file.new-session");
  assert.strictEqual(ran, 1);
});

// ---------- m4-03: حلقة التركيز لا يغطيها ظلُّ حالةٍ أعلى أولوية ----------
// base.css يرسم الحلقة ظلًّا على :focus-visible (0,1,0). قاعدةٌ لحالةٍ (مفعَّل،
// محدد، زجاجي) تضع box-shadow بمحدِّدٍ أعلى تمحو الحلقة عن العنصر المركَّز بلوحة
// المفاتيح. كل قاعدةٍ كهذه على صنف زرٍّ تحتاج نظيرًا :focus-visible يجمع الحلقة
function blocks(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out = [];
  const walk = (text) => {
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
      if (selector.startsWith("@")) walk(body);
      else out.push({ selector, body });
      i = j;
    }
  };
  walk(clean);
  return out;
}

test("m4-03: كل قاعدة ظلٍّ لحالة زرٍّ لها نظير :focus-visible يجمع الحلقة", () => {
  const html = ["index.html", "settings.html", "about.html"].map(src).join("\n");
  const buttonClasses = new Set();
  for (const m of html.matchAll(/<button[^>]*class="([^"]+)"/g)) for (const c of m[1].split(/\s+/)) buttonClasses.add(c);
  const rules = ["app.css", "forms.css", "secondary.css"].flatMap((f) => blocks(src(f)).map((b) => ({ ...b, file: f })));
  const missing = [];
  for (const rule of rules) {
    if (!/(^|;)\s*box-shadow\s*:/.test(rule.body)) continue;
    for (const sel of rule.selector.split(",").map((s) => s.trim())) {
      const m = /^\.([\w-]+)((?:\[[^\]]+\]|\.[\w-]+)+)$/.exec(sel);
      if (!m || !buttonClasses.has(m[1])) continue; // حالةٌ على صنف زرٍّ بلا شبه-صنف
      const companion = rules.some((r) =>
        r.selector.split(",").some((s) => s.trim() === `${sel}:focus-visible`) && r.body.includes("var(--focus-ring)")
      );
      if (!companion) missing.push(`${rule.file}: ${sel}`);
    }
  }
  assert.deepStrictEqual(missing, []);
});

// ---------- m4-04: ما تكتبه القائمة السياقية في الخانة يتراجع عنه ⌘Z ----------
// تعيين value مباشرةً يمحو سجلّ تراجع الحقل (كما يقول nasaq.js عند addBlankLines):
// كان «قص» و«لصق» من القائمة السياقية لا يُتراجع عنهما (m4/behaviour)
test("m4-04 وm4-08: «قص» و«لصق» والجسر إلى نَسَق تكتب في الخانة عبر محرّر الصفحة لا value", () => {
  const shell = src("shell.js");
  const start = shell.indexOf("async function pasteFromCore");
  const end = shell.indexOf("function selectionIn");
  const paste = shell.slice(start, end);
  const menuStart = shell.indexOf('document.addEventListener("contextmenu"');
  const menu = shell.slice(menuStart, shell.indexOf("window.NasaqWindow.openMenuAt(e.clientX", menuStart));
  // و«أرسل إلى نَسَق» يستبدل الشذرة كلها بلا تأكيد: ⌘Z هو طريق الرجوع إليها (m4-08)
  const bridge = shell.slice(shell.indexOf("function sendToNasaq"), shell.indexOf("function readShadhbFlag"));
  for (const [name, body] of [["لصق", paste], ["القائمة", menu], ["الجسر", bridge]]) {
    // المسموح: value احتياطًا حين يرفض المحرّر وحده
    const direct = body.split("\n").filter((l) => /\b\w+\.value\s*=(?!=)/.test(l));
    const lines = body.split("\n");
    for (const line of direct) {
      const before = lines.slice(0, lines.indexOf(line)).filter((l) => l.trim()).at(-1) || "";
      assert.ok(/if \(!editThroughPage\(.*\)\) \{$/.test(before.trim()), `${name}: كتابةٌ مباشرة في value خارج الاحتياط: ${line.trim()}`);
    }
    assert.ok(body.includes("editThroughPage("), `${name}: لا يمرّ بمحرّر الصفحة`);
  }
});

// ---------- m4-05: ما يُعرض في النتيجة هو ما يحفظه «حفظ» ----------
// كل أداةٍ تكتب فوق النتيجة تسجّل ما كتبته في ذاكرة الجلسة؛ «حذف السطور الفارغة»
// كان يغيّر المعروض ويُبقي المحفوظ على ما قبله (m4/behaviour: cleanThenSave)
test("m4-05: كل دالة في nasaq.js تكتب فوق النتيجة تسجّل ما كتبته للحفظ", () => {
  const nasaq = src("nasaq.js");
  const offenders = [];
  for (const m of nasaq.matchAll(/\n(?:async )?function (\w+)\([^)]*\) \{([\s\S]*?)\n\}/g)) {
    const [, name, body] = m;
    if (!body.includes("pushOutputUndo()") || !body.includes("setOutput(")) continue;
    if (!/recordSessionVersion\(|markAdjusted\(/.test(body)) offenders.push(name);
  }
  assert.deepStrictEqual(offenders, []);
});

// ---------- m4-08: الجسر إلى نَسَق يُظهر «الأصل» قبل أن يكتب فيه ----------
// في العمود الواحد كان العرض يبقى على «النتيجة» بعد الإرسال: حالة البداية الفارغة
// ظاهرة، والنص المرسَل في عمودٍ مخفي، والتركيز على الصفحة (m4/send-undo)
test("m4-08: «أرسل إلى نَسَق» يعرض عمود الأصل ثم يكتب فيه", () => {
  const shadhb = src("shadhb.js");
  const handler = shadhb.slice(shadhb.indexOf('sendBtn.addEventListener("click"'), shadhb.indexOf("shell.session.register(\"shadhb\""));
  const show = handler.indexOf('window.NasaqWindow.showView("source")');
  const send = handler.indexOf("shell.sendToNasaq(");
  assert.ok(show !== -1, "الإرسال لا يعرض عمود الأصل");
  assert.ok(show < send, "العمود يُعرض بعد الكتابة في خانةٍ مخفية");
});

// ---------- m4-09: الكتابة عبر المحرّر حدثُ إدخالٍ واحد ----------
// المحرّر يُدرج النص الطويل سطرًا سطرًا، بحدث input لكل سطر؛ ومستمعو الخانة
// (العدّاد، والجلسة، وآلتا الحالات) يجرون مع كلٍّ منها: لصق ٥٥ ألف حرف من القائمة
// السياقية صار ٢٫٤ ث بعد m4-04 (m4/paste-big). الدالة تكتم الوسيطة وتطلق واحدًا
test("m4-09: editThroughPage تكتم أحداث الإدخال الوسيطة وتطلق حدثًا واحدًا", () => {
  const shell = src("shell.js");
  const start = shell.indexOf("function editThroughPage");
  const fn = shell.slice(start, shell.indexOf("\n}\n", start) + 2);
  const listeners = [];
  let removed = 0;
  const window = {
    addEventListener: (type, cb, capture) => listeners.push({ type, cb, capture }),
    removeEventListener: () => removed++,
  };
  const field = { dispatched: [], dispatchEvent(e) { this.dispatched.push(e.type); } };
  const delivered = [];
  const document = {
    execCommand() {
      // المحرّر يطلق حدثًا لكل سطر: ما لم يُكتم منها يبلغ مستمعي الخانة
      for (let i = 0; i < 5; i++) {
        let stopped = false;
        const e = { target: field, stopImmediatePropagation: () => (stopped = true) };
        for (const l of listeners) if (l.type === "input" && l.capture) l.cb(e);
        if (!stopped) delivered.push(i);
      }
      return true;
    },
  };
  class Event { constructor(type) { this.type = type; } }
  const ctx = { window, document, Event, field, result: null };
  vm.runInNewContext(fn + "\nresult = editThroughPage(field, 'insertText', 'x');", ctx);
  assert.strictEqual(ctx.result, true);
  assert.deepStrictEqual(delivered, [], "أحداث المحرّر الوسيطة بلغت مستمعي الخانة");
  assert.deepStrictEqual(field.dispatched, ["input"], "لا حدث إدخال واحد بعد الكتابة");
  assert.strictEqual(removed, 1, "الكاتم باقٍ بعد الكتابة");
});

test("m4-09: كل كتابةٍ عبر المحرّر في الواجهة تمرّ بـ editThroughPage", () => {
  const offenders = [];
  for (const file of fs.readdirSync(path.join(__dirname, "..", "src")).filter((f) => f.endsWith(".js"))) {
    for (const m of src(file).matchAll(/document\.execCommand\("(insertText|delete)"/g)) offenders.push(`${file}: ${m[0]}`);
  }
  // الموضع الوحيد المسموح داخل الدالة نفسها، وهي تمرّر اسم الأمر متغيّرًا
  assert.deepStrictEqual(offenders, []);
});

// ---------- قرارات المالك بعد m4 ----------

// m4-11: كل قرارٍ في شَذْب يُسبق بلقطة، و⌘Z/⇧⌘Z خارج الحقول يتراجعان ويعيدان، والسجلّ
// عمر الفحص (Figma 355:23219). المشهد في المتصفح: m4/decisions
test("m4-11: قرارا «احذف» و«أبقِ» يُسجَّلان، و⌘Z ⇧⌘Z يتراجعان ويعيدان خارج الحقول", () => {
  const shadhb = src("shadhb.js");
  const body = (name) => {
    const at = shadhb.indexOf(`function ${name}(`);
    return shadhb.slice(at, shadhb.indexOf("\n    }\n", at));
  };
  for (const name of ["applyCutAt", "keepCutAt"]) {
    const b = body(name);
    const record = b.indexOf("recordDecision()");
    assert.ok(record !== -1, `${name} لا يسجّل قراره`);
    assert.ok(record < b.indexOf("cut.status ="), `${name} يسجّل بعد أن يغيّر`);
  }
  const key = shadhb.slice(shadhb.indexOf('e.code !== "KeyZ"') - 200, shadhb.indexOf('e.code !== "KeyZ"') + 700);
  assert.ok(/input, textarea, \[contenteditable='true'\]/.test(key), "⌘Z في حقلٍ يُؤخذ من تحريره");
  assert.ok(/isModalOpen\(\)/.test(key), "⌘Z يعمل تحت ورقة");
  assert.ok(/e\.shiftKey\) redoDecision\(\)/.test(key) && /else undoDecision\(\)/.test(key), "لا تراجع أو لا إعادة");
  // السجلّ يُنسى حيث يُستبدل الفحص كله
  assert.ok(/forgetDecisions\(\);\n\s+state = \{/.test(shadhb), "فحصٌ جديد يرث سجلّ القديم");
  assert.ok(/confirmNewSession\(\(\) => \{\n\s+forgetDecisions\(\);/.test(shadhb), "جلسة جديدة ترث السجلّ");
  assert.ok(/forgetDecisions\(\);\n\s+state = saved\.state;/.test(shadhb), "الجلسة المستعادة ترث سجلًّا");
});

// m4-12: الإفلات للصفحة لا لـ Tauri، وملفٌّ مُفلتٌ في أي موضع لا يُفتح، والإدراج عبر المحرّر
test("m4-12: الإفلات مسموحٌ للصفحة، والملف لا يُفتح، والإدراج يُتراجع عنه", () => {
  const rs = fs.readFileSync(path.join(__dirname, "..", "src-tauri", "src", "app", "window.rs"), "utf8");
  const builder = rs.slice(rs.indexOf('WebviewWindowBuilder::new(app, "main"'), rs.indexOf(".build()?", rs.indexOf('"main"')));
  assert.ok(builder.includes(".disable_drag_drop_handler()"), "Tauri يلتقط الإفلات قبل الصفحة");
  const shell = src("shell.js");
  for (const type of ["dragover", "drop"]) {
    const at = shell.indexOf(`document.addEventListener("${type}"`);
    const handler = shell.slice(at, shell.indexOf("\n});", at));
    assert.ok(at !== -1 && /if \(!carriesFiles\(e\)\) return;\s+e\.preventDefault\(\);/.test(handler), `${type}: ملفٌّ مُفلت قد يفتحه WebKit`);
  }
  const insert = shell.slice(shell.indexOf("async function insertDroppedFile"), shell.indexOf('document.addEventListener("dragenter"'));
  assert.ok(insert.includes('editThroughPage(field, "insertText", text)'), "الإدراج لا يُتراجع عنه");
  assert.ok(insert.indexOf('showView("source")') < insert.indexOf("field.focus()"), "الكتابة في خانةٍ مخفية");
});

test("m4-12: فكّ ترميز الملف المُفلت — UTF-8 ثم UTF-16 بعلامته ثم ويندوز-١٢٥٦", () => {
  const shell = src("shell.js");
  const start = shell.indexOf("function decodeDropped");
  const fn = shell.slice(start, shell.indexOf("\n}\n", start) + 2);
  const ctx = { TextDecoder, out: {} };
  vm.runInNewContext(fn + `
    out.utf8 = decodeDropped(new TextEncoder().encode("سلامٌ عليكم").buffer);
    out.cp1256 = decodeDropped(new Uint8Array([0xd3, 0xe1, 0xc7, 0xe3]).buffer);
    out.utf16 = decodeDropped(new Uint8Array([0xff, 0xfe, 0x33, 0x06, 0x44, 0x06]).buffer);
    out.bom = decodeDropped(new Uint8Array([0xef, 0xbb, 0xbf, 0xd8, 0xa3]).buffer);`, { ...ctx, TextEncoder });
  assert.deepStrictEqual(ctx.out, { utf8: "سلامٌ عليكم", cp1256: "سلام", utf16: "سل", bom: "أ" });
});

// m4-13: حالة الضغط لكل عنصرٍ رسمها Figma (Segmented Control وSettings Tab وInspector Section
// وForm Picker ممّا أُضيف، وPopup Button وButton · Secondary ممّا كان مرسومًا)
test("m4-13: لكل عنصرٍ حالة ضغطٍ بـ fill-pressed", () => {
  const css = ["app.css", "forms.css", "secondary.css"].map(src).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
  const missing = [];
  for (const cls of ["view-segment", "module-segment", "section-header", "dd-btn", "tab", "row-picker", "row-button"]) {
    const ok = rules.some((r) => r.sel.split(",").some((s) => new RegExp(`\\.${cls}\\b[^,]*:active`).test(s)) && r.body.includes("var(--fill-pressed)"));
    if (!ok) missing.push(cls);
  }
  assert.deepStrictEqual(missing, []);
});
