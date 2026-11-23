# دليل البدء السريع للمرحلة الثانية — Stage 2 Team Quickstart (`apps/erp-backend`)

اقرأ هذه الصفحة في دقيقتين قبل كتابة أي سطر كود. خطة المرحلة الثانية مجهّزة بالكامل بـ **Workflows** و**Blocking Gates** تمنع التعارضات وتُشغّل المهام عبر الـ AI Agent بشكل منظم.

---

## 1. خريطة الملفات (قبل ما تبدأ شغلك)

| الملف | الدور |
| :--- | :--- |
| [00-STAGE2-EXECUTION-MAP.md](./00-STAGE2-EXECUTION-MAP.md) | **اقرأه أولاً** — يوضح ترتيب الموجات (`Wave 0` → `Wave 4`)، مين بيستنى مين، وتوزيع الـ 19 route والـ 13 جدول. |
| [ahmed-hassan.md](./ahmed-hassan.md) | مهام البنية التحتية المشتركة، الـ Migration، الـ RLS، ومحرك المزامنة (`AH-01`..`AH-14`, `AH-FINAL`) |
| [el-hosseiny.md](./el-hosseiny.md) | مهام الـ FEFO، الـ POS Checkout الذري، والمرتجعات والاستردادات (`EH-01`..`EH-10`, `EH-FINAL`) |
| [yassin.md](./yassin.md) | مهام مسودات الطلبات واستعلامات الفواتير (`YA-01`..`YA-09`, `YA-FINAL`) |
| [ahmed-salah.md](./ahmed-salah.md) | مهام استعلامات المرتجعات، الـ Canonical Reads، واختبارات العقود (`AS-01`..`AS-09`, `AS-FINAL`) |

> **القاعدة الذهبية للترتيب:** `Ahmed Hassan` ينفّذ `AH-01`..`AH-07` ويدمجهم في `stage2-dev` أولاً لفتح الموجة الثانية لـ `El-Hosseiny` و`Yassin` و`Ahmed Salah` بالتوازي بدون أي تعارض.

---

## 2. تجهيز الجهاز والداتابيز لأول مرة (`Task *-01`)

> **تنبيه مهم:** سكربت التجهيز **لا يسطّب برنامج PostgreSQL نفسه**. تأكد أولاً من وجود:
> 1. **.NET 10 SDK**
> 2. **PostgreSQL 16+** متسطّب وشغال على `localhost:5432` مع إضافة مجلد `bin` للـ `PATH` (بحيث أمر `psql` يشتغل في الـ Terminal).

بعد التأكد، افتح PowerShell جوا `apps/erp-backend/` ونفّذ الخطوات دي **بنفسك مرة واحدة** (السكربت يطلب باسورد `postgres` تفاعلياً، وممنوع تكتب الباسورد في شات الـ AI):

```powershell
git fetch origin
git switch stage2-dev
git pull --ff-only origin stage2-dev
powershell -ExecutionPolicy Bypass -File .\setup-local-db.ps1
```

السكربت تلقائياً هينشئ `erp_db`، يجهّز `erp_migrator` و`erp_app`، يطبّق الـ Migrations والـ RLS، ويحفظ `user-secrets` و`ERP_IT_POSTGRES` للاختبارات. بعد ما يخلص، افتح الـ AI Agent واكتبله يتحقق من البناء والاختبارات (`724/724`).

---

## 3. قواعد GitHub والفروع (الالتزام بها إجباري)

- فرع **`main`** مجمّد على Stage 1 المستقرة (لخدمة الـ Frontend). **ممنوع تماماً** فتح أي PR من Stage 2 على `main`.
- كل الشغل يتفرّع من **`stage2-dev`** ويرجع إليه عبر **Pull Request → `stage2-dev`**.
- اسم فرع كل مهمة: `stage2/<dev>/<task-id>-<slug>` *(مثال: `stage2/yassin/ya-02-sales-order-and-invoice-dtos`)*.
- **دورك قبل كل مهمة:**
  ```powershell
  git fetch origin
  git switch stage2-dev
  git pull --ff-only origin stage2-dev
  git switch -c stage2/<dev>/<task-id>-<slug>
  ```
- **دورك بعد انتهاء الـ Agent:** راجع الشرح بالعربي و`git diff`، وبعدين انت اللي تعمل `git push` وتفتح PR على `stage2-dev` (الـ Agent ممنوع عليه الـ `push` لأسباب أمان).

---

## 4. كيف يعمل الـ AI Workflow تلقائياً؟

تم تجهيز `.agent/workflows/execute-stage-task.md` و`.agent/workflows/stage-final-audit.md` مع كل القواعد والـ Skills (`00-backend-guardrails.md`, `pharmacy-stage1-baseline`, `pharmacy-backend-engineering`). عندما تطلب من الـ Agent تنفيذ أي مهمة، يقوم أوتوماتيكياً بـ **6 مراحل**:

1. **Hard Prerequisite Gate:** يفحص الكود المحلي للتأكد أن مهام زملائك المطلوبة لهذه المهمة مدمجة وموجودة فعلياً؛ **وإذا نقص أي شرط يتوقف ويرفض التنفيذ** ويخبرك بالعربي ما هو الـ PR المطلوب سحبه من `stage2-dev` أولاً.
2. **Implementation Plan:** يقرأ ملفات Stage 1 المشابهة ويصمم خطة التنفيذ قبل التعديل.
3. **Clean Implementation:** يكتب الكود في ملفاتك المخصصة فقط (دون لمس `Program.cs` أو `PharmacyDbContext.cs` أو ملفات زملائك).
4. **Tests & Boot Check:** يكتب Unit + Integration Tests، يشغّل `dotnet build` (`0 Warnings`) و`dotnet test` (`100% Pass`)، ويتأكد من إقلاع الـ API.
5. **Self-Review:** يراجع الأمان (RLS، الصلاحيات، الـ Idempotency) والأداء (`.AsNoTracking()`, `FOR UPDATE`).
6. **Arabic Debrief:** يشرح لك بالعربي ماذا بنى، ولماذا، وما هي الخطوة التالية.

---

## 5. برومتات جاهزة للنسخ (افتح Chat جديد لكل مهمة!)

> **نصيحة مهمة:** افتح **محادثة جديدة (New Chat)** لكل مهمة عشان الـ Context يفضل نضيف ودقيق.

### أ) برومت التحقق بعد `setup-local-db.ps1` (المهمة `*-01`)
```text
/execute-stage-task نفذ المهمة <TASK-ID> من ملف docs/stage2-tasks/<your-file>.md وتأكد إن dotnet build و dotnet test شغالين 100% واشرحلي إعدادات الداتابيز والـ RLS بالعربي.
```
*(مثال: `EH-01` من `docs/stage2-tasks/el-hosseiny.md`)*

### ب) برومت تنفيذ أي مهمة تطوير (من `*-02` إلى ما قبل الأخيرة)
```text
/execute-stage-task نفذ المهمة <TASK-ID> من ملف docs/stage2-tasks/<your-file>.md
```
*(أمثلة: `AH-02` من `ahmed-hassan.md` · `YA-03` من `yassin.md` · `AS-05` من `ahmed-salah.md`)*

### ج) برومت المراجعة النهائية (المهمة الأخيرة `*-FINAL`)
```text
/stage-final-audit نفذ المهمة <TASK-ID> من ملف docs/stage2-tasks/<your-file>.md وأنشئ تقرير المراجعة النهائي في docs/stage2-reports/
```
*(مثال: `EH-FINAL` من `el-hosseiny.md`)*

---

## 6. ملخص سريع لقواعد ممنوع كسرها
- **قبل ما تبدأ أي مهمة:** راجع [00-STAGE2-EXECUTION-MAP.md](./00-STAGE2-EXECUTION-MAP.md) لتعرف هل دورك في الـ Wave بدأ فعلاً وهل المتطلبات اتدمجت في `stage2-dev`.
- **لا تعدّل أبداً:** `Program.cs`، `PharmacyDbContext.cs`، ملفات `DependencyInjection.cs` الجذرية، أو ملفات `src/` الخاصة بزميل آخر — لكل مطور ملف Modular DI وملف Partial Controller خاص به.
- **لا تحذف أو تدمج على `main`:** الدمج النهائي من `stage2-dev` إلى `main` يتم مرة واحدة فقط في نهاية Wave 4 بعد نجاح جميع بوابات المراجعة.
