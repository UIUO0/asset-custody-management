# مهمة: إكمال إزالة الحجوزات وبناء نموذج الإدارات

> برومبت تسليم لجلسة جديدة. اقرأه كاملاً قبل أي تعديل.
> اقرأ أيضاً `CLAUDE.md` في الجذر — فيه القواعد الحاكمة للمستودع.

---

## ١. القرار التنظيمي (معتمد من مالك المشروع)

هيئة تطوير المنطقة الشرقية **لا تستخدم الحجوزات الزمنية إطلاقاً**. النظام
يعتمد **التسليم والاستلام بالعهدة فقط**. النموذج الجديد:

```
المستودعات ──[دفعة واحدة برقم أمر الشراء]──▶ إدارة المرافق / إدارة IT
                                                    │
                                                    ▼
                                       تسلّم الموظف مباشرة (بلا طلب منه)
                                                    │
                                                    ▼
                                         الموظف يوقّع (إلزامي)
```

**قرارات محسومة — لا تُعِد فتحها:**

| السؤال            | القرار                                                                                                                  |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| حسابات الموظفين   | **تبقى** — للتوقيع والاطلاع على عهدهم. لا تُحذف                                                                         |
| المرافق و IT      | **دور تشغيلي واحد مشترك** (مثل `DEPARTMENT`) + تمييز الإدارة **بالبيانات لا بالصلاحيات**، حتى تُضاف إدارة ثالثة بلا كود |
| «رقم الأمر»       | **رقم أمر الشراء القائم** المشتق من نماذج الاستلام (`/purchase-orders`). بلا جدول جديد ولا ترقيم جديد                   |
| طلب الموظف        | **لا يوجد** — الإدارة تبادر بالتسليم                                                                                    |
| «الأصناف المتاحة» | تُحذف من صفحات الموظف العادي                                                                                            |

**لماذا بقيت حسابات الموظفين:** التوقيع اليوم يتطلب جلسة (`/handovers/$id` تحت
`_layout+` وتستدعي `getSession()`). وحذف الحسابات كان سيفرض التوقيع على جهاز
موظف الإدارة، وهذا **يكسر قاعدة أمنية موثّقة في CLAUDE.md**: «لا يوقّع شخص
واحد نصفَي محضر» — يحرسها اختباران في `handover.test.ts`. لا تكسرها.

---

## ٢. حالة الشجرة الآن — ⚠️ لا تُبنى

**١٥ خطأ ترجمة في ٩ ملفات.** القائمة الكاملة في `BOOKING-REMOVAL-TODO.txt`
بالجذر. خادم التطوير يرفع شاشة خطأ حمراء.

```bash
cd apps/webapp && npx tsc -b --pretty false   # يعيد الأخطاء الـ١٥
```

### أُنجز (لا تُعِده)

- حُذف **١٩٢ ملفاً**: مسارات الحجز (٣٥ ويب + ٢٤ API جوال)، الوحدات الأربع
  (`booking`, `booking-note`, `booking-settings`, `booking-model-request`)،
  `components/booking`، التقويم، أدراج المسح الجزئي، الاختبارات المرتبطة.
- `_layout.tsx` — أُزيل `countPendingBookingRequests` و `bookingSettings` و
  `canUseBookings` و `pendingRequestCount`.
- `use-sidebar-nav-items.tsx` — أُزيلت عناصر الحجوزات والتقويم والطلبات
  وإعدادات الحجز.
- `home.tsx` — أُزيلت لوحات الحجوزات الثلاث واستعلاماتها.
- `reports/registry.ts` — أُزيلت ٦ تقارير حجوزات.
- `csv.server.ts` — أُزيل تصدير الحجوزات كاملاً. **اختباراته الـ١٥ تمر.**
- `assets-list.tsx` — أُزيل عرض تقويم الإتاحة.
- `bulk-actions-dropdown`, `override-dialog`, `emails/types.ts`,
  `emails/components/footers.tsx`.

### ⚠️ مكوّنات أُنقذت عمداً — لا تحذفها

كانت في مجلدات الحجز لكنها **ليست منه**:

| المكوّن                                     | موقعه الجديد                                       | مستهلكوه                                                                                                                                |
| ------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `status-filter`                             | `components/shared/status-filter.tsx`              | الجرد، الفريق، المجموعات، المواقع، ملاحظات الأصناف                                                                                      |
| `AvailabilityBadge`                         | `components/shared/availability-badge.tsx`         | أدراج العهدة والمواقع والمجموعات، درج الجرد                                                                                             |
| `ExtendedAssetStatus` / `ExtendedKitStatus` | `utils/asset-status.ts`                            | شارات حالة الصنف والمجموعة                                                                                                              |
| `BookingStatusComponent`                    | `components/markdown/booking-status-component.tsx` | **أُبقي عمداً** كعارض نصّي: ملاحظات الأصناف التاريخية ما زالت تحوي وسم `{% booking_status %}`، ووسم Markdoc بلا عارض يكسر الملاحظة كلها |

---

## ٣. المطلوب — بالترتيب

### المرحلة ١ (عاجلة): إصلاح البناء

أصلح الأخطاء الـ١٥ في هذه الملفات:

**سهلة:**

- `components/assets/assets-index/advanced-asset-columns.tsx` — استيراد
  `EventCardContent` من التقويم المحذوف + عمود `upcomingBookings`
- `components/layout/command-palette/command-palette.tsx` — `canUseBookings`
  لم يعد في حمولة اللودر + قسم بحث الحجوزات
- `routes/api+/mobile+/dashboard.ts` — إحصاءات الحجوزات

**متوسطة:**

- `routes/_layout+/assets.$assetId.tsx` — `booking-actions-dropdown` +
  `booking/service.server`
- `routes/_layout+/assets.$assetId.overview.tsx` — `booking/service.server`
- `routes/_layout+/kits.$kitId.tsx` — `booking-actions-dropdown`
- `routes/_layout+/kits._index.tsx` — عرض تقويم الإتاحة (نفس نمط
  `assets-list.tsx` الذي أُنجز)

**ثقيلة — اقرأ التحذير في القسم ٤ أولاً:**

- `modules/reports/helpers.server.ts` (٣٩٠٠ سطر) — ٦ دوال تقارير حجوزات
  (`bookingComplianceReport`, `overdueItemsReport`, `topBookedAssetsReport`,
  `topBookedKitsReport`, `monthlyBookingTrendsReport`,
  `assetUtilizationReport`) + مساعداتها الخاصة. **سجلّ التقارير أُزيل منه
  هذه التقارير أصلاً، فالدوال صارت بلا مستدعٍ** عدا مساري التصدير و PDF —
  نظّفهما معها.
- `modules/asset/quantity-breakdown.server.ts` — تجميع كميات الحجوزات

**ثم:** أزل `booking` و `bookingNote` من `PermissionEntity` و
`Role2PermissionMap` (`utils/permissions/permission.data.ts`)، وأزل مفاتيح
`nav.bookings` / `nav.requests` / `nav.calendar` من `ar.json` و `en.json`.

### المرحلة ٢: تطبيق الجوال

احذف تبويب `bookings` من `apps/companion/app/(tabs)/bookings/` (٦ شاشات)
وعنصره في التنقل وأي استدعاءات API للحجز.

### المرحلة ٣: ترحيل قاعدة البيانات

`packages/database/prisma/schema.prisma` — أسقط:
`Booking`, `BookingAsset`, `BookingNote`, `BookingSettings`,
`BookingModelRequest`, `PartialBookingCheckin`, `PartialBookingCheckout`,
وتعدادَي `BookingStatus` و `BookingApprovalState`.

انتبه:

- `ConsumptionLog.bookingId` و `bookingAssetId` — مفاتيح أجنبية اختيارية، أسقطها
- أصناف عالقة على `AssetStatus.CHECKED_OUT` — صفّرها إلى `AVAILABLE` في الترحيل،
  وإلا بقيت مجمّدة بلا حجز يحرّرها
- **لا تحذف قيمة `CHECKED_OUT` من `AssetStatus`** بلا مراجعة: التعداد يُفحص
  `switch` فحصاً شاملاً في عشرات المواضع (قاعدة في CLAUDE.md)

### المرحلة ٤: دور `DEPARTMENT`

- أضف الدور إلى `OrganizationRoles` + ترحيل
- سجّله في `Role2PermissionMap` **و** في `utils/permissions/role-scope.ts`
  (الاثنان مطلوبان — سؤالان مختلفان: الصلاحية والنطاق)
- امنحه `asset.custody` (ليسلّم الموظفين)
- تمييز الإدارة **بيانات لا صلاحيات**

### المرحلة ٥: التسليم الجماعي للإدارة برقم أمر الشراء

المستودع يختار أمر شراء (`/purchase-orders`، مشتقّ من نماذج الاستلام —
`orderNumberOf` هو المكان الوحيد الذي يقرّر أي حقل هو رقم الأمر) ويسلّم أصنافه
كلها لإدارة دفعةً واحدة. الإدارة ترى ما سُلّم لها فقط.

### المرحلة ٦: تسليم الإدارة للموظف

- استخدم `openHandover` القائم في `modules/custody/handover.server.ts` —
  البنية جاهزة (محاضر `EPDA-HO-…`، تواقيع، حالات)
- احذف «الأصناف المتاحة» من قائمة الموظف وصفحاته
- الموظف يبقى له: «محاضر بانتظار توقيعي» و «الأصناف في عهدتي»

---

## ٤. ⚠️ تحذير تقني — فشل ثلاث مرات

**لا تستخدم سكربتات تطابق الأقواس (`brace matching`) لحذف الدوال من هذه
الملفات.** جُرّبت وفشلت ثلاث مرات:

- أفسدت `reports/helpers.server.ts` — الأخطاء ارتفعت ٢٧ ← ٥١، واستُعيد الملف من `HEAD`
- تركت تعليق JSDoc مبتوراً في `csv.server.ts` (خطأ `TS1010`)
- تركت قوساً شارداً في `assets-list.tsx` (خطأ `TS1381`)

**السبب:** الملفات تخلط الحجز بغيره بعمق، وفيها دوال متداخلة وسهمية،
والاستدلال على حدود الدالة بـ`}` في العمود صفر غير موثوق.

**الطريقة التي نجحت:** اقرأ حدود كل دالة بـ`sed -n` وتحقّق منها بالعين، ثم
احذف بأرقام أسطر مؤكَّدة من الأعلى إلى الأسفل. هكذا أُنجز `csv.server.ts`.

وبعد كل حذف في ملف كبير:

```bash
npx prettier --check <file>          # يكشف التعليقات المبتورة والأقواس الشاردة
npx tsc -b --pretty false | wc -l    # يجب أن ينقص لا يزيد
```

**إن ارتفع العدد، تراجع فوراً** (`git checkout -- <file>`) بدل المضي.

---

## ٥. قواعد المستودع الملزمة

- **لا `git add` ولا `git commit` إطلاقاً** — إلا بطلب صريح من المستخدم.
  و`git rm` يُدرج في الفهرس أيضاً؛ استخدم `rm` المجرّد.
- **وكيل آخر يعمل على نفس الشجرة الآن.** `CLAUDE.md` سجلّ مشترك: عدّله بـ`Edit`
  الجراحي فقط، **لا `Write`**، وأعد قراءة المحيط قبل كل تعديل.
- الشجرة فيها **~٦٥٠ ملفاً معدّلاً من إعادة تنسيق Prettier سابقة** لا علاقة لها
  بهذا العمل، مختلطة بتعديلات غير مُلتزمة أخرى. لا تفترض أن كل تغيير لك.
- **حدِّث `CLAUDE.md`** بما تنجزه، في القسم الذي يخصّه.

---

## ٦. التحقق قبل التسليم

```bash
cd apps/webapp && npx tsc -b --pretty false   # صفر أخطاء
pnpm webapp:validate                          # أنواع + lint + اختبارات
pnpm webapp:build                             # بناء إنتاج
pnpm turbo typecheck                          # الحزم الثلاث
```

قبل الحذف: كانت الحالة **٢٦٢ ملف اختبار · ٣٥٨٤ اختباراً · صفر فشل · صفر أخطاء
lint**. ستنقص الأعداد بحذف اختبارات الحجز — المهم صفر فشل.

⚠️ **٧ تحذيرات lint موجودة مسبقاً وليست منك** (استيرادات غير مستعملة في ملفات
يعمل عليها الوكيل الآخر: `import-content.tsx`, `receipts.$receiptId.tsx`,
`assets._index.tsx`, `handover.server.ts`, `classification.ts`). أحدها —
`line` غير المستعمل في `classification.ts` — **مقصود**: `classifyReceiptLine`
معطّلة عمداً حتى تصل قواعد أصل/مادة. لا «تصلحها».

---

## ٧. خيار التراجع

كل شيء غير مُلتزَم. للتراجع الكامل عن إزالة الحجوزات:

```bash
git checkout -- apps/webapp && git clean -fd apps/webapp
```

⚠️ **يمسح أيضاً** إصلاحات سابقة غير مُلتزمة (مصفوفة الصلاحيات، التعريب، صفحة
الهبوط، ربط الاعتماد بالحجز) **وعمل الوكيل الآخر**. تأكّد قبل تشغيله.
