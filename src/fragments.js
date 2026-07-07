// بطاقة الشذرة — دوال نقية بلا DOM وبلا شبكة، تُختبر في Node مباشرة
// (tests/fragments.test.js). تحوّلات تخطيطية بحتة: لا تضيف محرفًا غير كسر
// السطر ولا تحذف كلمة — الكسر تخطيط مسموح، والعلامة المستحدثة محتوى ممنوع.
//
// المنعطف (الالتفاتة) كما عرّفته قواعد الشذرة: بل، لكن/ولكن، غير أن،
// نقطتان، شرطة موجودة أصلًا. الكسر قبل كلمة الالتفاتة وقبل الشرطة،
// وبعد النقطتين — كسر واحد لأول منعطف في السطر، لا أكثر.

// كلمات الالتفاتة التي يسبقها الكسر — الأطول أولًا حتى لا تبتلع «لكن» «ولكن»
const TURN_WORDS = ["غير أنّ", "غير أن", "ولكنّ", "ولكن", "لكنّ", "لكن", "بل"];
const TURN_DASHES = ["—", "–"];

// موضع أول منعطف داخل سطر واحد: يعيد { index, breakBefore } أو null.
// المنعطف في أول السطر ليس منعطفًا داخليًا — الكسر حاصل أصلًا.
function findTurn(line) {
  let best = null;
  const consider = (index, breakBefore) => {
    if (index > 0 && (best === null || index < best.index)) {
      best = { index, breakBefore };
    }
  };

  for (const w of TURN_WORDS) {
    // كلمة مستقلة: قبلها مسافة وبعدها مسافة أو علامة — لا وسط كلمة أخرى
    const re = new RegExp(`(?<=\\s)${w}(?=[\\s،؛])`, "u");
    const m = re.exec(line);
    if (m) consider(m.index, true);
  }

  for (const d of TURN_DASHES) {
    const i = line.indexOf(d);
    if (i > 0 && line[i - 1] === " ") consider(i, true);
  }

  // النقطتان: الكسر بعدهما — بشرط وجود تكملة في السطر نفسه
  const colon = line.indexOf(":");
  if (colon > 0 && colon < line.length - 1 && line.slice(colon + 1).trim()) {
    consider(colon + 1, false);
  }

  return best;
}

// الصورة المكسورة: كسر سطر عند أول منعطف في كل سطر — لا محرف يُضاف سواه
function breakAtTurn(text) {
  return String(text)
    .split("\n")
    .map((line) => {
      const turn = findTurn(line);
      if (!turn) return line;
      const head = line.slice(0, turn.index).replace(/ +$/, "");
      const tail = line.slice(turn.index).replace(/^ +/, "");
      if (!head || !tail) return line;
      return head + "\n" + tail;
    })
    .join("\n");
}

// الصورة الموصولة: يُدمج السطر المفتتح بمنعطف في سابقه (والسطر التالي
// لنقطتين ختمتا سابقه) بمسافة واحدة. لا دمج عبر سطر فارغ أو فاصل (·) —
// فذاك فاصل شذرات لا كسر منعطف.
function joinAtTurn(text) {
  const lines = String(text).split("\n");
  const out = [];
  for (const raw of lines) {
    const line = raw;
    const prev = out.length ? out[out.length - 1] : null;
    const joinable =
      prev !== null && prev.trim() !== "" && prev.trim() !== "·" && line.trim() !== "" && line.trim() !== "·";
    const startsWithTurn =
      TURN_WORDS.some((w) => new RegExp(`^${w}(?=[\\s،؛])`, "u").test(line.trim())) ||
      TURN_DASHES.some((d) => line.trim().startsWith(d));
    const prevEndsWithColon = prev !== null && /:$/.test(prev.trim());
    if (joinable && (startsWithTurn || prevEndsWithColon)) {
      out[out.length - 1] = prev.replace(/ +$/, "") + " " + line.trim();
    } else {
      out.push(line);
    }
  }
  return out.join("\n");
}

// هل في النص منعطف تختلف به الصورتان؟ — شرط ظهور البطاقة
function turnForms(text) {
  const joined = joinAtTurn(text);
  const broken = breakAtTurn(joined);
  return broken === joined ? null : { broken, joined };
}

const NasaqFragments = { findTurn, breakAtTurn, joinAtTurn, turnForms };

if (typeof module !== "undefined" && module.exports) module.exports = NasaqFragments;
if (typeof window !== "undefined") window.NasaqFragments = NasaqFragments;
