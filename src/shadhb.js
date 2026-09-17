// برج «شَذْب» — مقصّ الشذرات (Figma nasq-v10، صفحة 51:9): يقترح الحذف ولا يكتب.
// فحصٌ واحد يعيد بطاقة قراءة وقصّات مقترحة، والكاتب يقرر كل قصّة، والتطبيق محلي
// حتمي عبر المقص النقي، والضمانة تفحص آليًا أن لا كلمة أُضيفت.
//
// حدود العزل: يستهلك window.NasaqShell وwindow.NasaqPrune وwindow.NasaqWindow
// حصرًا — لا يلمس دوال نَسَق ولا حالته، ولا يكتب في خانة النص إلا عبر جسر
// sendToNasaq الوحيد. كل الجسد داخل درع: فشله الكامل — تحميلًا أو تنفيذًا — لا
// يمسّ نَسَق بشيء، ومفتاح الإطفاء (localStorage["nasaq-shadhb"] = "off") يخفي
// شَذْب كليًا فيعمل التطبيق على نَسَق وحده.
(() => {
  try {
    const shell = window.NasaqShell;
    if (!shell || !shell.flags || shell.flags.shadhbEnabled !== true) return;
    const prune = window.NasaqPrune;
    if (!prune) return;

    const el = shell.el;
    const AR = shell.formatNumber; // المنسّق المشترك — أرقام هندية في كل ما يُعرض
    const count = shell.countLabel; // والجمع العربي منه أيضًا، لا مكرَّرًا هنا
    const root = document.documentElement;

    const modeSwitch = el("mode-switch");
    const nasaqBtn = el("mode-nasaq-btn");
    const shadhbBtn = el("mode-shadhb-btn");
    const inputText = el("input-text"); // خانة الخام مشتركة — قراءة فقط هنا

    const pruneBtn = el("prune-btn");
    const copyBtn = el("copy-pruned-btn");
    const sendBtn = el("send-to-nasaq-btn");

    const cutsCount = el("cuts-count");
    const cutsNote = el("cuts-note");
    const cutsList = el("cuts-list");

    const shardMarks = el("shard-marks");
    const noCutsSource = el("no-cuts-source");
    const noCutsResult = el("no-cuts-result");
    const progress = el("shadhb-progress");
    const preview = el("prune-preview");
    const placeholder = el("shadhb-placeholder");

    const readingSection = el("reading-card-section");
    const readingNote = el("reading-card-note");
    const readingSkeleton = el("reading-card-skeleton");
    const readingCard = el("reading-card");

    const cutSection = el("cut-card-section");
    const cutTitle = el("cut-card-title");
    const cutTag = el("cut-card-tag");
    const cutQuote = el("cut-card-quote");
    const cutMeta = el("cut-card-meta");
    const cutEffect = el("cut-card-effect");
    const cutActions = el("cut-card-actions");
    const applyBtn = el("apply-cut-btn");
    const keepBtn = el("keep-cut-btn");

    const covenantSection = el("covenant-section");
    const covenantIcon = el("covenant-section-icon");
    const covenantNote = el("covenant-note");
    const covenantBar = el("covenant-bar");

    const outcomeSection = el("outcome-section");
    const outcomeCut = el("outcome-cut");
    const outcomeKept = el("outcome-kept");
    const outcomeWords = el("outcome-words");
    const outcomeCovenant = el("outcome-covenant");

    const statusBadge = el("shadhb-status");
    const statusLabel = el("shadhb-status-label");
    const countBox = el("shadhb-count");

    // ---------- التبديل بين الوحدتين ----------
    // data-module على الجذر يقود CSS وحده: مناطق شَذْب محل مناطق نَسَق بألوانها —
    // حالة نَسَق نفسها لا تُمس بالتبديل، والعودة تجدها كما كانت. آخر وحدة تُحفظ
    // فيفتح التطبيق عليها (مبدّل الوحدات في Figma 61:216)
    const MODULE_KEY = "nasaq-module";

    function setMode(mode) {
      const shadhb = mode === "shadhb";
      root.setAttribute("data-module", shadhb ? "shadhb" : "nasaq");
      nasaqBtn.classList.toggle("active", !shadhb);
      shadhbBtn.classList.toggle("active", shadhb);
      nasaqBtn.setAttribute("aria-checked", String(!shadhb));
      shadhbBtn.setAttribute("aria-checked", String(shadhb));
      try {
        localStorage.setItem(MODULE_KEY, shadhb ? "shadhb" : "nasaq");
      } catch {
        // تعذّر الحفظ لا يمنع التبديل في الجلسة الحالية
      }
    }

    nasaqBtn.addEventListener("click", () => setMode("nasaq"));
    shadhbBtn.addEventListener("click", () => setMode("shadhb"));
    // ⌘1 نَسَق و⌘2 شَذْب
    document.addEventListener("keydown", (e) => {
      if (!e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      // لا تبديل تحت ورقة مفتوحة تخص الوحدة الحالية
      if (window.NasaqWindow.isModalOpen()) return;
      if (e.code === "Digit1" || e.code === "Digit2") {
        e.preventDefault();
        setMode(e.code === "Digit2" ? "shadhb" : "nasaq");
      }
    });
    modeSwitch.hidden = false; // المفتاح مفعَّل — المبدّل يظهر الآن فقط

    // ---------- حالة الفحص — مستقلة تمامًا عن حالة نَسَق ----------
    // { original، currentText، card، droppedCuts،
    //   cuts: لكلٍّ status: pending | cut | kept | stale }
    let state = null;
    let selected = -1; // فهرس القصّة المحددة، أو -1 حين لا تحديد
    let checking = false; // نداء الفحص جارٍ
    let failed = false; // تعذّر الفحص أو تعذّر التحقق من كل القصّات
    let renderedState = null;
    let focusBeforeBusy = null; // عنصر تعطّل وعليه التركيز حين بدأ النداء

    // ---------- آلة حالات شَذْب (Figma 108:781) ----------
    // سبع حالات صريحة تُحسب من حالة الجلسة نفسها لا من CSS: قبل الفحص، جاهز،
    // أثناء الفحص، مراجعة، بعد الحسم، لا قصّات، خطأ. الحالة تُكتب في
    // data-shadhb-state على الجذر، وكل ما تقرره (أزرار، أقسام المفتّش، العمود
    // الظاهر، مؤشر الحالة) يُضبط هنا صراحةً. المنطق تحتها لا يتغير
    const STATUS_LABELS = {
      before: "لم يُفحص بعد",
      ready: "لم يُفحص بعد",
      checking: "جارٍ الفحص…",
      polished: "حُسمت كل القصّات",
      "no-cuts": "لا قصّات مقترحة",
      error: "تعذّر التحقق",
    };

    // أقسام المفتّش لكل حالة (Figma 107:504): null غائب، true مفتوح، false مطويّ
    const SECTIONS = {
      before: { reading: true, cut: null, covenant: true, outcome: null },
      ready: { reading: true, cut: null, covenant: true, outcome: null },
      checking: { reading: true, cut: false, covenant: false, outcome: null },
      review: { reading: true, cut: true, covenant: true, outcome: null },
      polished: { reading: false, cut: null, covenant: null, outcome: true },
      "no-cuts": { reading: true, cut: null, covenant: true, outcome: null },
      error: { reading: false, cut: null, covenant: true, outcome: null },
    };

    // العمود الظاهر عند العرض الواحد كما رُسمت كل حالة (Figma 108:410…200:17497)
    const VIEWS = {
      checking: "result",
      review: "source",
      polished: "result",
      "no-cuts": "source",
      error: "source",
    };

    // وسم القصّة في بطاقتها: اللون للحالة وحدها (Tag, Figma 57:40)
    const CUT_TAGS = {
      pending: { label: "لم تُحسم", tone: "neutral", icon: "circle.dotted.16m" },
      cut: { label: "حُذفت", tone: "module", icon: "scissors.16m" },
      kept: { label: "أُبقيت", tone: "success", icon: "checkmark.16m" },
      stale: { label: "تعذّرت", tone: "warning", icon: null },
    };
    // رمز قرار القصّة في صفّها بالشريط الجانبي (Figma 105:344)
    const CUT_ICONS = {
      pending: "circle.dotted.16r",
      cut: "scissors.16r",
      kept: "checkmark.16r",
      stale: "circle.dotted.16r",
    };

    function shadhbState() {
      if (checking) return "checking";
      if (failed) return "error";
      if (!state) return inputText.value.trim() ? "ready" : "before";
      if (state.cuts.length === 0) return "no-cuts";
      return state.cuts.some((c) => c.status === "pending") ? "review" : "polished";
    }

    // ---------- الصياغات ----------
    // كلها عبر منسّق القشرة المشترك: [مفرد، مثنى، جمع ٣–١٠، مفرد منصوب ١١+، مفرد]
    const wordsLabel = (n) => count(n, ["كلمة واحدة", "كلمتان", "كلمات", "كلمة", "كلمة"]);

    const undecidedLabel = (n) =>
      `بانتظار قرارك في ${count(n, ["قصّة واحدة", "قصّتين", "قصّات", "قصّة", "قصّة"])}`;

    // الإسقاط الجزئي لا موضع دائم له في التصميم، فيُعلَن مرة بنبرة محايدة.
    // الفعل يوافق العدد، فيسير مع الاسم في الصيغة نفسها
    const droppedLabel = (n) =>
      `أسقط التحقق ${count(n, [
        "اقتراحًا واحدًا لم يطابق",
        "اقتراحين لم يطابقا",
        "اقتراحات لم تطابق",
        "اقتراحًا لم يطابق",
        "اقتراحًا لم يطابق",
      ])} نصّك حرفيًا.`;

    // «تكرار، كلمتان، آمنة» — السبب فالعدد فالأمان (Figma 105:389 و107:395)
    function cutMetaText(cut) {
      const reason = cut.reason || "بلا سبب";
      return `${reason}، ${wordsLabel(Number(cut.wordCount) || 0)}، ${cut.safe ? "آمنة" : "جريئة"}`;
    }

    // رمزٌ من رموز التطبيق (icons.svg) لا رسمًا يدويًا: يُبنى بأسماء NS الصحيحة
    // فالأسماء تبقى معطياتٍ في خرائطها، ويحرسها tests/foundations.test.js
    const SVG_NS = "http://www.w3.org/2000/svg";
    function mkIcon(name) {
      const svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("class", "icon");
      svg.setAttribute("aria-hidden", "true");
      const use = document.createElementNS(SVG_NS, "use");
      use.setAttribute("href", `#${name}`);
      svg.appendChild(use);
      return svg;
    }

    const quoted = (text) => `«${text}»`;
    const appliedCount = () => (state ? state.cuts.filter((c) => c.status === "cut").length : 0);
    const words = (text) => prune.wordCores(text).length;
    // الخانة تغيّرت بعد الفحص: العلامات لم تعد تصف ما فيها فتُرفع
    const diverged = () => Boolean(state) && inputText.value.trim() !== state.original;

    // ---------- بطاقة القراءة: وصف يسبق المقص ----------
    // صفوف مركومة في المفتّش (Inspector Row · Stacked, Figma 107:333) —
    // readingCard نفسها من الفحص كما هي بلا مساس
    function cardRows() {
      if (!state) return [];
      return [
        ["الجملة المركزية", state.card.centralSentence],
        ["موضع الشرح الزائد", state.card.overExplanation],
        ["الخاتمة", state.card.ending],
        ["الإيقاع", state.card.rhythm],
      ].filter(([, value]) => value);
    }

    function renderCard() {
      const rows = cardRows();
      readingCard.textContent = "";
      for (const [label, value] of rows) {
        const row = document.createElement("div");
        row.className = "stacked-row";
        const l = document.createElement("span");
        l.className = "row-label";
        l.textContent = label;
        // القيمة من عالم نصّ الكاتب — تأخذ خط المتن
        const v = document.createElement("span");
        v.className = "row-value";
        v.textContent = value;
        row.append(l, v);
        readingCard.appendChild(row);
      }
      return rows.length > 0;
    }

    // ---------- القصّات في الشريط الجانبي: صفٌّ لكل قصّة ورمز قرارها ----------
    function buildCutRow(cut, index) {
      const row = document.createElement("div");
      row.className = "sidebar-row cut-row";
      row.dataset.status = cut.status;
      row.dataset.cut = String(index);
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", String(index === selected));
      row.tabIndex = index === selected ? 0 : -1;
      if (index === selected) row.classList.add("is-selected");
      if (cut.status === "stale") row.setAttribute("aria-disabled", "true");

      const text = document.createElement("span");
      text.className = "row-text";
      const title = document.createElement("span");
      title.className = "row-title";
      title.textContent = quoted(cut.quote);
      const subtitle = document.createElement("span");
      subtitle.className = "row-subtitle";
      subtitle.textContent = cutMetaText(cut);
      text.append(title, subtitle);

      row.append(mkIcon(CUT_ICONS[cut.status]), text);
      return row;
    }

    function renderCuts() {
      cutsList.textContent = "";
      if (!state) return;
      state.cuts.forEach((cut, i) => cutsList.appendChild(buildCutRow(cut, i)));
    }

    // ---------- بطاقة القصّة المحددة: القرار في المفتّش ----------
    // (Suggestion Card · Cut, Figma 73:641 و107:395): الاقتباس الحرفي مُبرَز،
    // ثم السبب والعدد والأمان، ثم الأثر المتوقع، و«احذف» و«أبقِ» للمعلّقة وحدها
    function renderCutCard() {
      if (!state || selected < 0 || !state.cuts[selected]) return;
      const cut = state.cuts[selected];
      const tag = CUT_TAGS[cut.status];
      cutTitle.textContent = `القصّة ${AR(selected + 1)} من ${AR(state.cuts.length)}`;
      cutTag.dataset.tone = tag.tone;
      const tagIcon = cutTag.querySelector(".icon");
      tagIcon.hidden = !tag.icon;
      if (tag.icon) tagIcon.querySelector("use").setAttribute("href", `#${tag.icon}`);
      cutTag.querySelector(".tag-label").textContent = tag.label;
      cutQuote.textContent = quoted(cut.quote);
      cutMeta.textContent = cutMetaText(cut);
      cutEffect.querySelector("span").textContent = cut.expectedEffect
        ? `الأثر المتوقع: ${cut.expectedEffect}`
        : "";
      cutEffect.hidden = !cut.expectedEffect;
      cutActions.hidden = cut.status !== "pending";
    }

    // ---------- العلامات في النص: الشذرة تحمل قرار كل قصّة ----------
    // منقّطة = لم تُحسم، متصلة بالدرجة القوية = المحددة، شطب = حُذفت، وبلا علامة
    // = أُبقيت أو تعذّرت (Figma 108:711). الطبقة فوق الخانة بنفس الخط والقياس،
    // فنصّ الخانة يصير شفافًا ومؤشره ظاهر ويبقى النص قابلًا للتحرير.
    //
    // `occurrence` معامل في المقص (prune.js) لا حقل في عقد `prune_text`: العقد لا
    // يرسله اليوم فيُقرأ غير معرَّف ويعني الظهور الأول — هنا وفي applyCuts سواء.
    // يُمرَّر كما هو لا استباقًا للعقد، بل لأن العلامة والقصّ لا يجوز أن يختلفا
    // على أي ظهور يقصدان
    function locate(text, quote, occurrence) {
      let index = -1;
      let from = 0;
      for (let n = 0; n < Math.max(1, occurrence || 1); n++) {
        index = text.indexOf(quote, from);
        if (index === -1) break;
        from = index + 1;
      }
      return index;
    }

    function renderMarks(show) {
      shardMarks.textContent = "";
      shardMarks.hidden = !show;
      root.toggleAttribute("data-shadhb-marks", show);
      if (!show) return;
      const text = inputText.value;
      const spans = [];
      state.cuts.forEach((cut, i) => {
        if (!cut.quote || cut.status === "kept" || cut.status === "stale") return;
        const at = locate(text, cut.quote, cut.occurrence);
        if (at !== -1) spans.push({ at, end: at + cut.quote.length, index: i });
      });
      spans.sort((a, b) => a.at - b.at);
      const put = (chunk, cls) => {
        if (!chunk) return;
        if (!cls) {
          shardMarks.appendChild(document.createTextNode(chunk));
          return;
        }
        const node = document.createElement("span");
        node.className = cls;
        node.textContent = chunk;
        shardMarks.appendChild(node);
      };
      let cursor = 0;
      for (const span of spans) {
        if (span.at < cursor) continue; // اقتباسان متقاطعان: الأول يحمل العلامة
        put(text.slice(cursor, span.at), null);
        const cut = state.cuts[span.index];
        const cls =
          cut.status === "cut" ? "mark-cut" : span.index === selected ? "mark-selected" : "mark-pending";
        put(text.slice(span.at, span.end), cls);
        cursor = span.end;
      }
      put(text.slice(cursor), null);
    }

    // ---------- الضمانة: العهد مفحوصًا حيًّا لا موعودًا ----------
    // verifySubset كما هي: الناتج ⊂ الأصل كتتابع كلمات. الشارة رمزٌ وحكم
    // (Figma 107:425 و107:470 و107:499)
    function paintCovenant(box, text, ok) {
      box.classList.toggle("fail", !ok);
      box.textContent = "";
      const icon = document.createElement("span");
      icon.className = "covenant-bar-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.appendChild(mkIcon(ok ? "checkmark.seal.16r" : "xmark.seal.16r"));
      const label = document.createElement("span");
      label.textContent = text;
      box.append(icon, label);
    }

    // verifySubset هي الحكم دائمًا، لكن نتيجتها لا تتغيّر إلا بتغيّر نصّيها —
    // فتُحفظ بمفتاحهما بدل إعادة حسابها مع كل ضغطة مفتاح
    let covenantCache = null;
    function covenantCheck() {
      if (!state) return { ok: true, addedWords: [] };
      if (
        !covenantCache ||
        covenantCache.original !== state.original ||
        covenantCache.current !== state.currentText
      ) {
        covenantCache = {
          original: state.original,
          current: state.currentText,
          check: prune.verifySubset(state.original, state.currentText),
        };
      }
      return covenantCache.check;
    }

    // ---------- الرسم: كل حالة بعناصرها ----------
    function renderState() {
      const now = shadhbState();
      const transition = now !== renderedState;
      const busy = now === "checking";
      const hasText = Boolean(inputText.value.trim());
      const check = covenantCheck();
      const applied = appliedCount();
      root.dataset.shadhbState = now;
      if (busy && transition && document.activeElement !== document.body) {
        focusBeforeBusy = document.activeElement;
      }

      // شريط الأدوات: الفعل الرئيس بلون الوحدة دائمًا (Figma 105:285)، معطّلًا بلا
      // نص وبحالة تحميل أثناء الفحص. و«نسخ» و«أرسل إلى نَسَق» حاضران معطّلين حتى
      // يوجد نص مشذَّب — والإرسال يشترط الضمانة فوق ذلك
      pruneBtn.disabled = busy || !hasText;
      pruneBtn.setAttribute("aria-busy", String(busy));
      copyBtn.disabled = busy || applied === 0;
      // الجسر يكتب فوق الخانة، فتغيّرها بعد الفحص يمنعه: يُعطَّل ويقول سببه في
      // تلميحه بدل أن يُعرض متاحًا ويرفض عند النقر
      const gone = diverged();
      sendBtn.disabled = busy || applied === 0 || !check.ok || gone;
      sendBtn.title = gone
        ? "النص في الخانة تغيّر بعد الفحص — افحص من جديد قبل الإرسال"
        : "النص المشذَّب يصير خامًا لنَسَق — جلسة جديدة";

      // الشريط الجانبي: العدد في العنوان، والملاحظة مكان القائمة حين لا صفوف
      const hasCuts = Boolean(state) && state.cuts.length > 0;
      cutsCount.hidden = !hasCuts;
      if (hasCuts) cutsCount.textContent = AR(state.cuts.length);
      cutsNote.hidden = hasCuts;
      cutsNote.textContent =
        now === "no-cuts"
          ? "لم يجد شَذْب موضع حذف آمن في هذه الشذرة."
          : "تظهر القصّات المقترحة هنا بعد الفحص، ولكل واحدة قرارك: احذف أو أبقِ.";

      // المحتوى: لكل حالة عنصرها — نائب، تقدّم، نص مشذَّب، ملاحظة، تنبيه
      placeholder.hidden = !(now === "before" || now === "ready");
      progress.hidden = !busy;
      const noCuts = now === "no-cuts";
      noCutsSource.hidden = !noCuts;
      noCutsResult.hidden = !noCuts;
      // «بعد التشذيب» لا يظهر إلا بعد حذف فعلي — قبله نسخة مطابقة للأصل لا
      // تحمل معلومة
      preview.textContent = applied > 0 ? state.currentText : "";
      renderMarks((now === "review" || now === "polished") && !diverged());

      // المفتّش: الحاضر من الأقسام، والمفتوح منها، ومحتوى كل قسم
      const plan = SECTIONS[now];
      for (const [section, mode] of [
        [readingSection, plan.reading],
        [cutSection, plan.cut],
        [covenantSection, plan.covenant],
        [outcomeSection, plan.outcome],
      ]) {
        section.hidden = mode === null;
        if (mode !== null && transition) {
          section.querySelector(".section-header").setAttribute("aria-expanded", String(mode));
        }
      }

      const hasCard = renderCard();
      readingSkeleton.hidden = !busy;
      readingCard.hidden = busy || !hasCard;
      readingNote.hidden = busy || hasCard;

      if (plan.cut !== null) renderCutCard();

      covenantIcon.querySelector("use").setAttribute("href", now === "error" ? "#xmark.seal.16r" : "#checkmark.seal.16r");
      const showCovenantBar = now === "review" || now === "no-cuts" || now === "error";
      covenantBar.hidden = !showCovenantBar;
      covenantNote.hidden = now !== "before" && now !== "ready";
      if (showCovenantBar) {
        if (now === "error") {
          paintCovenant(covenantBar, "لم تتحقق: استُبعدت كل القصّات", false);
        } else if (check.ok) {
          paintCovenant(covenantBar, "متحققة: لا كلمة مضافة", true);
        } else {
          paintCovenant(covenantBar, `لم تتحقق: كلمات ليست من نصّك (${check.addedWords.join("، ")})`, false);
        }
      }

      // النتيجة بعد الحسم: ملخّص القرارات والكلمات، والضمانة تحتها (Figma 107:439)
      if (plan.outcome !== null && state) {
        const total = words(state.original);
        outcomeCut.textContent = `${AR(applied)} من ${AR(state.cuts.length)}`;
        outcomeKept.textContent = AR(state.cuts.filter((c) => c.status === "kept").length);
        outcomeWords.textContent = `${AR(total - words(state.currentText))} من ${AR(total)}`;
        paintCovenant(
          outcomeCovenant,
          check.ok ? "لم تُضف كلمة واحدة" : `لم تتحقق: كلمات ليست من نصّك (${check.addedWords.join("، ")})`,
          check.ok
        );
      }

      // شريط الحالة: المؤشر وتسميته، وعدّاد كلمات الشذرة (Figma 71:471)
      statusBadge.dataset.status = now;
      statusLabel.textContent =
        now === "review"
          ? undecidedLabel(state.cuts.filter((c) => c.status === "pending").length)
          : STATUS_LABELS[now];
      if (now === "polished" && applied > 0) {
        const total = words(state.original);
        countBox.textContent = `${wordsLabel(words(state.currentText))} من ${AR(total)}`;
      } else {
        countBox.textContent = wordsLabel(words(inputText.value));
      }

      // العمود الظاهر عند العرض الواحد يتبع الحالة عند تغيّرها وحده، فلا يُسحب
      // اختيار الكاتب من تحته وهو يراجع
      const view = now === "polished" && applied === 0 ? null : VIEWS[now];
      if (transition && view) window.NasaqWindow.showView(view);

      // التعطيل يُسقط التركيز إلى الصفحة: بعد النداء يعود إلى حيث كان إن بقي صالحًا
      if (!busy && renderedState === "checking") {
        const target = focusBeforeBusy;
        focusBeforeBusy = null;
        if (
          target &&
          target.isConnected &&
          !target.disabled &&
          target.offsetParent !== null &&
          document.activeElement === document.body
        ) {
          target.focus();
        }
      }

      renderedState = now;
    }

    // ---------- تحديد القصّة: صفٌّ واحد محدد، وقرارها في المفتّش ----------
    function selectCut(index, { focus = false } = {}) {
      if (!state || !state.cuts[index] || state.cuts[index].status === "stale") return;
      selected = index;
      renderCuts();
      renderState();
      if (focus) cutsList.querySelector('[aria-selected="true"]')?.focus();
    }

    // أول قصّة معلّقة هي المحددة بعد الفحص وبعد كل قرار — والمراجعة تسير وحدها
    function selectFirstPending() {
      const next = state ? state.cuts.findIndex((c) => c.status === "pending") : -1;
      selected = next;
    }

    const rowsOf = () => [...cutsList.querySelectorAll("[data-cut]")];

    cutsList.addEventListener("click", (e) => {
      const row = e.target.closest("[data-cut]");
      if (row) selectCut(Number(row.dataset.cut), { focus: true });
    });

    cutsList.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const rows = rowsOf();
      const at = rows.findIndex((r) => Number(r.dataset.cut) === selected);
      const step = e.key === "ArrowDown" ? 1 : -1;
      for (let i = at + step; i >= 0 && i < rows.length; i += step) {
        const index = Number(rows[i].dataset.cut);
        if (state.cuts[index].status === "stale") continue;
        e.preventDefault();
        selectCut(index, { focus: true });
        return;
      }
    });

    // ---------- التطبيق المحلي: المقص النقي لا النموذج ----------
    // «احذف» يقص محليًا عبر prune.js ويرتب الآثار — لا نداء نموذج بعد الفحص
    function applyCutAt(index) {
      const cut = state && state.cuts[index];
      if (!cut || cut.status !== "pending") return;
      const outcome = prune.applyCuts(state.currentText, [{ quote: cut.quote, occurrence: cut.occurrence }]);
      if (outcome.skipped.length > 0) {
        // قصٌّ سابق غيّر الموضع فلم يعد الاقتباس حرفيًا — لا اجتهاد ولا تقريب
        cut.status = "stale";
        shell.showToast("لم يعد الاقتباس موجودًا حرفيًا بعد قصٍّ سابق.", "warning");
      } else {
        state.currentText = prune.tidyAfterCut(outcome.text);
        cut.status = "cut";
      }
      selectFirstPending();
      renderCuts();
      renderState();
    }

    // «أبقِ» قرارٌ لا تغيير: النص كما هو والقصّة تُعلَّم متروكة
    function keepCutAt(index) {
      const cut = state && state.cuts[index];
      if (!cut || cut.status !== "pending") return;
      cut.status = "kept";
      selectFirstPending();
      renderCuts();
      renderState();
    }

    applyBtn.addEventListener("click", () => applyCutAt(selected));
    keepBtn.addEventListener("click", () => keepCutAt(selected));

    // ---------- الفحص: النداء الوحيد للنموذج في هذا البرج ----------
    function presentResult(original, result) {
      // قصّة بلا اقتباس حرفي ليست قصّة: تُسقَط كما يُسقِط التحقق غير المطابق،
      // وتُحسب في عدد المسقطات — فلا يصل «undefined» إلى صفٍّ ولا إلى بطاقة
      const proposed = (result && result.cuts) || [];
      const cuts = proposed
        .filter((c) => c && typeof c.quote === "string" && c.quote.length > 0)
        .map((c) => ({ ...c, status: "pending" }));
      const dropped = ((result && result.droppedCuts) || 0) + (proposed.length - cuts.length);
      state = {
        original,
        currentText: original,
        card: (result && result.readingCard) || {},
        droppedCuts: dropped,
        cuts,
      };
      selectFirstPending();
      // كل المقترحات أُسقطها التحقق: هذه هي حالة الخطأ المرسومة — تنبيه هادئ
      // يطمئن أن النص لم يُمس (Figma 108:752)
      if (cuts.length === 0 && dropped > 0) {
        shell.showError("تعذّر التحقق من القصّات — لم تطابق القصّات المقترحة نصّك حرفيًا فاستُبعدت. لم يُحذف شيء، ونصّك كما هو.");
        failed = true;
      } else if (dropped > 0) {
        // إسقاط جزئي: خبرٌ محايد يُعلَن مرة، فالعدد لا موضع دائم له في التصميم
        shell.showToast(droppedLabel(dropped), "neutral");
      }
      renderCuts();
      renderState();
    }

    async function checkShard() {
      const text = inputText.value.trim();
      if (!text || checking) return;
      failed = false;
      shell.clearError(); // بعد إسقاط الخطأ، فلا يُرسم مستمعُ زواله حالةً عابرة
      state = null;
      selected = -1;
      checking = true;
      renderCuts();
      renderState();
      try {
        const result = await shell.invoke("prune_text", { text });
        checking = false;
        presentResult(text, result);
      } catch (err) {
        checking = false;
        shell.showError(String(err));
        failed = true;
        renderState();
      }
    }

    pruneBtn.addEventListener("click", checkShard);
    // ⌘↩ قرين زر «افحص الشذرة» تمامًا (Figma 71:438): لا يعمل والزر مخفيٌّ لأن
    // وحدة أخرى تملأ الواجهة، ولا وهو معطّل، ولا تحت ورقة مفتوحة
    document.addEventListener("keydown", (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key !== "Enter") return;
      if (pruneBtn.offsetParent === null || pruneBtn.disabled) return;
      if (window.NasaqWindow.isModalOpen()) return;
      e.preventDefault();
      checkShard();
    });

    // زوال التنبيه يُخرج البرج من حالة الخطأ إلى حالته الفعلية
    document.addEventListener("nasaq:error-cleared", (e) => {
      if (e.detail?.owner !== "shadhb" || !failed) return;
      failed = false;
      renderState();
    });

    // الكتابة في الشذرة: قبل الفحص تنقل البرج من «قبل» إلى «جاهز»، وبعده ترفع
    // العلامات لأنها لم تعد تصف ما في الخانة
    inputText.addEventListener("input", renderState);

    // ---------- نسخ النص المشذَّب: قراءة فقط، لا يمسّ الحالة ولا يرسل ----------
    copyBtn.addEventListener("click", async () => {
      if (!state) return;
      const ok = await shell.copyText(state.currentText);
      shell.showToast(ok ? "نُسخ النص المشذّب." : "تعذّر النسخ إلى الحافظة.", ok ? "success" : "danger");
    });

    // ---------- الجسر إلى نَسَق: المعبر الوحيد، وبشرطي أمان ----------
    sendBtn.addEventListener("click", () => {
      if (!state) return;
      // حارس فقدان النص: الخانة تغيّرت بعد الفحص — لا كتابة فوق تعديل الكاتب
      if (diverged()) {
        shell.showError("النص في الخانة تغيّر بعد الفحص — افحص من جديد قبل الإرسال.");
        return;
      }
      // الشهادة شرط عبور لا عرضًا فقط
      if (!covenantCheck().ok) return;
      shell.sendToNasaq(state.currentText);
      setMode("nasaq");
      shell.showToast("انتقل النص المشذَّب إلى نَسَق — جلسة جديدة.", "success");
    });

    // واجهة تشخيص واختبار: تسمح بفحص خط القصّ محليًا (معاينة المتصفح)
    // بنتيجة مصنوعة دون نداء النموذج — لا يستعملها التطبيق نفسه
    window.NasaqShadhb = { presentResult, setMode, selectCut };

    renderState();

    // آخر وحدة تُستعاد بعد اكتمال الوصل كله: فشلٌ قبل هذا السطر يُبقي نَسَق فعّالًا
    try {
      if (localStorage.getItem(MODULE_KEY) === "shadhb") setMode("shadhb");
    } catch {
      // التخزين محجوب: يبدأ التطبيق على نَسَق
    }
  } catch (err) {
    // درع العزل الأمامي: تعطّل شَذْب يُسجَّل ويُعزَل — نَسَق يواصل عمله كاملًا
    console.error("تعطّل برج شَذْب وعُزل بأمان:", err);
  }
})();
