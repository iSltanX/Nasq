// فحص m3 — مسار التحديث كما يجري: updates.js نفسه في vm، ببيئةٍ دنيا تحاكي
// ما يلمسه من الصفحة والجسر. تُختبر قراراته لا شكله.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const SOURCE = fs.readFileSync(path.join(__dirname, "../src/updates.js"), "utf8");
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));

function element() {
  const listeners = {};
  return {
    hidden: true, textContent: "", style: {}, onclick: null,
    setAttribute() {}, querySelector: () => element(),
    addEventListener: (type, fn) => { listeners[type] = fn; },
    click() { listeners.click?.(); },
  };
}

// الجسر: كل أمرٍ يُسجَّل، وتأخير كل خطوة يضبطه الاختبار
function boot({ delays = {}, autoUpdates = false } = {}) {
  const calls = [];
  const elements = {};
  const commands = {};
  const wait = (name) => tick(delays[name] || 0);
  const handlers = {
    "plugin:updater|check": async () => { calls.push("check"); await wait("check"); return { rid: 7, version: "27.1.0" }; },
    "plugin:updater|download": async () => { calls.push("download"); await wait("download"); return 9; },
    "plugin:updater|install": async () => { calls.push("install"); await wait("install"); },
    "plugin:process|restart": async () => { calls.push("restart"); },
    save_settings: async () => ({}),
  };
  const window = {
    NasaqShell: {
      invoke: (cmd, args) => handlers[cmd](args),
      registerEscapeCloser() {},
      formatNumber: String,
      settingsReady: Promise.resolve({ autoUpdates }),
    },
    NasaqWindow: { presentModal: (el) => { el.hidden = false; }, dismissModal: (el) => { el.hidden = true; } },
    NasaqMenu: { register: (id, run) => { commands[id] = run; } },
    NasaqVersion: { display: (v) => v },
    __TAURI__: { core: { Channel: class {} }, app: { getVersion: async () => "27.0.0" } },
  };
  const document = { getElementById: (id) => (elements[id] ||= element()) };
  vm.runInNewContext(SOURCE, { window, document, console: { warn() {} } });
  const alert = () => ({
    open: !elements["update-alert"].hidden,
    title: elements["update-alert-title"].textContent,
    confirm: () => elements["update-alert-confirm"].onclick(),
    cancel: () => elements["update-alert-cancel"].click(),
  });
  return { calls, alert, check: () => commands["app.check-updates"]() };
}

test("فحص m3: «إلغاء» بعد التنزيل وأثناء التثبيت لا يعيد تشغيل التطبيق", async () => {
  const app = boot({ delays: { install: 40 } });
  app.check();
  await tick(5);
  app.alert().confirm();
  await tick(15); // التنزيل انتهى، والتثبيت جارٍ
  assert.deepStrictEqual(app.calls, ["check", "download", "install"]);
  app.alert().cancel();
  await tick(60);
  assert.ok(!app.calls.includes("restart"), `أُعيد التشغيل بعد «إلغاء»: ${app.calls}`);
  assert.strictEqual(app.alert().open, false);
});

test("فحص m3: بلا «إلغاء» يُعاد التشغيل بعد التثبيت كما رُسم", async () => {
  const app = boot();
  app.check();
  await tick(5);
  app.alert().confirm();
  await tick(15);
  assert.deepStrictEqual(app.calls, ["check", "download", "install", "restart"]);
});

test("فحص m3: «ابحث عن تحديثات» أثناء تنزيلٍ مُلغى يجري حين ينتهي، لا يُبتلع", async () => {
  const app = boot({ delays: { download: 40 } });
  app.check();
  await tick(5);
  app.alert().confirm();
  await tick(5);
  app.alert().cancel();
  app.check();
  await tick(10);
  assert.strictEqual(app.alert().open, false, "التنزيل لم ينتهِ بعد");
  await tick(60);
  assert.deepStrictEqual(app.calls, ["check", "download", "check"]);
  assert.strictEqual(app.alert().open, true, "لا جواب للطلب اليدوي");
  assert.match(app.alert().title, /27\.1\.0/);
});

test("فحص m3: «ابحث عن تحديثات» أثناء فحصٍ تلقائي يُجاب حين ينتهي", async () => {
  const app = boot({ delays: { check: 30 }, autoUpdates: true });
  await tick(5); // الفحص التلقائي بدأ
  app.check();
  await tick(90);
  assert.deepStrictEqual(app.calls, ["check", "check"]);
  assert.strictEqual(app.alert().open, true);
});

test("فحص m3: طلبٌ يدوي أثناء تنزيلٍ ظاهر لا يبدأ فحصًا فوقه", async () => {
  const app = boot({ delays: { download: 30, install: 10 } });
  app.check();
  await tick(5);
  app.alert().confirm();
  await tick(5);
  app.check();
  await tick(80);
  assert.deepStrictEqual(app.calls, ["check", "download", "install", "restart"]);
});
