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
  // في هيكل NsqV272 (m6) لا «مصدر قائمة» مخفيًّا، والخطر نفسه في لوحة المسودات: مغلقةٌ
  // حتى تُطلب (display: none)، فزرٌّ فيها مصدرًا لحالة أمرٍ يُطفئه ما دامت مغلقة — وفيها
  // زرّا النسخ الاحتياطي اللذان أصلحهما m4-01
  const hiddenIds = new Set();
  for (const block of html.matchAll(/<aside[^>]*id="sidebar"[^>]*>([\s\S]*?)<\/aside>/g)) {
    for (const m of block[1].matchAll(/id="([^"]+)"/g)) hiddenIds.add(m[1]);
  }
  assert.ok(hiddenIds.has("export-drafts-btn") && hiddenIds.has("import-drafts-btn"), "لم يُعثر على زرَّي النسخ الاحتياطي في لوحة المسودات — تغيّر الترميز فحدّث الحارس");
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

// ---------- m6-07: أمرٌ طُوي زرّه في قائمةٍ ظاهرة يبقى متاحًا في الشريط ----------
// إطارات ٧٦٠ من NsqV272 لا تعرض «التقرير» و«بحث» و«عدسة القراءة» و«تصدير» و«أعد التنسيق»
// بعد النتيجة؛ فصار لها مدخلٌ واحد «المزيد ⋯» (قرار المالك بتفويضه، Figma 2553:9458). والسجلّ
// كان يعدّ الزرّ غير الظاهر أمرًا معطّلًا، فتُطفأ الأوامر الخمسة في الشريط عند ٧٦٠
function bootMenuWithDom(nodes) {
  const calls = [];
  const window = {
    NasaqShell: { invoke: async (cmd, args) => { calls.push({ cmd, args }); } },
    NasaqWindow: { isModalOpen: () => false },
    __TAURI__: { event: { listen: async () => {} } },
  };
  const element = { dataset: { view: "result", module: "nasaq" } };
  const document = {
    readyState: "complete",
    documentElement: element,
    body: {},
    getElementById: () => element,
    addEventListener() {},
    querySelector: (selector) => nodes[selector] || null,
  };
  class MutationObserver { observe() {} }
  vm.runInNewContext(src("menu.js"), { window, document, MutationObserver, requestAnimationFrame: (cb) => { cb(); return 1; } });
  const lastState = () => Object.fromEntries(calls.filter((c) => c.cmd === "set_menu_state").at(-1).args.updates.map((u) => [u.id, u.enabled]));
  return { menu: window.NasaqMenu, lastState };
}

test("m6-07: زرٌّ مطويّ في «المزيد ⋯» الظاهر أمرُه متاح، ومع غيابه معطّل", () => {
  const shown = { offsetParent: {} };
  const folded = { id: "reading-lens-btn", disabled: false, hidden: false, offsetParent: null, closest: () => null };
  const open = bootMenuWithDom({ '[data-menu-items~="reading-lens-btn"]': shown });
  open.menu.register("format.reading-lens", () => {}, { button: folded });
  open.menu.sync();
  assert.strictEqual(open.lastState()["format.reading-lens"], true, "الأمر مُطفأ وزرّه مبلوغ من «المزيد ⋯»");

  // «المزيد ⋯» نفسه غير ظاهر (النافذة واسعة والزرّ مخفيّ بحالته): الأمر معطّل كما كان
  const closed = bootMenuWithDom({ '[data-menu-items~="reading-lens-btn"]': { offsetParent: null } });
  closed.menu.register("format.reading-lens", () => {}, { button: folded });
  closed.menu.sync();
  assert.strictEqual(closed.lastState()["format.reading-lens"], false);

  // والمعطَّل يبقى معطّلًا ولو كان مبلوغًا
  const disabled = bootMenuWithDom({ '[data-menu-items~="reading-lens-btn"]': shown });
  disabled.menu.register("format.reading-lens", () => {}, { button: { ...folded, disabled: true } });
  disabled.menu.sync();
  assert.strictEqual(disabled.lastState()["format.reading-lens"], false);
});

test("m6-07: كل معرّفٍ تسمّيه قائمة «المزيد ⋯» زرٌّ موجود، وله تسمية تصلح بندًا", () => {
  const html = src("index.html");
  const lists = [...html.matchAll(/data-menu-items="([^"]+)"/g)].map((m) => m[1].split(/\s+/));
  assert.ok(lists.length > 0, "لا قائمة «المزيد» في الهيكل");
  for (const id of lists.flat()) {
    const tag = new RegExp(`<button[^>]*\\bid="${id}"[^>]*>`).exec(html);
    assert.ok(tag, `«المزيد ⋯» يسمّي زرًّا غائبًا: ${id}`);
    // البند يأخذ data-menu-label ثم aria-label ثم نصّ الزر؛ والزرّ متعدد النصوص (حالات «نسّق») يحتاج تسمية صريحة
    const body = html.slice(tag.index + tag[0].length, html.indexOf("</button>", tag.index));
    const spans = (body.match(/<span/g) || []).length;
    assert.ok(/data-menu-label="|aria-label="/.test(tag[0]) || spans <= 1, `${id} بلا تسمية تصلح بندًا في القائمة`);
  }
  // الهيكل يبني القائمة من المعرّفات، ويُعطي الأبراج المرساة الظاهرة بلا أن تعرف أين طُوي زرّها
  const layout = src("layout.js");
  assert.ok(/closest\("\[data-menu-items\]"\)/.test(layout), "الهيكل لا يفتح قائمة data-menu-items");
  assert.ok(/window\.NasaqWindow = \{[^}]*\banchorFor\b/.test(layout), "الهيكل لا ينشر anchorFor");
  assert.ok(src("nasaq.js").includes("window.NasaqWindow.anchorFor(readingLensBtn)"), "عدسة القراءة لا تسأل الهيكل عن مرساتها الظاهرة");
});

// ---------- m6-09: زرّ الواجهة الذي يسمّي أمرًا ينفّذه بمساره وحالته ----------
// لوحة المسودات في NsqV272 (2009:968) فيها «مسودة جديدة» و«حفظ المسودة الحالية»، وهما أمران من أوامر
// الشريط. الزر يسمّي أمره بـ data-menu-command: الشرط نفسه (الورقة المفتوحة، وحالة زرّ المصدر)، فلا
// يُكتب الفعل مرتين ولا يتفعّل الزر والأمر معطّل
test("m6-09: زرّ data-menu-command يتبع حالة أمره وينفّذه، ولا ينفّذ أمرًا معطّلًا", () => {
  const source = { disabled: true, hidden: false, offsetParent: {} };
  const proxy = { dataset: { menuCommand: "file.save-draft" }, disabled: false };
  let click = null;
  const calls = [];
  const window = {
    NasaqShell: { invoke: async (cmd, args) => { calls.push({ cmd, args }); } },
    NasaqWindow: { isModalOpen: () => false },
    __TAURI__: { event: { listen: async () => {} } },
  };
  const element = { dataset: { view: "result", module: "nasaq" } };
  const document = {
    readyState: "complete", documentElement: element, body: {},
    getElementById: () => element,
    addEventListener: (type, fn) => { if (type === "click") click = fn; },
    querySelector: () => null,
    querySelectorAll: (sel) => (sel === "[data-menu-command]" ? [proxy] : []),
  };
  class MutationObserver { observe() {} }
  vm.runInNewContext(src("menu.js"), { window, document, MutationObserver, requestAnimationFrame: (cb) => { cb(); return 1; } });
  let ran = 0;
  window.NasaqMenu.register("file.save-draft", () => ran++, { button: source });
  window.NasaqMenu.sync();
  assert.strictEqual(proxy.disabled, true, "زرّ الواجهة مفعّل وأمره معطّل");
  click({ target: { closest: () => proxy } });
  assert.strictEqual(ran, 0, "أمرٌ معطّل نُفّذ من زرّ الواجهة");
  source.disabled = false;
  window.NasaqMenu.sync();
  assert.strictEqual(proxy.disabled, false);
  click({ target: { closest: () => proxy } });
  assert.strictEqual(ran, 1);
  // وفي الهيكل: الزرّان يسمّيان أمرين مسجّلين
  const html = src("index.html");
  const named = [...html.matchAll(/data-menu-command="([^"]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(named.sort(), ["file.new-session", "file.save-draft"]);
  const registered = ["nasaq.js", "shell.js", "shadhb.js", "layout.js"].map(src).join("\n");
  for (const id of named) assert.ok(registered.includes(`"${id}"`), `أمرٌ غير مسجّل: ${id}`);
});

test("m6-08: النافذة المنبثقة تنقلب فوق مرساتها حين لا يتّسع ما تحتها", () => {
  // مرساة عدسة القراءة في الضيّق «المزيد ⋯» أسفل النافذة؛ وكان الموضع «تحت المرساة» دائمًا
  // فتُرسم العدسة خارج النافذة (m6/surfaces n22 عند ٧٦٠)
  const layout = src("layout.js");
  const fn = layout.slice(layout.indexOf("function positionPopover()"), layout.indexOf("function presentPopover("));
  assert.match(fn, /const flip = h > below && above > below;/, "لا مقارنة بين ما فوق المرساة وما تحتها");
  assert.match(fn, /el\.dataset\.placement = flip \? "above" : "below";/, "الموضع لا يُعلَن للسهم");
  assert.match(fn, /maxBlockSize = \(flip \? above : below\)/, "الارتفاع الأقصى لا يتبع الجهة");
  const css = src("app.css").replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(css, /\.popover\[data-placement="above"\]::before \{[^}]*inset-block-end:/, "السهم لا ينقلب مع النافذة");
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

// فحص m7-12 (Figma 2612:5104/5108/5112 و2612:5116): إعادة ما تُرُوجع عنه في أدوات النتيجة.
// تُشغَّل دوال nasaq.js نفسها في vm: تطبيق أداة ← ⌘Z ← ⇧⌘Z، ودورات، وكتابةٌ جديدة تمحو
// الإعادة، وقرار المنعطف يعود مع نصّه
test("m7-12: ⌘Z ثم ⇧⌘Z يعيدان النتيجة وحالتها عبر دورات متعددة، وكتابةٌ جديدة تمحو الإعادة", () => {
  const nasaq = src("nasaq.js");
  const block = nasaq.slice(nasaq.indexOf("const UNDO_MAX"), nasaq.indexOf("const undoBtn"));
  assert.ok(block.includes("function redoOutput()"), "لا دالة إعادة");
  const script = `
    let outputUndoStack = [], outputRedoStack = [], turnDecision = null, toasts = [], recorded = [];
    let lastFormatMeta = { original: "أصل", linesAdjusted: false };
    const outputText = { textContent: "R0" }, inputText = { value: "أصل" };
    const rhythmFingerprint = { hidden: false, textContent: "بصمة R0" };
    const window = { NasaqDrafts: { draftKey: (t) => t } };
    const setOutput = (t) => { outputText.textContent = t; };
    const showRhythmFingerprint = (r) => { rhythmFingerprint.hidden = r == null; rhythmFingerprint.textContent = r || ""; };
    const recordSessionVersion = (o, m, t) => recorded.push(t);
    const syncResultTools = () => {};
    const renderState = () => {};
    const showToast = (t) => toasts.push(t);
    ${block}
    const tool = (t) => { pushOutputUndo(); setOutput(t); showRhythmFingerprint(null); lastFormatMeta = { ...lastFormatMeta, linesAdjusted: true }; };
    const state = () => ({ text: outputText.textContent, undo: outputUndoStack.length, redo: outputRedoStack.length,
      lines: lastFormatMeta.linesAdjusted, rhythm: rhythmFingerprint.hidden ? null : rhythmFingerprint.textContent,
      decision: turnDecision && turnDecision.which, saved: recorded[recorded.length - 1] });
    globalThis.api = { tool, undoOutput, redoOutput, state, toasts, set input(v) { inputText.value = v; }, set decision(v) { turnDecision = v ? { which: v, text: outputText.textContent, snapshot: outputUndoStack[outputUndoStack.length - 1] } : null; } };
  `;
  const ctx = {};
  vm.runInNewContext(script, ctx);
  const { api } = ctx;
  api.tool("R1"); api.tool("R2"); api.tool("R3");
  const at = (text, undo, redo) => {
    const s = api.state();
    assert.strictEqual(s.text, text); assert.strictEqual(s.undo, undo); assert.strictEqual(s.redo, redo);
  };
  at("R3", 3, 0);
  api.undoOutput(); at("R2", 2, 1); assert.strictEqual(api.state().saved, "R2", "المستعادة لا تُسجَّل للحفظ");
  api.redoOutput(); at("R3", 3, 0); assert.strictEqual(api.state().saved, "R3", "المُعادة لا تُسجَّل للحفظ");
  // تراجعٌ كامل: R0 ببصمته ومحاوره الأولى
  api.undoOutput(); api.undoOutput(); api.undoOutput(); at("R0", 0, 3);
  assert.deepStrictEqual([api.state().rhythm, api.state().lines], ["بصمة R0", false], "حالة R0 لم تعد كما كانت");
  // إعادة كاملة، ثم لا شيء لإعادته
  api.redoOutput(); at("R1", 1, 2); api.redoOutput(); at("R2", 2, 1); api.redoOutput(); at("R3", 3, 0);
  assert.strictEqual(api.state().lines, true);
  api.redoOutput(); at("R3", 3, 0);
  assert.strictEqual(api.toasts[api.toasts.length - 1], "لا تعديل لإعادته.");
  // دورات متقطعة
  for (const [step, expect] of [["u", "R2"], ["u", "R1"], ["r", "R2"], ["u", "R1"], ["r", "R2"], ["r", "R3"]]) {
    step === "u" ? api.undoOutput() : api.redoOutput();
    assert.strictEqual(api.state().text, expect, `الدورة انحرفت عند ${step}`);
  }
  // كتابةٌ جديدة بعد التراجع تمحو ما يُعاد
  api.undoOutput(); at("R2", 2, 1);
  api.tool("R2b"); at("R2b", 3, 0);
  api.redoOutput(); at("R2b", 3, 0);
  // قرار المنعطف يعود مع نصّه بالإعادة، ويشير إلى الصورة التي تسبقه
  api.tool("T"); api.decision = "broken";
  api.undoOutput(); assert.strictEqual(api.state().decision, null);
  api.redoOutput(); assert.strictEqual(api.state().decision, "broken", "الإعادة أسقطت قرار المنعطف");
  api.tool("T2"); api.undoOutput();
  assert.strictEqual(api.state().decision, "broken", "التراجع إلى نصٍّ معتمد أسقط قراره");
  // ملاحظة حارس نَسَق: كلماتٌ جديدة في الخانة (ولو بلا جلسة جمع) — لا تُستعاد فوقها نتيجة النص السابق
  api.tool("T3"); api.undoOutput(); // في التراجع وفي الإعادة صورٌ لنص «أصل»
  const shown = api.state().text;
  api.input = "نصٌّ آخر تمامًا";
  api.undoOutput();
  assert.strictEqual(api.state().text, shown, "⌘Z أعاد نتيجة نصٍّ سابق فوق كلماتٍ أخرى");
  assert.strictEqual(api.toasts[api.toasts.length - 1], "لا تعديل للتراجع عنه.");
  api.redoOutput();
  assert.strictEqual(api.state().text, shown, "⇧⌘Z أعاد نتيجة نصٍّ سابق فوق كلماتٍ أخرى");
  assert.deepStrictEqual([api.state().undo, api.state().redo], [0, 0], "صور النص السابق بقيت في المكدسين");
});

test("m7-12: ⇧⌘Z مستمعٌ خارج الحقول وتحت نَسَق وحده، والمكدسان يُمحيان معًا", () => {
  const nasaq = src("nasaq.js");
  const start = nasaq.lastIndexOf("\n", nasaq.indexOf('e.code !== "KeyZ"')); // من أول السطر: شرط المفاتيح كله
  const handler = nasaq.slice(start, nasaq.indexOf("\n});", start));
  assert.ok(handler.indexOf("editable(e.target)") < handler.indexOf("e.shiftKey"), "⇧⌘Z يسرق إعادة الكتابة في الحقول");
  assert.ok(handler.indexOf("isModalOpen()") < handler.indexOf("e.shiftKey"), "⇧⌘Z يعمل تحت ورقة");
  assert.ok(handler.indexOf("formatBtn.offsetParent === null") < handler.indexOf("e.shiftKey"), "⇧⌘Z يعمل خارج نَسَق");
  assert.ok(/if \(e\.shiftKey\) \{[\s\S]*?modelCallActive[\s\S]*?redoOutput\(\);/.test(handler), "⇧⌘Z لا يعيد أو يزاحم نداءً جاريًا");
  assert.ok(!/!e\.metaKey \|\| e\.shiftKey/.test(handler), "المستمع يُسقط ⇧⌘Z قبل أن يصل");
  // كل موضعٍ يمحو التراجع يمحو الإعادة معه
  const clears = [...nasaq.matchAll(/(?<!let )outputUndoStack = \[\];/g)].length; // الإعلان ليس محوًا
  assert.ok(clears >= 2);
  assert.strictEqual([...nasaq.matchAll(/outputUndoStack = \[\];\n\s+outputRedoStack = \[\];/g)].length, clears, "موضعٌ يمحو التراجع ويُبقي الإعادة");
  // وتغيّر كلمات الخانة يُسقط صور نصٍّ آخر ولو بلا جلسة جمع (ملاحظة حارس نَسَق)
  const inputAt = nasaq.indexOf('inputText.addEventListener("input"');
  const onInput = nasaq.slice(inputAt, nasaq.indexOf("\n});", inputAt));
  assert.ok(/dropForeignOutputHistory\(\);/.test(onInput), "تغيّر الكلمات يُبقي صور النص السابق");
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

// m4-13: حالة الضغط لكل عنصرٍ تفاعلي بـ fill/pressed كما في NsqV272 (Module Switch وPopup Button
// وEditor Tool وSidebar Toggle وIcon Button وButton · Secondary وCut Decision)، ومعها ما أضافه
// m4 لما لم يُرسم له ضغط (Settings Tab ورأس القسم ومنتقي النموذج). مبدّل العرض مستثنى:
// مضماره نفسه fill/pressed في الملف (View Switch 26:94)، فلا حالة ضغط تتميّز فوقه
test("m4-13: لكل عنصرٍ حالة ضغطٍ بـ fill-pressed", () => {
  const css = ["app.css", "forms.css", "secondary.css"].map(src).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
  const missing = [];
  for (const cls of ["module-segment", "section-header", "dd-btn", "editor-tool", "title-toggle", "decision-button", "tab", "row-picker", "row-button"]) {
    const ok = rules.some((r) => r.sel.split(",").some((s) => new RegExp(`\\.${cls}\\b[^,]*:active`).test(s)) && r.body.includes("var(--fill-pressed)"));
    if (!ok) missing.push(cls);
  }
  assert.deepStrictEqual(missing, []);
});
