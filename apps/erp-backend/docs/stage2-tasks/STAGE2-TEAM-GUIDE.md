# دليل البدء السريع للمرحلة الثانية — Stage 2 Team Quickstart (`apps/erp-backend`)

اقرأ هذه الصفحة في دقيقتين قبل كتابة أي سطر كود. خطة المرحلة الثانية مجهّزة بالكامل بـ **Workflows** و**Blocking Gates** تمنع التعارضات وتُشغّل المهام عبر الـ AI Agent بشكل منظم مع الحفاظ على توافق كامل مع عقود Stage 1 المعتمدة (`767/767` اختبار، `48` Endpoint حية، و`76` OpenAPI Schema).

---

## 1. خريطة الملفات (قبل ما تبدأ شغلك)

| الملف | الدور |
| :--- | :--- |
| [00-STAGE2-EXECUTION-MAP.md](./00-STAGE2-EXECUTION-MAP.md) | **اقرأه أولاً** — يوضح ترتيب الموجات (`Wave 0` → `Wave 4`)، مين بيستنى مين، وتوزيع الـ 19 Stage 2 route (ليصل الإجمالي إلى `66` endpoint حية) والـ `31` جدول RLS وقواعد الـ Wire Contract. |
| [01-STAGE2-PLAN-AUDIT-DIFF.md](./01-STAGE2-PLAN-AUDIT-DIFF.md) | قائمة المراجعة والتصحيحات التفصيلية لكل ملف مطور مقابل الكود الحي لـ Stage 1. |
| [ahmed-hassan.md](./ahmed-hassan.md) | مهام البنية التحتية المشتركة، الـ Migration، الـ `31` جدول RLS، الصلاحيات والـ Scopes، ومحرك المزامنة (`AH-01`..`AH-14`, `AH-FINAL`) |
| [el-hosseiny.md](./el-hosseiny.md) | مهام الـ FEFO، الـ POS Checkout الذري، والمرتجعات والاستردادات (`EH-01`..`EH-10`, `EH-FINAL`) |
| [yassin.md](./yassin.md) | مهام مسودات الطلبات واستعلامات الفواتير (`YA-01`..`YA-09`, `YA-FINAL`) |
| [ahmed-salah.md](./ahmed-salah.md) | مهام استعلامات المرتجعات، الـ Canonical Reads + توحيد Stage 1 Canonical (`API-DIFF-011`, `API-DIFF-012`, `DTO-DIFF-034`)، اختبارات العقود، وتصدير `/contracts/` (`AS-01`..`AS-09`, `AS-FINAL`) |

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

السكربت تلقائياً هينشئ `erp_db`، يجهّز `erp_migrator` و`erp_app`، يطبّق الـ Migrations والـ RLS، ويحفظ `user-secrets` و`ERP_IT_POSTGRES` للاختبارات. بعد ما يخلص، افتح الـ AI Agent واكتبله يتحقق من البناء والاختبارات (**`767/767`**: `590` Unit + `177` Integration، `0 Warnings`).

---

## 3. قواعد GitHub والفروع (الالتزام بها إجباري)

- فرع **`main`** مجمّد على Stage 1 المستقرة (`767/767`, `48` endpoints) لخدمة الـ Frontend. **ممنوع تماماً** فتح أي PR من Stage 2 على `main`.
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

## 4. قواعد الـ Wire Contract والـ `ContractsArtifactSyncTests` على `stage2-dev` (إجباري في كل PR!)

الـ Stage 1 APIs مقفولة بالكامل بـ `ContractsArtifactSyncTests` التي تفحص تلقائياً تطابق Swagger الحي مع `apps/erp-backend/contracts/openapi.v1.json` و`contracts/schemas/*.json` أثناء كل `dotnet test`. لذلك يجب الالتزام الصارم بالقواعد التالية في **كل كود Stage 2**:

1. **Strict `snake_case` في كل مكان:**
   - الـ Serializer العالمي (`DependencyInjection.ApiJsonSerializerOptions`) يطبّق `JsonNamingPolicy.SnakeCaseLower` + `JsonStringEnumConverter(namingPolicy: null, allowIntegerValues: false)`.
   - كل `[FromQuery]` في أي Controller يجب أن يحمل `[FromQuery(Name = "snake_case")]` مثل `branch_id`، `page_size`، `from_date`، `to_date`، `invoice_no`، `payment_status`، `invoice_id`، `since_cursor`.
   - كل `ApiErrorDetailDto.Field` في الـ Validators والـ Services يجب أن يكون بصيغة `snake_case` المطابقة للـ JSON wire (مثل `cash_tendered_amount`، `lines[0].entered_qty`، `lines[0].invoice_line_id`، `lines[0].quantity_base`، `idempotency_key`، `page_size`).
   - الأرقام العشرية (`decimal`) تُرسل كـ **Native JSON Numbers** (ليست strings)، والـ Enums كـ **Strings فقط** (الأرقام الصحيحة مرفوضة بـ `422`).
2. **`Idempotency-Key` و`201 Created`:**
   - كل Request DTO لعملية تعديل أعمال (`CreateSalesOrderRequest`, `ReplaceSalesOrderLinesRequest`, `CancelSalesOrderRequest`, `CompleteSalesOrderRequest`, `CreateSalesReturnRequest`) يجب أن يعرّف `string? IdempotencyKey = null` كـ **معامل اختياري أخير** مع `[AllowHeaderIdempotencyKey]` على الـ Action.
   - الـ HTTP Header `Idempotency-Key` له الأولوية على الـ body؛ وإذا كان كلاهما فارغاً يرجع **`400 MALFORMED_REQUEST`** عبر `ApiResultMapper.ToMissingIdempotencyKeyResult(...)`؛ وإذا زاد الطول عن `100` يرجع **`422 VALIDATION_ERROR`**؛ وإذا اختلف الـ payload hash يرجع **`409 IDEMPOTENCY_MISMATCH`**.
   - عمليات إنشاء الموارد (`POST /api/v1/sales-orders` و`POST /api/v1/sales-returns`) ترجع **`201 Created`** مع `Location` Header عبر `ApiResultMapper.ToCreatedResult(...)`.
3. **Pagination موحّد:**
   - كل قوائم الـ ERP القياسية (`GET /api/v1/sales-orders`, `/sales-invoices`, `/sales-returns`) تستخدم `page = 1`, `page_size = 25` وحدود `page >= 1` و`1 <= page_size <= 200` (أي قيمة خارج النطاق ترجع **`422 VALIDATION_ERROR`**).
   - كل قوائم الـ Canonical الخمس (`/products`, `/inventory`, `/sales`, `/orders`, `/returns`) تتوحّد على `string? cursor` قائم على `OUTBOX_EVENT.event_sequence` و`PagedResult<T>`.
4. **`[ProducesResponseType]` وتحديث `contracts/` التدريجي في نفس الـ PR:**
   - كل Controller Action يجب أن يحمل Attributes كاملة لـ `[ProducesResponseType]` (للاستجابة الناجحة + جميع أخطاء `ApiErrorEnvelopeDto`) وإلا ستفشل `ContractsArtifactSyncTests`.
   - أي PR يضيف `ErrorCode` (`AH-01`) أو يضيف/يعدّل Endpoints/DTOs/Capabilities (`YA-08`, `EH-08`, `AS-04`, `AS-07`, `AH-12`) **يجب في نفس الـ PR** أن يحدّث:
     1. `tests/PharmacyERP.IntegrationTests/Api/ContractsArtifactSyncTests.cs` (`ExpectedLiveEndpoints` + enums/capabilities)
     2. `apps/erp-backend/contracts/schemas/*.json` (عند تعديل `ErrorCode` أو `CanonicalCapabilities`)
     3. إعادة توليد `apps/erp-backend/contracts/openapi.v1.json`:
        ```powershell
        $env:UPDATE_OPENAPI_SNAPSHOT="true"
        dotnet test tests/PharmacyERP.IntegrationTests/PharmacyERP.IntegrationTests.csproj --filter ContractsArtifactSyncTests
        Remove-Item Env:UPDATE_OPENAPI_SNAPSHOT
        ```
     4. تحديث `apps/erp-backend/contracts/README.md`.
   - في Wave 3/4 (`AS-08` و`AH-FINAL`) يتم تصدير ومزامنة `openapi.v1.json` وملفات الـ JSON Schemas النهائية لـ Stage 2 (`66` endpoint) إلى كلٍّ من `apps/erp-backend/contracts/` ومجلد الجذر المشترك `contracts/` (المسموح به في `00-backend-guardrails.md` §1.1).

---

## 5. كيف يعمل الـ AI Multi-Agent Workflow تلقائياً؟

تم ترقية النظام بالكامل إلى **Modern Antigravity Skills** مع **حماية برمجية حتمية (`.agent/hooks.json`)** و**فصل حقيقي بين 3 Agents مستقلين** داخل `.agent/skills/execute-stage-task/SKILL.md` و`.agent/skills/review-stage-task/SKILL.md` و`.agent/skills/stage-final-audit/SKILL.md` (مع القواعد `.agent/rules/00-backend-guardrails.md` و`.agent/rules/audit-guidelines.md` وملفات الـ Audit والـ References بنظام Progressive Disclosure):

- **حماية برمجية تلقائية (`hooks.json`):** تمنع تلقائياً تعديل `Program.cs` أو `PharmacyDbContext.cs` أو `ERP-Backend-Blueprint-v1.1.md` أو أي ملف برة `apps/erp-backend/` و`contracts/`، وتمنع أوامر `git push` / `reset --hard` / `DROP DATABASE` حتى في وضع الـ Auto-Approve.
- **مراحل `/execute-stage-task` (3 Agents منفصلين + سكربتات تحقق حتمية):**
  0. **Preflight Script (`check-preflight.ps1`):** يفحص الفرع الحالي (يمنع الشغل على `main` وينبّه لو على `stage2-dev`)، يتحقق من نظافة Wave 0، ويستخرج **قسم المهمة المطلوبة فقط** بدون تحميل ملف الـ 130KB بالكامل.
  1. **Agent 1 — Gatekeeper & Planner (Read-Only Subagent):** يفحص الكود المحلي للتأكد من وجود كل الـ Prerequisites؛ **وإذا نقص أي شرط يتوقف فوراً ويرفض التنفيذ** ويخبرك بالعربي ما هو الـ PR المطلوب سحبه أولاً. إذا نجح الشرط، يبني خطة تنفيذية مكتوبة ويصنّف درجة الخطورة:
     - **مهام عادية (DTOs / Validators / Enums / Queries / Tests):** يكمل أوتوماتيك للـ Implementer.
     - **مهام حساسة (Migrations / RLS / Triggers / Auth / Middleware / Sync / Endpoints جديدة):** يتوقف ويعرض الخطة للمطور لأخذ موافقته قبل كتابة أي كود.
  2. **Agent 2 — Clean-Context Implementer (Write Subagent):** يستلم الخطة والمهمة فقط في Context نظيف، يكتب الكود والاختبارات ويحدّث `contracts/openapi.v1.json` و`ContractsArtifactSyncTests` عند الحاجة، ويشغّل **Tier 1 Fast Verification** (`verify-task.ps1 -FastFilter`).
  3. **Agent 3 — Independent Adversarial Reviewer & Verifier (Fresh Context Subagent):** مراجع مستقل تماماً **لم يَرَ تفكير الـ Implementer**؛ يراجع `git diff -- .` مقابل المواصفة والخطة وقوائم الـ Security/Concurrency/Architecture وجودة الاختبارات، ويشغّل **Tier 2 Full Verification** (`verify-task.ps1 -Full -CheckMigrations -BootCheck`) مع ضمان إغلاق عملية الـ API في `try/finally`. لو لقى أي عيب `P0`/`P1` يرجّعه للـ Implementer في **Fix Loop بحد أقصى محاولتين**.
  4. **Arabic Debrief & PR Handoff:** يشرح لك بالعربي ماذا بُني ولماذا، ويعطيك إثبات التحقق المستقل + رسالة Commit وملخص PR جاهز للنسخ على `stage2-dev` + المهمة التالية.

---

## 6. برومتات جاهزة للنسخ (افتح Chat جديد لكل مهمة!)

> **نصيحة مهمة:** افتح **محادثة جديدة (New Chat)** لكل مهمة عشان الـ Context يفضل نضيف ودقيق.

### أ) برومت التحقق بعد `setup-local-db.ps1` (المهمة `*-01`)
```text
/execute-stage-task نفذ المهمة <TASK-ID> من ملف docs/stage2-tasks/<your-file>.md وتأكد إن dotnet build و dotnet test شغالين 100% (767/767) واشرحلي إعدادات الداتابيز والـ RLS بالعربي.
```
*(مثال: `EH-01` من `docs/stage2-tasks/el-hosseiny.md`)*

### ب) برومت تنفيذ أي مهمة تطوير (من `*-02` إلى ما قبل الأخيرة)
```text
/execute-stage-task نفذ المهمة <TASK-ID> من ملف docs/stage2-tasks/<your-file>.md
```
*(أمثلة: `AH-02` من `ahmed-hassan.md` · `YA-03` من `yassin.md` · `AS-05` من `ahmed-salah.md`)*

### ج) برومت المراجعة المستقلة لأي فرع أو PR قبل الدمج (Read-Only)
```text
/review-stage-task راجع التعديلات الحالية على الفرع مقابل المهمة <TASK-ID> من ملف docs/stage2-tasks/<your-file>.md وشغّل verify-task.ps1 بالكامل وأعطني قرار الدمج بالعربي.
```

### د) برومت المراجعة النهائية متعددة الـ Auditors (المهمة الأخيرة `*-FINAL`)
```text
/stage-final-audit نفذ المهمة <TASK-ID> من ملف docs/stage2-tasks/<your-file>.md وأنشئ تقرير المراجعة النهائي في docs/stage2-reports/
```
*(مثال: `EH-FINAL` من `el-hosseiny.md`)*

---

## 7. ملخص سريع لقواعد ممنوع كسرها
- **قبل ما تبدأ أي مهمة:** راجع [00-STAGE2-EXECUTION-MAP.md](./00-STAGE2-EXECUTION-MAP.md) لتعرف هل دورك في الـ Wave بدأ فعلاً وهل المتطلبات اتدمجت في `stage2-dev`.
- **لا تعدّل أبداً:** `Program.cs`، `PharmacyDbContext.cs`، ملفات `DependencyInjection.cs` الجذرية (بعد `AH-06`)، أو ملفات `src/` الخاصة بزميل آخر — لكل مطور ملف Modular DI وملف Partial Controller خاص به.
- **لا تكسر `ContractsArtifactSyncTests`:** أي إضافة لـ `ErrorCode` أو Endpoint أو DTO أو تغيير في `/canonical/capabilities` يجب أن تُحدَّث معه `contracts/openapi.v1.json` و`ContractsArtifactSyncTests` و`contracts/README.md` في نفس الـ PR.
- **لا تحذف أو تدمج على `main`:** الدمج النهائي من `stage2-dev` إلى `main` يتم مرة واحدة فقط في نهاية Wave 4 بعد نجاح جميع بوابات المراجعة ومزامنة مجلد `contracts/` الجذري.
