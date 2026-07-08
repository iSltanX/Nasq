// سجلّ تجربة شَذْب — أداة مؤقتة لجمع 20–30 عينة قبل قرار v5.3.0/v6.0.0،
// خلف مفتاح واحد أدناه. لا تلمس عقد شَذْب ولا منطق الفحص أو التحقق —
// مراقبة خارجية بحتة لا تعديل في shadhb.js: مراقب DOM على #cuts-list هو
// المُطلِق الوحيد لظهور الكتلة (كل renderAll() في shadhb.js يملأ هذا
// العنصر دائمًا — بقصّات أو بحالة فراغ — فهو إشارة اكتمال نتيجة موثوقة
// بصرف النظر عمّن نادى العرض)، ومستمع مستقل على زر «افحص الشذرة» يلتقط
// نص اللحظة (v5.2.2: الإصلاح — تغليف window.NasaqShadhb.presentResult
// وحده كان يفوّت المسار الإنتاجي، لأن زر الفحص الحقيقي في shadhb.js ينادي
// مرجع presentResult المحلي المُقفَل عليه لا خاصية الكائن المصدَّر؛
// إثراء presentResult أُبقي كمصدر بيانات أدق حين يُستدعى تشخيصيًا فقط).
// فشلها الكامل معزول بالدرع نفسه المتبع في التطبيق، ولا يمس شَذْب ولا
// نسق بشيء.
//
// الإزالة الكاملة: احذف هذا الملف + وسم <script> المقابل في index.html +
// shadhb_trial_log.rs + سطر mod وسطري invoke_handler في main.rs، وdata/
// shathb-trials/ إن رغبت. صفر أثر آخر في أي ملف.
(() => {
  const ENABLE_SHATHB_TRIAL_LOG = true;
  if (!ENABLE_SHATHB_TRIAL_LOG) return;

  try {
    const shell = window.NasaqShell;
    const shadhbApi = window.NasaqShadhb;
    if (!shell || !shadhbApi || typeof shadhbApi.presentResult !== "function") return;

    const el = shell.el;
    const invoke = shell.invoke;
    const pane = el("shadhb-pane");
    const body = pane && pane.querySelector(".shadhb-body");
    const cutsListEl = el("cuts-list");
    const pruneBtn = el("prune-btn");
    const inputText = el("input-text");
    if (!body || !cutsListEl) return;

    // ---------- إثراء اختياري: يعمل حين يُنادى presentResult مباشرة
    // (مسار تشخيص موثَّق في shadhb.js نفسه) — لا يُعتمَد عليه لإظهار
    // الكتلة، فقط لتفصيل أدق في السجل حين يتوفر ----------
    let lastCheck = null; // { original, readingCard, cuts, droppedCuts }
    const originalPresentResult = shadhbApi.presentResult;
    shadhbApi.presentResult = function (original, result) {
      lastCheck = {
        original,
        readingCard: (result && result.readingCard) || {},
        cuts: (result && result.cuts) || [],
        droppedCuts: (result && result.droppedCuts) || 0,
      };
      return originalPresentResult.call(this, original, result);
    };

    // ---------- نص اللحظة عند بدء فحص جديد — مستمع إضافي مستقل على الزر
    // نفسه (لا تعديل في shadhb.js: addEventListener يقبل مستمعين مستقلين
    // على العنصر الواحد)، فحص جديد يُبطل أي بطاقة سجل مفتوحة من نتيجة سابقة ----------
    let pendingOriginal = null;
    if (pruneBtn && inputText) {
      pruneBtn.addEventListener("click", () => {
        pendingOriginal = inputText.value.trim();
        closeOpenForms();
      });
    }

    // ---------- المُطلِق الفعلي: أي تغيّر في #cuts-list يعني نتيجة عُرضت —
    // renderCuts() في shadhb.js يملأ هذا العنصر في كل استدعاء renderAll()
    // (قصّات، أو حالة فراغ، أو إسقاط كامل) فهو يغطي كل الحالات المطلوبة ----------
    new MutationObserver(() => {
      if (cutsListEl.children.length > 0) ensureBlock();
    }).observe(cutsListEl, { childList: true });

    // ---------- الأنماط: وسم مضمَّن فريد — إزالة هذا الملف تُزيله كله ----------
    function ensureStyle() {
      if (document.getElementById("shathb-trial-style")) return;
      const style = document.createElement("style");
      style.id = "shathb-trial-style";
      style.textContent = `
#shathb-trial-tools { margin-top: 16px; padding-top: 10px; border-top: 1px dashed rgba(var(--metal-rgb), 0.16); }
#shathb-trial-tools .shathb-trial-label { display: block; font-size: 10px; color: var(--text-dim); opacity: 0.65; margin-bottom: 6px; }
#shathb-trial-tools .shathb-trial-row { display: flex; gap: 8px; flex-wrap: wrap; }
.shathb-trial-btn { font-size: 11px; padding: 3px 10px; border-radius: 6px; background: transparent; color: var(--text-dim); border: 1px solid var(--tool-border); font-family: inherit; cursor: pointer; opacity: 0.8; }
.shathb-trial-btn:hover { opacity: 1; color: var(--text); }
.shathb-trial-btn:disabled { opacity: 0.4; cursor: default; }
.shathb-trial-panel { margin-top: 8px; padding: 10px 12px; border-radius: 8px; background: var(--bg-raised); border: 1px solid var(--tool-border); font-size: 12px; display: flex; flex-direction: column; gap: 8px; }
.shathb-trial-panel .row-label { color: var(--text-dim); font-size: 11px; }
.shathb-trial-chips { display: flex; gap: 6px; flex-wrap: wrap; }
.shathb-trial-chip { font-size: 11px; padding: 3px 10px; border-radius: 12px; border: 1px solid var(--tool-border); background: transparent; color: var(--tool-text); font-family: inherit; cursor: pointer; }
.shathb-trial-chip.active { border-color: var(--accent); color: var(--accent); background: var(--accent-tint); }
.shathb-trial-panel textarea { width: 100%; box-sizing: border-box; min-height: 40px; resize: vertical; font-family: inherit; font-size: 12px; background: var(--bg-input); color: var(--text); border: 1px solid var(--tool-border); border-radius: 6px; padding: 6px 8px; }
.shathb-trial-panel p.confirm-msg { margin: 0; font-size: 12px; color: var(--text); line-height: 1.6; }
`;
      document.head.appendChild(style);
    }

    // ---------- كتلة «أدوات التجربة» — مستقلة بعد مساحة النتيجة ----------
    let block = null;
    let logBtn = null;
    let renewBtn = null;
    function ensureBlock() {
      if (block) return block;
      ensureStyle();
      block = document.createElement("div");
      block.id = "shathb-trial-tools";

      const label = document.createElement("span");
      label.className = "shathb-trial-label";
      label.textContent = "أدوات التجربة";

      const row = document.createElement("div");
      row.className = "shathb-trial-row";

      logBtn = document.createElement("button");
      logBtn.type = "button";
      logBtn.className = "shathb-trial-btn";
      logBtn.textContent = "سجّل التجربة";
      logBtn.addEventListener("click", openLogPanel);

      renewBtn = document.createElement("button");
      renewBtn.type = "button";
      renewBtn.className = "shathb-trial-btn";
      renewBtn.textContent = "تجديد السجل";
      renewBtn.addEventListener("click", openRenewConfirm);

      row.append(logBtn, renewBtn);
      block.append(label, row);
      body.appendChild(block);
      return block;
    }

    let openPanel = null;
    function closeOpenForms() {
      if (openPanel) {
        openPanel.remove();
        openPanel = null;
      }
    }

    // ---------- بطاقة «سجّل التجربة» ----------
    function openLogPanel() {
      closeOpenForms();

      const panel = document.createElement("div");
      panel.className = "shathb-trial-panel";
      openPanel = panel;

      let rating = null;
      let accepted = null;

      const ratingLabel = document.createElement("span");
      ratingLabel.className = "row-label";
      ratingLabel.textContent = "التقييم:";
      const ratingRow = document.createElement("div");
      ratingRow.className = "shathb-trial-chips";
      const ratingBtns = [
        ["excellent", "ممتاز"],
        ["good", "جيد"],
        ["excessive", "زائد"],
        ["wrong", "أخطأ"],
      ].map(([value, text]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "shathb-trial-chip";
        b.textContent = text;
        b.addEventListener("click", () => {
          rating = value;
          ratingBtns.forEach((x) => x.classList.toggle("active", x === b));
        });
        ratingRow.appendChild(b);
        return b;
      });

      const acceptLabel = document.createElement("span");
      acceptLabel.className = "row-label";
      acceptLabel.textContent = "هل قبلت الاقتراح؟";
      const acceptRow = document.createElement("div");
      acceptRow.className = "shathb-trial-chips";
      const acceptBtns = [
        ["نعم", true],
        ["لا", false],
      ].map(([text, value]) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "shathb-trial-chip";
        b.textContent = text;
        b.addEventListener("click", () => {
          accepted = value;
          acceptBtns.forEach((x) => x.classList.toggle("active", x === b));
        });
        acceptRow.appendChild(b);
        return b;
      });

      const noteLabel = document.createElement("span");
      noteLabel.className = "row-label";
      noteLabel.textContent = "ملاحظة قصيرة (اختياري):";
      const noteInput = document.createElement("textarea");
      noteInput.placeholder = "اكتب ملاحظتك هنا…";

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "shathb-trial-btn";
      saveBtn.textContent = "حفظ في السجل";
      saveBtn.addEventListener("click", async () => {
        saveBtn.disabled = true;
        try {
          const entry = buildEntry(rating, accepted, noteInput.value.trim());
          await invoke("save_shadhb_trial", { entry });
          closeOpenForms();
          shell.showToast("حُفظت التجربة في السجل.");
        } catch (err) {
          shell.showError(String(err));
        } finally {
          saveBtn.disabled = false;
        }
      });

      panel.append(ratingLabel, ratingRow, acceptLabel, acceptRow, noteLabel, noteInput, saveBtn);
      block.appendChild(panel);
    }

    // ---------- جمع صورة الفحص من DOM وlastCheck — بلا استنتاج جديد ----------
    function wordCount(text) {
      const t = (text || "").trim();
      return t ? t.split(/\s+/).filter(Boolean).length : 0;
    }

    // بطاقة القراءة من DOM مباشرة — التسميات نفسها الثابتة في renderCard()
    // بـshadhb.js؛ قراءة لما هو معروض أصلًا لا استنتاج جديد
    const CARD_LABELS = {
      "الجملة المركزية": "centralSentence",
      "موضع الشرح الزائد": "excessExplanation",
      "الخاتمة": "ending",
      "الإيقاع": "rhythm",
    };
    function readSummaryFromDom() {
      const summary = { centralSentence: null, excessExplanation: null, ending: null, rhythm: null };
      const cardBox = el("reading-card");
      if (!cardBox || cardBox.hidden) return summary;
      for (const row of cardBox.querySelectorAll(".card-row")) {
        const labelText = (row.querySelector(".card-label")?.textContent || "")
          .replace(/:\s*$/, "")
          .trim();
        const key = CARD_LABELS[labelText];
        if (key) summary[key] = row.querySelector(".card-value")?.textContent || null;
      }
      return summary;
    }

    function buildEntry(rating, accepted, note) {
      // الأصل: نص لحظة الضغط على «افحص الشذرة» (يعمل دومًا إنتاجيًا)،
      // واحتياط lastCheck لمسار التشخيص المباشر
      const original = pendingOriginal !== null ? pendingOriginal : (lastCheck ? lastCheck.original : "");

      const previewWrap = el("prune-preview-wrap");
      const previewBox = el("prune-preview");
      // «بعد التشذيب» لا يظهر إلا بعد حذف فعلي — قبله النتيجة مطابقة للأصل
      const resultText =
        previewWrap && !previewWrap.hidden && previewBox ? previewBox.textContent : original;

      const domEntries = [...cutsListEl.querySelectorAll(".cut-entry")];
      const rawCuts = (lastCheck && lastCheck.cuts) || [];
      const statusMap = { cut: "applied", kept: "kept", stale: "not_applicable" };

      const cards = domEntries.map((domEntry, i) => {
        let status = null;
        for (const cls of ["cut", "kept", "stale"]) {
          if (domEntry.classList.contains(cls)) {
            status = statusMap[cls];
            break;
          }
        }
        // إثراء من lastCheck إن توفّر (بيانات الفحص الخام)، وإلا ما هو
        // معروض فعليًا في البطاقة (اقتباس حرفي، ونص السبب/الكلمات كاملًا
        // دون تفكيك — لا استخراج معقد)
        const raw = rawCuts[i];
        const quote = domEntry.querySelector(".cut-quote")?.textContent || null;
        const metaText = domEntry.querySelector(".cut-meta")?.textContent || null;
        return {
          id: i,
          type: "delete",
          label: null,
          title: null,
          text: (raw && raw.quote) || quote,
          suggestedText: null,
          reason: (raw && raw.reason) || metaText,
          wordsCount: raw && typeof raw.wordCount === "number" ? raw.wordCount : null,
          status,
        };
      });

      const deletedWords = cards
        .filter((c) => c.status === "applied" && typeof c.wordsCount === "number")
        .reduce((sum, c) => sum + c.wordsCount, 0);

      const versionEl = document.querySelector(".credit .version");
      const version = versionEl ? versionEl.textContent.replace(/^[·\s]+/, "").trim() : null;

      const summary = lastCheck
        ? {
            centralSentence: lastCheck.readingCard.centralSentence || null,
            excessExplanation: lastCheck.readingCard.overExplanation || null,
            ending: lastCheck.readingCard.ending || null,
            rhythm: lastCheck.readingCard.rhythm || null,
          }
        : readSummaryFromDom();

      return {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        version: version || null,
        originalText: original,
        resultText,
        stats: {
          originalCharacters: original.length,
          resultCharacters: resultText.length,
          originalWords: wordCount(original),
          resultWords: wordCount(resultText),
          deletedWords,
          cardsCount: cards.length,
          appliedCardsCount: cards.filter((c) => c.status === "applied").length,
          keptCardsCount: cards.filter((c) => c.status === "kept").length,
        },
        summary,
        cards,
        userReview: { accepted, rating, note: note || null },
      };
    }

    // ---------- تجديد السجل: تأكيد صريح قبل بدء دفعة جديدة ----------
    function openRenewConfirm() {
      closeOpenForms();
      const panel = document.createElement("div");
      panel.className = "shathb-trial-panel";
      openPanel = panel;

      const msg = document.createElement("p");
      msg.className = "confirm-msg";
      msg.textContent =
        "سيتم بدء سجل تجربة جديد، وسيبقى السجل السابق محفوظًا في ملفه. هل تريد المتابعة؟";

      const row = document.createElement("div");
      row.className = "shathb-trial-row";

      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "shathb-trial-btn";
      cancel.textContent = "إلغاء";
      cancel.addEventListener("click", closeOpenForms);

      const proceed = document.createElement("button");
      proceed.type = "button";
      proceed.className = "shathb-trial-btn";
      proceed.textContent = "نعم، ابدأ سجلًا جديدًا";
      proceed.addEventListener("click", async () => {
        proceed.disabled = true;
        try {
          await invoke("renew_shadhb_trial_log");
          shell.showToast("بدأ سجل تجربة جديد.");
        } catch (err) {
          shell.showError(String(err));
        } finally {
          closeOpenForms();
        }
      });

      row.append(cancel, proceed);
      panel.append(msg, row);
      block.appendChild(panel);
    }
  } catch (err) {
    // درع العزل نفسه المتبع في shadhb.js: تعطّل السجل يُسجَّل ويُعزَل
    console.error("تعطّل سجل تجربة شَذْب وعُزل بأمان:", err);
  }
})();
