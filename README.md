<div dir="rtl">

<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/readme/header-ar-dark.png">
  <img alt="نَسَق • شَذْب: تطبيق عربي لنظام macOS يعالج شكل النص لا مضمونه. نَسَق يرتّب الشكل للنشر، وشَذْب يهذّب بالحذف وحده" src="assets/readme/header-ar-light.png" width="100%">
</picture>

[![Release](https://img.shields.io/github/v/release/iSltanX/Nasq?label=release&color=0A6E72&style=flat-square)](https://github.com/iSltanX/Nasq/releases/latest)
[![macOS · Apple Silicon](https://img.shields.io/badge/macOS-Apple%20Silicon-1D1D1F?style=flat-square)](#المتطلبات)
[![Providers](https://img.shields.io/badge/providers-your%20key%20%C2%B7%20Ollama-4A6A4D?style=flat-square)](#الخصوصية)
[![Key in Keychain](https://img.shields.io/badge/API%20key-Keychain-AD6236?style=flat-square)](#الخصوصية)

### [⬇︎ تنزيل أحدث إصدار](https://github.com/iSltanX/Nasq/releases/latest)

<sub>مجاني · macOS · Apple Silicon</sub>

[الفكرة](#الفكرة) · [طريقة العمل](#طريقة-العمل) · [الميزات](#الميزات) · [التثبيت](#التثبيت) · [الاستخدام](#الاستخدام) · [لقطات الشاشة](#لقطات-الشاشة) · [الخصوصية](#الخصوصية) · [الأسئلة المتكررة](#الأسئلة-المتكررة)

</div>

---

## الفكرة

النص الجيد قد يضيع في شكله: فقرات متلاصقة، ومسافات مرتبكة، وأسطر لا تناسب المنصة التي ستنشر فيها. وأدوات الذكاء الاصطناعي المعتادة لا تكتفي بالشكل، بل تعيد كتابة النص بصوت غير صوتك.

**نَسَق • شَذْب** تطبيق واحد لنظام macOS يعالج شكل النص، لا مضمونه، ويضمّ برجين معزولين:

| البرج | عمله |
| --- | --- |
| **نَسَق** | يرتّب النص للقراءة والنشر: الفقرات، والمسافات، وكسر الأسطر، وإيقاع القراءة. |
| **شَذْب** | يهذّب الشذرة القصيرة بالحذف وحده: يقترح قصّات هي اقتباسات حرفية من نصّك، تقبل كلًّا منها أو ترفضها. |

> **العهد:** لا يكتب النص بدلًا عنك، ولا يغيّر صوتك، ولا يحاكم جودة ما كتبت. عمله الشكل وحده.

---

## طريقة العمل

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/readme/steps-ar-dark.png">
  <img alt="تلصق نصّك، ثم تختار البرج: نَسَق للتنسيق أو شَذْب للتهذيب بالحذف، ثم تنسخ النتيجة" src="assets/readme/steps-ar-light.png" width="100%">
</picture>

في شَذْب يشهد تحقّق آليّ أن كل قصّة مقترحة موجودة حرفيًّا في نصّك، وأن لا كلمة أُضيفت إليه.

---

## الميزات

**نَسَق:**

- **خمسة أنماط:** مقال، ومنشور، وشذرة، ورسالة، ومخطط.
- **مستويات تدخّل متدرّجة:** من «تنظيف فقط» على جهازك بلا شبكة، إلى تنسيق القراءة والإيقاع، وتجهيز النص للنشر.
- **تنسيق حسب المنصة:** مقال سابستاك ونوته، وإكس، وثريدز، وإنستغرام، وواتساب.
- **أدوات ضبط محلية على النتيجة:** سطور أقل أو أكثر، وكسر بعد النقطة، وحذف السطور الفارغة أو إضافتها.
- **تنويعات** على النتيجة، و**عدسة قراءة** بعرض شاشة الهاتف.

**شَذْب:**

- قصّات مقترحة **بالحذف وحده**، تقبلها أو ترفضها واحدة واحدة.
- **بطاقة قراءة** للشذرة، وإرسال النتيجة إلى نَسَق بضغطة.

**في البرجين:** مسودات محفوظة على جهازك، ومزوّد تختاره بمفتاحك، ونافذة بهيئة macOS الأصلية من اليمين إلى اليسار، ووضعان فاتح وداكن.

---

## التثبيت

1. نزّل ملف <span dir="ltr">`Nasaq_…_aarch64.dmg`</span> من [صفحة الإصدارات](https://github.com/iSltanX/Nasq/releases/latest).
2. افتحه واسحب **Nasaq** إلى مجلد **التطبيقات**.
3. من **الإعدادات ← المزوّد** اختر مزوّدك وأدخل مفتاحه، أو اختر Ollama على جهازك بلا مفتاح.

</div>

> [!IMPORTANT]
> **تنبيه Gatekeeper:** نَسَق موقَّع ذاتيًا لا بشهادة Apple Developer ID، لأنه مشروع شخصي، فيوقفه macOS عند أول فتح. حاول فتحه مرة، ثم افتح **إعدادات النظام ← الخصوصية والأمن** واضغط **افتح على أي حال**. تكفي مرة واحدة.

<div dir="rtl">

### المتطلبات

- جهاز Mac بمعالج **Apple Silicon**. الواجهة مصمَّمة على هيئة macOS 27.
- مفتاح من أحد المزوّدين: Gemini، أو OpenAI، أو Claude، أو Groq، أو OpenRouter. أو Ollama مثبّتًا على جهازك.
- مستوى «تنظيف فقط» وأدوات الضبط المحلية تعمل دون مزوّد ودون شبكة.

---

## الاستخدام

| الإجراء | الاختصار |
| --- | --- |
| نسّق، أو افحص الشذرة في شَذْب | <span dir="ltr"><kbd>⌘</kbd><kbd>↩</kbd></span> |
| نسخ النتيجة | <span dir="ltr"><kbd>⇧</kbd><kbd>⌘</kbd><kbd>C</kbd></span> |
| أرِني تنويعات | <span dir="ltr"><kbd>⇧</kbd><kbd>⌘</kbd><kbd>↩</kbd></span> |
| سطور أقل، أو أكثر | <span dir="ltr"><kbd>⌘</kbd><kbd>[</kbd></span> · <span dir="ltr"><kbd>⌘</kbd><kbd>]</kbd></span> |
| عدسة القراءة | <span dir="ltr"><kbd>⌥</kbd><kbd>⌘</kbd><kbd>R</kbd></span> |
| تصدير لسابستاك | <span dir="ltr"><kbd>⌥</kbd><kbd>⌘</kbd><kbd>C</kbd></span> |
| احذف القصّة، أو أبقِها (شَذْب) | <span dir="ltr"><kbd>⌘</kbd><kbd>⌫</kbd></span> · <span dir="ltr"><kbd>⌘</kbd><kbd>K</kbd></span> |
| أرسل إلى نَسَق (شَذْب) | <span dir="ltr"><kbd>⌥</kbd><kbd>⌘</kbd><kbd>N</kbd></span> |
| البرج: نَسَق، أو شَذْب | <span dir="ltr"><kbd>⌘</kbd><kbd>1</kbd></span> · <span dir="ltr"><kbd>⌘</kbd><kbd>2</kbd></span> |
| حفظ في المسودات · جلسة جديدة | <span dir="ltr"><kbd>⌘</kbd><kbd>S</kbd></span> · <span dir="ltr"><kbd>⌘</kbd><kbd>N</kbd></span> |
| الإعدادات | <span dir="ltr"><kbd>⌘</kbd><kbd>,</kbd></span> |

- لكل أمر مكانه في شريط القوائم بعناوين عربية، وقائمته الرابعة تتبدّل مع البرج.
- التحديثات من القائمة: **التحقق من وجود تحديثات…**، أو من تبويب **التحديثات** في الإعدادات.

---

## لقطات الشاشة

<div align="center">
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="assets/readme/nasaq-dark.png">
  <img alt="نَسَق: النص الأصلي يمينًا، ونتيجته يسارًا بعد التنظيف وكسر الأسطر" src="assets/readme/nasaq-light.png" width="100%">
</picture>
<sub>نَسَق: الأصل يمينًا، والنتيجة يسارًا مع أدوات الضبط.</sub>
</div>

<table>
  <tr>
    <td width="62%" align="center" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="assets/readme/shadhb-dark.png">
        <img alt="شَذْب: الشذرة يمينًا، ولوح الفحص يسارًا بضمانة ألّا تُضاف كلمة" src="assets/readme/shadhb-light.png" width="100%">
      </picture><br>
      <b>شَذْب</b><br>
      الشذرة، ولوح الفحص بالقصّات المقترحة.
    </td>
    <td width="38%" align="center" valign="top">
      <picture>
        <source media="(prefers-color-scheme: dark)" srcset="assets/readme/settings-dark.png">
        <img alt="الإعدادات: المزوّد، والمفتاح في سلسلة المفاتيح، والنموذج، ومظهر التطبيق" src="assets/readme/settings-light.png" width="100%">
      </picture><br>
      <b>الإعدادات</b><br>
      المزوّد والنموذج، والمفتاح في سلسلة المفاتيح.
    </td>
  </tr>
</table>

---

## الخصوصية

- **لا يغادر نصّك الجهاز إلا حين تطلب:** حين تضغط «نسّق» أو «افحص الشذرة»، يُرسَل النص إلى المزوّد الذي اخترته أنت، ولا يمرّ بأي خادم آخر.
- **ما يعمل محليًا بالكامل:** مستوى «تنظيف فقط»، وأدوات الضبط على النتيجة، والمسودات، والإعدادات. ومع Ollama يبقى كل شيء على جهازك.
- **المفتاح في سلسلة مفاتيح macOS،** لا في ملف.
- **لا حساب، ولا تحليلات، ولا تتبّع.** والاتصال الآخر الوحيد هو التحقق من التحديثات، ويمكن إيقافه.

---

## الأسئلة المتكررة

<details>
<summary><strong>هل يعيد كتابة نصّي؟</strong></summary><br>

لا. نَسَق يغيّر الشكل وحده: الفقرات والمسافات وكسر الأسطر. وشَذْب لا يضيف كلمة أبدًا، بل يقترح حذفًا من نصّك نفسه، ويتحقق آليًا من ذلك قبل أن يعرضه عليك.
</details>

<details>
<summary><strong>ما الفرق بين نَسَق وشَذْب؟</strong></summary><br>

نَسَق للنصوص التي تريد نشرها: يرتّبها للقراءة وللمنصة. وشَذْب للشذرة القصيرة التي تريد إحكامها: يقترح ما يمكن حذفه دون أن يقتل نبرتها. البرجان معزولان، ولكلٍّ منهما عقده وحدوده.
</details>

<details>
<summary><strong>هل يعمل بلا إنترنت؟</strong></summary><br>

جزئيًا: مستوى «تنظيف فقط» وأدوات الضبط المحلية تعمل بلا شبكة. وبقية المستويات تحتاج مزوّدًا، فإن أردته بلا إنترنت فاختر Ollama على جهازك.
</details>

<details>
<summary><strong>لماذا يسألني macOS عن سلسلة المفاتيح بعد التحديث؟</strong></summary><br>

لأن التطبيق موقَّع ذاتيًا، فيعدّ macOS كل تحديث تطبيقًا جديدًا يطلب الوصول إلى المفتاح المحفوظ. وافق مرة واحدة بعد كل تحديث.
</details>

<details>
<summary><strong>هل التحديثات آمنة؟</strong></summary><br>

كل تحديث موقَّع بمفتاح نَسَق، ويتحقق التطبيق من توقيعه قبل تثبيته، ولا يُنزَّل شيء قبل موافقتك.
</details>

<details>
<summary><strong>هل يعمل على معالجات Intel؟</strong></summary><br>

لا. الإصدارات مبنية لـ Apple Silicon فقط.
</details>

<details>
<summary><strong>كيف أزيله تمامًا؟</strong></summary><br>

1. احذف **Nasaq** من مجلد التطبيقات.
2. احذف مجلد الإعدادات والمسودات: <span dir="ltr">`~/Library/Application Support/com.nasaq.app/`</span>
3. من تطبيق **Keychain Access** احذف المفتاح المحفوظ باسم <span dir="ltr">`com.nasaq.app`</span>.
</details>

---

## للمطوّرين

<details>
<summary><b>البناء من المصدر</b></summary><br>

**المتطلبات:** Node.js، وRust، وأدوات سطر أوامر Xcode.

| الأمر | ما يفعله |
| --- | --- |
| <span dir="ltr">`npm install`</span> | يثبّت الاعتماديات |
| <span dir="ltr">`npm run tauri dev`</span> | تشغيل تطويري |
| <span dir="ltr">`npm test`</span> | اختبارات الواجهة والمنطق |
| <span dir="ltr">`cargo test --manifest-path src-tauri/Cargo.toml`</span> | اختبارات النواة |
| <span dir="ltr">`npm run tauri build -- --config '{"bundle":{"createUpdaterArtifacts":false}}'`</span> | يبني التطبيق وملف DMG دون أصول المُحدِّث الموقَّعة |

**عزل البرجين:** لا تُدمج برومبتات نَسَق وشَذْب ولا عقودهما ولا منطق مخرجاتهما، ولا استيراد بين <span dir="ltr">`nasaq/`</span> و<span dir="ltr">`shadhb/`</span>. المشترك الحقيقي وحده يعيش في <span dir="ltr">`shared/`</span>، ويحرس القاعدة <span dir="ltr">`tests/isolation.test.js`</span>.

مبني بـ Tauri 2 وRust، بواجهة HTML وCSS وJavaScript بلا أُطُر، وخطَّي Almarai وCairo محمّلين محليًا. رموز التصميم وأيقوناته مولَّدة من ملف التصميم بأدوات <span dir="ltr">`tools/`</span>. سجل الإصدارات في [CHANGELOG.md](CHANGELOG.md).
</details>

## الرخصة

جميع الحقوق محفوظة لسلطان. لا رخصة مفتوحة المصدر معلنة لهذا المستودع.

---

<div align="center">

<img src="src-tauri/icons/icon.png" alt="أيقونة نَسَق" width="96">

**تصميم وتطوير: سلطان** · Designed & developed by Sultan

الموقع: [bysltan.com](https://www.bysltan.com)

من الصانع نفسه<br>
تطبيقات macOS: [بدّل](https://github.com/iSltanX/Baddel) · [رفّ](https://github.com/iSltanX/Raff) · [Luma](https://github.com/iSltanX/Luma) · [نفّذ](https://github.com/iSltanX/naffith)<br>
إضافات المتصفح: [SnRead](https://github.com/iSltanX/SnRead) · [صَوْب](https://github.com/iSltanX/SAWB) · [جسور](https://github.com/iSltanX/Jusoor)

<sub>[سجل الإصدارات](CHANGELOG.md) · [الإصدارات](https://github.com/iSltanX/Nasq/releases)</sub>

</div>

</div>
