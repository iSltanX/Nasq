// providers.js — جدول المزوّدات الجاهزة، مشتركًا بين نافذة الإعدادات وورقة
// «اربط نموذجًا» في النافذة الرئيسية. بيانات نقلٍ لا أكثر: عنوان ونموذج
// افتراضي وصفحة المفتاح — لا prompt فيه ولا عقد، فهو من المشترك الحقيقي.
(() => {
  // transport هي قيمة provider التي تفهمها النواة: "cloud" و"anthropic" و"ollama".
  // keyUrl صفحة المفاتيح لدى المزوّد نفسه، ونطاقها مسموح في القدرة بالاسم
  const PROVIDERS = {
    gemini: {
      label: "Gemini",
      transport: "cloud",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
      model: "gemini-3.5-flash",
      keyUrl: "https://aistudio.google.com/apikey",
    },
    openai: {
      label: "OpenAI",
      transport: "cloud",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-5.6-terra",
      keyUrl: "https://platform.openai.com/api-keys",
    },
    claude: {
      label: "Claude",
      transport: "anthropic",
      baseUrl: "https://api.anthropic.com",
      model: "claude-opus-5",
      keyUrl: "https://console.anthropic.com/settings/keys",
    },
    groq: {
      label: "Groq",
      transport: "cloud",
      baseUrl: "https://api.groq.com/openai/v1",
      model: "llama-3.3-70b-versatile",
      keyUrl: "https://console.groq.com/keys",
    },
    openrouter: {
      label: "OpenRouter",
      transport: "cloud",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "google/gemini-2.5-flash",
      keyUrl: "https://openrouter.ai/keys",
    },
    ollama: {
      label: "‏Ollama (على جهازك)",
      transport: "ollama",
      baseUrl: "http://127.0.0.1:11434",
      model: "qwen3:8b",
      // المحلي بلا مفتاح: رابطه تنزيلُه، ونصّ الرابط يتبدّل معه
      keyUrl: "https://ollama.com/download",
      keyLabel: "كيف أشغّل Ollama؟",
    },
  };

  // الترتيب كما في قائمة التصميم، والفاصل قبل المحلي
  const PROVIDER_ORDER = ["gemini", "openai", "claude", "groq", "openrouter", "ollama"];
  const LOCAL_PROVIDER = "ollama";

  // الزر المطابق لإعداد محفوظ: Claude وOllama بقيمة النقل، والسحابي بمضيف
  // العنوان — والعنوان المخصّص لا يطابق مزوّدًا
  function presetFor(transport, baseUrl) {
    if (transport === "anthropic") return "claude";
    if (transport === "ollama") return "ollama";
    const url = String(baseUrl || "").toLowerCase();
    return (
      PROVIDER_ORDER.find((key) => {
        const candidate = PROVIDERS[key];
        return candidate.transport === "cloud" && url.includes(new URL(candidate.baseUrl).host);
      }) ?? null
    );
  }

  // بنود قائمة المزوّد بفاصلها قبل المحلي — القائمة نفسها في النافذتين
  function menuItems() {
    return PROVIDER_ORDER.flatMap((key) =>
      key === LOCAL_PROVIDER
        ? [{ separator: true }, { value: key, label: PROVIDERS[key].label }]
        : [{ value: key, label: PROVIDERS[key].label }]
    );
  }

  // حكم «اختبر» في موضع واحد للنافذتين: النجاح أن يولّد النموذج فعلًا، لا أن
  // يُسرد اسمه وحده — قائمةٌ قد تحوي نموذجًا لا يقبل التوليد (المرحلة ٩).
  // وردُّ خطأٍ من المزوّد (401 مفتاح مرفوض، 402، 429، 5xx) يصل connected: true بلا حكمٍ على
  // النموذج ولا قائمة: ليس نجاحًا. كان يُعرض بعلامة النجاح الخضراء (فحص m6-17)
  function connectionWorks(report) {
    if (!report?.connected || report.keyAccepted === false) return false;
    if (report.modelListed === false || report.generates === false) return false;
    // بلا نموذج مكتوب لا حكم عليه؛ فالنجاح حينها أن تصل قائمةٌ فيها نماذج
    return report.modelListed === true || report.modelCount > 0;
  }

  // ما الذي فشل؟ شاشات أول تشغيل المرسومة أربع (Success وKey-Rejected وInvalid-Model
  // وConnection-Failed)، والحكم بينها هنا بجوار شرط النجاح فلا تكرّره نافذة. وردُّ خطأٍ
  // لا يخصّ المفتاح ولا النموذج (ازدحام، عطل خادم) يُعرض بشاشة التعذّر ورسالته فيها
  function connectionVerdict(report) {
    if (connectionWorks(report)) return "works";
    if (!report?.connected) return "unreachable";
    if (report.keyAccepted === false) return "key-rejected";
    if (report.modelListed === false || report.generates === false) return "model-unavailable";
    return "unreachable";
  }

  // مضيف العنوان كما يُعرض للمستخدم، والمحليّ منه: الجهاز نفسه لا غير
  function hostOf(baseUrl) {
    try {
      return new URL(String(baseUrl || "")).host;
    } catch {
      return "";
    }
  }
  function isLocalHost(baseUrl) {
    return /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(hostOf(baseUrl));
  }

  window.NasaqProviders = {
    PROVIDERS, PROVIDER_ORDER, LOCAL_PROVIDER, presetFor, menuItems, connectionWorks, connectionVerdict, hostOf, isLocalHost,
  };
})();
