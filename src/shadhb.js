// وضع «شَذْب» (v4.4 — MVP): مقصّ الشذرات. يقترح الحذف ولا يكتب — عهد
// الوضع: بطاقة قراءة وقصّات مقترحة، الكاتب يقرر كل قصّة، والتطبيق محلي
// حتمي عبر المقص النقي، والشهادة الحية تفحص أن لا كلمة أُضيفت.
//
// حدود العزل: يستهلك window.NasaqShell وwindow.NasaqPrune حصرًا — لا يلمس
// دوال نسق ولا حالته ولا يكتب في خانة النص إلا عبر جسر sendToNasaq الوحيد.
// كل الجسد داخل درع: فشله الكامل — تحميلًا أو تنفيذًا — لا يمس نسق بشيء،
// وإطفاء المفتاح (localStorage["nasaq-shadhb"] = "off") يعيد واجهة v4.3 حرفيًا.
(() => {
  try {
    const shell = window.NasaqShell;
    if (!shell || !shell.flags || shell.flags.shadhbEnabled !== true) return;
    const prune = window.NasaqPrune;
    if (!prune) return;

    const el = shell.el;
    const modeSwitch = el("mode-switch");
    const nasaqBtn = el("mode-nasaq-btn");
    const shadhbBtn = el("mode-shadhb-btn");
    const inputText = el("input-text"); // خانة الخام مشتركة — قراءة فقط هنا
    const pruneBtn = el("prune-btn");
    const sendBtn = el("send-to-nasaq-btn");
    const placeholder = el("shadhb-placeholder");
    const loading = el("shadhb-loading");
    const cardBox = el("reading-card");
    const cutsList = el("cuts-list");
    const droppedNote = el("dropped-note");
    const previewWrap = el("prune-preview-wrap");
    const previewBox = el("prune-preview");
    const covenantBar = el("covenant-bar");

    const AR = (n) => Number(n).toLocaleString("ar");

    // ---------- التبديل بين الوضعين ----------
    // data-mode على الجذر يقود CSS وحده: لوحة شَذْب محل لوحة النتيجة وأدوات
    // نسق تغيب — حالة نسق نفسها لا تُمس بالتبديل، والعودة تجدها كما كانت
    function setMode(mode) {
      const shadhb = mode === "shadhb";
      if (shadhb) {
        document.documentElement.setAttribute("data-mode", "shadhb");
      } else {
        document.documentElement.removeAttribute("data-mode");
      }
      nasaqBtn.classList.toggle("active", !shadhb);
      shadhbBtn.classList.toggle("active", shadhb);
    }

    nasaqBtn.addEventListener("click", () => setMode("nasaq"));
    shadhbBtn.addEventListener("click", () => setMode("shadhb"));
    modeSwitch.hidden = false; // المفتاح مفعَّل — المبدّل يظهر الآن فقط

    // ---------- حالة الفحص — مستقلة تمامًا عن حالة نسق ----------
    // { original، currentText، readingCard، droppedCuts،
    //   cuts: لكلٍّ status: pending | cut | kept | stale }
    let state = null;

    function wordsLabel(n) {
      if (n === 0) return "لم تُحذف كلمة بعد";
      if (n === 1) return "حُذفت كلمة واحدة";
      if (n === 2) return "حُذفت كلمتان";
      return n <= 10 ? `حُذفت ${AR(n)} كلمات` : `حُذفت ${AR(n)} كلمة`;
    }

    // ---------- بطاقة القراءة: وصف يسبق المقص ----------
    function renderCard() {
      cardBox.innerHTML = "";
      const rows = [
        ["الجملة المركزية", state.readingCard.centralSentence],
        ["موضع الشرح الزائد", state.readingCard.overExplanation],
        ["الخاتمة", state.readingCard.ending],
        ["الإيقاع", state.readingCard.rhythm],
      ];
      for (const [label, value] of rows) {
        if (!value) continue;
        const row = document.createElement("div");
        row.className = "card-row";
        const l = document.createElement("span");
        l.className = "card-label";
        l.textContent = `${label}: `;
        row.appendChild(l);
        row.appendChild(document.createTextNode(value));
        cardBox.appendChild(row);
      }
      cardBox.hidden = cardBox.children.length === 0;
    }

    // ---------- القصّات: قرار الكاتب لكل واحدة — احذف أو أبقِ ----------
    const STATUS_CHIPS = {
      cut: "حُذفت",
      kept: "أُبقيت ✓",
      stale: "تعذّرت — تغيّر موضعها بقصٍّ سابق",
    };

    function buildCutEntry(cut, index) {
      const box = document.createElement("div");
      box.className = "cut-entry " + cut.status;

      const quote = document.createElement("div");
      quote.className = "cut-quote";
      quote.textContent = cut.quote;
      box.appendChild(quote);

      const meta = document.createElement("div");
      meta.className = "cut-meta";
      const safety = cut.safe ? "آمنة" : "جريئة — قرارك";
      meta.textContent = `${cut.reason || "بلا سبب"} · ${AR(cut.wordCount)} ${cut.wordCount <= 2 ? "كلمة" : cut.wordCount <= 10 ? "كلمات" : "كلمة"} · ${safety}`;
      box.appendChild(meta);

      if (cut.expectedEffect) {
        const effect = document.createElement("div");
        effect.className = "cut-effect";
        effect.textContent = cut.expectedEffect;
        box.appendChild(effect);
      }

      const actions = document.createElement("div");
      actions.className = "cut-actions";
      if (cut.status === "pending") {
        const doBtn = document.createElement("button");
        doBtn.type = "button";
        doBtn.className = "cut-do";
        doBtn.textContent = "احذف";
        doBtn.addEventListener("click", () => applyCutAt(index));
        const keepBtn = document.createElement("button");
        keepBtn.type = "button";
        keepBtn.className = "cut-keep";
        keepBtn.textContent = "أبقِ";
        keepBtn.addEventListener("click", () => keepCutAt(index));
        actions.append(doBtn, keepBtn);
      } else {
        const chip = document.createElement("span");
        chip.className = "cut-chip " + cut.status;
        chip.textContent = STATUS_CHIPS[cut.status];
        actions.appendChild(chip);
      }
      box.appendChild(actions);
      return box;
    }

    function renderCuts() {
      cutsList.innerHTML = "";
      if (state.cuts.length === 0) {
        const empty = document.createElement("div");
        empty.className = "cuts-empty";
        empty.textContent = "لا زوائد مقترحة — الشذرة مُحكَمة كما هي.";
        cutsList.appendChild(empty);
        return;
      }
      state.cuts.forEach((cut, i) => cutsList.appendChild(buildCutEntry(cut, i)));
    }

    // ---------- شريط الضمانة: العهد مفحوصًا حيًّا لا موعودًا ----------
    function renderCovenant() {
      const check = prune.verifySubset(state.original, state.currentText);
      const removed =
        prune.wordCores(state.original).length - prune.wordCores(state.currentText).length;
      covenantBar.classList.toggle("fail", !check.ok);
      covenantBar.textContent = check.ok
        ? `تحقق آلي: لم تُضف كلمة — كل الناتج من نصّك · ${wordsLabel(removed)}`
        : `خرق العهد: كلمات ليست من نصّك (${check.addedWords.join("، ")}) — النتيجة لن تُرسل`;
      covenantBar.hidden = false;
      sendBtn.hidden = !check.ok;
      return check.ok;
    }

    function renderAll() {
      placeholder.hidden = true;
      renderCard();
      renderCuts();
      droppedNote.textContent =
        state.droppedCuts > 0
          ? `أسقط التحقق الآلي ${AR(state.droppedCuts)} من مقترحات النموذج (غير حرفي أو فوق سقف الحجم).`
          : "";
      droppedNote.hidden = state.droppedCuts === 0;
      previewBox.textContent = state.currentText;
      previewWrap.hidden = false;
      renderCovenant();
    }

    // ---------- التطبيق المحلي: المقص النقي لا النموذج ----------
    // «احذف» يقص محليًا عبر prune.js ويرتب الآثار — لا نداء نموذج بعد الفحص
    function applyCutAt(index) {
      const cut = state.cuts[index];
      if (!cut || cut.status !== "pending") return;
      const outcome = prune.applyCuts(state.currentText, [{ quote: cut.quote }]);
      if (outcome.skipped.length > 0) {
        // قصّ سابق غيّر الموضع فلم يعد الاقتباس حرفيًا — لا اجتهاد ولا تقريب
        cut.status = "stale";
        shell.showToast("لم يعد الاقتباس موجودًا حرفيًا بعد قصٍّ سابق.");
      } else {
        state.currentText = prune.tidyAfterCut(outcome.text);
        cut.status = "cut";
      }
      renderAll();
    }

    // «أبقِ» قرارٌ لا تغيير: النص كما هو والقصّة تُعلَّم متروكة
    function keepCutAt(index) {
      const cut = state.cuts[index];
      if (!cut || cut.status !== "pending") return;
      cut.status = "kept";
      renderAll();
    }

    // ---------- الفحص: النداء الوحيد للنموذج في هذا الوضع ----------
    function presentResult(original, result) {
      state = {
        original,
        currentText: original,
        readingCard: (result && result.readingCard) || {},
        droppedCuts: (result && result.droppedCuts) || 0,
        cuts: ((result && result.cuts) || []).map((c) => ({ ...c, status: "pending" })),
      };
      renderAll();
    }

    pruneBtn.addEventListener("click", async () => {
      const text = inputText.value.trim();
      shell.clearError();
      if (!text) {
        shell.showError("أدخل نصًا أولًا.");
        return;
      }
      pruneBtn.disabled = true;
      loading.hidden = false;
      placeholder.hidden = true;
      try {
        const result = await shell.invoke("prune_text", { text });
        presentResult(text, result);
      } catch (err) {
        shell.showError(String(err));
        if (!state) placeholder.hidden = false;
      } finally {
        pruneBtn.disabled = false;
        loading.hidden = true;
      }
    });

    // ---------- الجسر إلى نَسَق: المعبر الوحيد، وبشرطي أمان ----------
    sendBtn.addEventListener("click", () => {
      if (!state) return;
      // حارس فقدان النص: الخانة تغيّرت بعد الفحص — لا كتابة فوق تعديل الكاتب
      if (inputText.value.trim() !== state.original.trim()) {
        shell.showError("النص في الخانة تغيّر بعد الفحص — افحص من جديد قبل الإرسال.");
        return;
      }
      // الشهادة شرط عبور لا عرضًا فقط
      if (!renderCovenant()) return;
      shell.sendToNasaq(state.currentText);
      setMode("nasaq");
      shell.showToast("انتقل النص المشذَّب إلى نَسَق — جلسة جديدة.");
    });

    // واجهة تشخيص واختبار: تسمح بفحص خط القصّ محليًا (معاينة المتصفح)
    // بنتيجة مصنوعة دون نداء النموذج — لا يستعملها التطبيق نفسه
    window.NasaqShadhb = { presentResult, setMode };
  } catch (err) {
    // درع العزل الأمامي: تعطّل شَذْب يُسجَّل ويُعزَل — نسق يواصل عمله كاملًا
    console.error("تعطّل وضع شَذْب وعُزل بأمان:", err);
  }
})();
