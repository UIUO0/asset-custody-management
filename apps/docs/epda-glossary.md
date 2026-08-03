# معجم مصطلحات نظام إدارة الأصول

المرجع الموحّد لترجمة واجهة النظام. **كل نص جديد يلتزم بهذا المعجم** — لا تجتهد
بترجمة بديلة لمصطلح موجود هنا، حتى لو بدت أدق في سياق معيّن؛ الاتساق أهم.

المصطلحات الأساسية معتمدة من مالك المشروع (يوليو ٢٠٢٦).

---

## المصطلحات الجوهرية (معتمدة)

| English         | العربية     | ملاحظة                         |
| --------------- | ----------- | ------------------------------ |
| Asset           | أصل         | الوحدة الأساسية في النظام      |
| Assets          | الأصول      |                                |
| Custody         | عهدة        | **معتمد** — لا تُستخدم «حيازة» |
| Custodian       | العهدة لدى  | في الجداول والبطاقات           |
| Assign custody  | إسناد عهدة  |                                |
| Release custody | فكّ العهدة  |                                |
| In custody      | في العهدة   | حالة الأصل                     |
| Booking         | حجز         |                                |
| Check out       | تسليم       | **معتمد** — لا تُستخدم «إخراج» |
| Check in        | استلام      |                                |
| Checked out     | مُسلَّم     | حالة الأصل                     |
| Kit             | مجموعة      | **معتمد** — لا تُستخدم «طقم»   |
| Audit           | جرد         | **معتمد** — لا تُستخدم «تدقيق» |
| Location        | موقع        |                                |
| Category        | تصنيف       |                                |
| Tag             | وسم         |                                |
| Workspace       | مساحة العمل |                                |
| Team member     | عضو الفريق  |                                |
| Custom field    | حقل مخصص    |                                |
| Asset model     | طراز الأصل  |                                |
| Reminder        | تذكير       |                                |
| Barcode         | باركود      | يُبقى كما هو                   |

### مصطلحات سير عمل الهيئة (مضافة)

| English                | العربية         | ملاحظة                             |
| ---------------------- | --------------- | ---------------------------------- |
| Intake stage           | مرحلة الاستلام  | حقل `Asset.lifecycleStage`         |
| Pending                | قيد الانتظار    | لم تعتمده المستودعات بعد           |
| Ready for distribution | جاهز للتوزيع    | معتمَد وظاهر للموظفين              |
| Approve and release    | اعتماد وإتاحة   | نقل الأصل إلى «جاهز للتوزيع»       |
| Send back for review   | إرجاع للمراجعة  | سحب أصل من التداول — السبب إلزامي  |
| Request                | طلب             | حجز رفعه موظف ولم يُبتَّ فيه       |
| Requests queue         | الطلبات         | صفحة `/requests`                   |
| Accept / Reject        | قبول / رفض      | قرار المستودعات — سبب الرفض إلزامي |
| Hold for review        | تعليق للمراجعة  | تجميد يملكه المخزون وحده           |
| Release hold           | فك التعليق      |                                    |
| My custody             | الأصول في عهدتي | صفحة `/my-custody`                 |
| Available assets       | الأصول المتاحة  | صفحة `/available-assets`           |
| Assigned directly      | مُسنَد مباشرةً  | عهدة غير موروثة من مجموعة          |
| Due back               | موعد الإرجاع    |                                    |

**أقسام القائمة الجانبية:** خدماتي (My space) · المخزون (Inventory) ·
العمليات (Operations) · المنظمة (Organization)
| QR code | رمز QR | |

---

## حالات الأصل والحجز

| English     | العربية   |
| ----------- | --------- |
| Available   | متاح      |
| Unavailable | غير متاح  |
| In custody  | في العهدة |
| Checked out | مُسلَّم   |
| Draft       | مسودة     |
| Reserved    | محجوز     |
| Ongoing     | جارٍ      |
| Complete    | مكتمل     |
| Cancelled   | ملغي      |
| Archived    | مؤرشف     |
| Overdue     | متأخر     |
| Booked      | محجوز     |
| Returned    | مُعاد     |
| Lost        | مفقود     |
| Damaged     | تالف      |
| Consumed    | مُستهلَك  |
| Remaining   | المتبقي   |
| Found       | موجود     |
| Missing     | مفقود     |

---

## أفعال وأزرار

| English         | العربية              |
| --------------- | -------------------- |
| Save            | حفظ                  |
| Cancel          | إلغاء                |
| Confirm         | تأكيد                |
| Close           | إغلاق                |
| Delete          | حذف                  |
| Edit            | تعديل                |
| Remove          | إزالة                |
| Create          | إنشاء                |
| Add             | إضافة                |
| Add more        | إضافة المزيد         |
| Add another     | إضافة آخر            |
| Update          | تحديث                |
| Apply           | تطبيق                |
| Done            | تم                   |
| Archive         | أرشفة                |
| Duplicate       | نسخ                  |
| Export          | تصدير                |
| Import          | استيراد              |
| Download        | تنزيل                |
| Upload          | رفع                  |
| Click to upload | اضغط للرفع           |
| Print           | طباعة                |
| Scan            | مسح                  |
| Preview         | معاينة               |
| Select all      | تحديد الكل           |
| Clear selection | إلغاء التحديد        |
| Clear all       | مسح الكل             |
| View all        | عرض الكل             |
| Learn more      | اعرف المزيد          |
| Back to home    | العودة للرئيسية      |
| Back to login   | العودة لتسجيل الدخول |
| Actions         | إجراءات              |

---

## الجداول والقوائم

| English                | العربية           |
| ---------------------- | ----------------- |
| Name                   | الاسم             |
| Description            | الوصف             |
| Description (optional) | الوصف (اختياري)   |
| Note (optional)        | ملاحظة (اختياري)  |
| Notes                  | الملاحظات         |
| No notes               | لا توجد ملاحظات   |
| Status                 | الحالة            |
| Type                   | النوع             |
| Role                   | الدور             |
| Value                  | القيمة            |
| Total value            | القيمة الإجمالية  |
| Quantity               | الكمية            |
| Amount                 | المبلغ            |
| Message                | الرسالة           |
| Reason                 | السبب             |
| Address                | العنوان           |
| Created                | تاريخ الإنشاء     |
| Created by             | أنشأه             |
| Start date             | تاريخ البدء       |
| End date               | تاريخ الانتهاء    |
| Due date               | تاريخ الاستحقاق   |
| From                   | من                |
| To                     | إلى               |
| Sorted by              | مرتّب حسب         |
| Sort by                | الترتيب حسب       |
| Ascending              | تصاعدي            |
| Descending             | تنازلي            |
| Page                   | صفحة              |
| of                     | من                |
| items per page         | عنصر في الصفحة    |
| Go to previous page    | الصفحة السابقة    |
| Go to next page        | الصفحة التالية    |
| Scroll to top          | العودة للأعلى     |
| Select an option       | اختر خياراً       |
| No options found       | لا توجد خيارات    |
| No results found       | لا توجد نتائج     |
| No columns found       | لا توجد أعمدة     |
| Search column...       | بحث في الأعمدة... |

---

## التصفية والبحث

| English              | العربية              |
| -------------------- | -------------------- |
| Search               | بحث                  |
| Filter               | تصفية                |
| Filter by status     | تصفية حسب الحالة     |
| Filter by category   | تصفية حسب التصنيف    |
| Filter by tag        | تصفية حسب الوسم      |
| Filter by location   | تصفية حسب الموقع     |
| Filter by custodian  | تصفية حسب العهدة     |
| Search categories    | بحث في التصنيفات     |
| Search team members  | بحث في أعضاء الفريق  |
| Search bookings      | بحث في الحجوزات      |
| Find team members    | ابحث عن أعضاء الفريق |
| Select a team member | اختر عضو فريق        |
| Clear all filters    | مسح كل الفلاتر       |
| Save filter          | حفظ الفلتر           |
| Uncategorized        | غير مصنّف            |
| Without tag          | بدون وسم             |
| Without location     | بدون موقع            |
| Without custody      | بدون عهدة            |

---

## رسائل وحالات فارغة

| English                                     | العربية                                               |
| ------------------------------------------- | ----------------------------------------------------- |
| No assets yet                               | لا توجد أصول بعد                                      |
| No bookings yet                             | لا توجد حجوزات بعد                                    |
| Error                                       | خطأ                                                   |
| Something went wrong                        | حدث خطأ ما                                            |
| Insufficient permissions                    | صلاحيات غير كافية                                     |
| Only administrators can be added            | يمكن إضافة المسؤولين فقط                              |
| Action disabled                             | الإجراء معطّل                                         |
| Confirmation                                | تأكيد                                                 |
| Accepts PNG, JPG, JPEG, or WebP (max. N MB) | يقبل PNG أو JPG أو JPEG أو WebP (بحد أقصى N ميجابايت) |

---

## قواعد الصياغة

- **صيغة الأمر للأزرار**: «حفظ» لا «احفظ»، «إضافة» لا «أضف».
- **التعريف في رؤوس الجداول**: «الاسم» و«الحالة» بأل التعريف؛ الأزرار بدونها.
- **الأرقام**: تُترك بالأرقام العربية الشرقية (1234) كما يعرضها المتصفح — لا تُحوَّل يدوياً.
- **المصطلحات التقنية** (QR، CSV، PDF، SSO، API): تبقى لاتينية.
- **لا تُترجم** أسماء الحالات في قاعدة البيانات (`AVAILABLE`, `IN_CUSTODY`) — الترجمة في طبقة العرض فقط عبر `t()`.
- **النصوص المركّبة**: استخدم متغيّرات i18next (`{{count}}`) بدل تقطيع الجملة، لأن ترتيب الكلمات يختلف في العربية.

---

## استثناءات مقصودة

| السطح                           | السبب                                                                    |
| ------------------------------- | ------------------------------------------------------------------------ |
| قوالب PDF (`*-pdf.tsx`)         | مولّد PDF يحتاج خطاً عربياً مضمّناً قبل الترجمة، وإلا ظهرت الحروف مربعات |
| قوالب البريد (`app/emails/`)    | تحتاج خطوطاً وخصائص اتجاه خاصة بعملاء البريد                             |
| لوحة الأدمن (`admin-dashboard`) | تُستخدم من فريق التشغيل التقني فقط                                       |
| محرّر النصوص (`editor-v2`)      | مكوّن طرف ثالث                                                           |
