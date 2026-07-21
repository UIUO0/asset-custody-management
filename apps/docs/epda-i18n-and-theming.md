# التعريب والمظهر (i18n / RTL / الوضع الداكن)

نظام هيئة تطوير المنطقة الشرقية يدعم العربية والإنجليزية مع تبديل فوري،
واتجاه تخطيط (RTL/LTR) يتبع اللغة تلقائياً، ووضعاً فاتحاً/داكناً/حسب النظام.

## البنية

| الملف                                            | الغرض                                              |
| ------------------------------------------------ | -------------------------------------------------- |
| `app/i18n/config.ts`                             | اللغات المدعومة، الاتجاه لكل لغة، إعدادات i18next   |
| `app/i18n/i18n.server.ts`                        | كشف اللغة من الكوكي/المتصفح + إنشاء نسخة لكل طلب    |
| `app/i18n/locales/ar.json` و `en.json`           | ملفات الترجمة                                       |
| `app/utils/theme.ts`                             | تفضيل المظهر + سكربت منع الوميض                     |
| `app/hooks/use-direction.ts`                     | اتجاه النص للمكوّنات التي تحتاج جهة فيزيائية         |
| `app/components/layout/appearance-switcher.tsx`  | مبدّلات اللغة والمظهر                               |
| `app/routes/api+/preferences.tsx`                | نقطة حفظ التفضيلات (كوكي)                           |

## إضافة نص مترجم

```tsx
import { useTranslation } from "react-i18next";

function MyComponent() {
  const { t } = useTranslation();
  return <h2>{t("assets.title")}</h2>;
}
```

أضف المفتاح في **كلا** الملفين `ar.json` و `en.json`.

داخل `loader` أو `action` (لا يعمل فيها `useTranslation`):

```ts
const i18n = await createI18nInstance(getLocale(request));
const title = i18n.t("auth.loginTitle");
```

## قواعد الاتجاه (RTL)

التخطيط ينعكس تلقائياً لأن المشروع يستخدم **الخصائص المنطقية** بدل الفيزيائية:

| ❌ لا تستخدم        | ✅ استخدم            |
| ------------------- | -------------------- |
| `ml-4` / `mr-4`     | `ms-4` / `me-4`      |
| `pl-2` / `pr-2`     | `ps-2` / `pe-2`      |
| `text-left/right`   | `text-start/end`     |

**استثناء:** قوالب الإيميل و PDF تبقى بالخصائص الفيزيائية — عملاء البريد
ومولّد PDF لا يدعمون الخصائص المنطقية.

للمكوّنات التي تفرض جهة فيزيائية (مثل `side` في Radix) استخدم:

```tsx
import { useInlineEndSide } from "~/hooks/use-direction";

const side = useInlineEndSide(); // "left" بالعربي، "right" بالإنجليزي
<DropdownMenuContent side={side} />;
```

## الوضع الداكن

المظهر مبني على **متغيرات CSS** معرّفة في `app/styles/global.css`، ويستهلكها
`tailwind.config.ts`. لذلك كتلة `.dark` تعيد تلوين النظام **كاملاً** دون
الحاجة لإضافة `dark:` على كل مكوّن — لأن الكود يستخدم تدرّج الرمادي بشكل
دلالي (أرقام صغيرة للأسطح، كبيرة للنصوص)، فقلب التدرّج ينتج ثيماً داكناً
متماسكاً تلقائياً.

**قاعدة مهمة:** `bg-white` ينقلب (سطح)، أما النص/الأيقونة فوق خلفية ملوّنة
فيجب أن تستخدم `text-static-white` — وهو رمز ثابت لا ينقلب.

```tsx
// ❌ سيصبح داكناً على خلفية زرقاء في الوضع الداكن
<button className="bg-primary-600 text-white">حفظ</button>

// ✅ يبقى أبيض دائماً
<button className="bg-primary-600 text-static-white">حفظ</button>
```

## إضافة لغة جديدة

1. أضف رمزها في `SUPPORTED_LOCALES` و `LOCALE_DIRECTION` و `LOCALE_LABEL`.
2. أنشئ `app/i18n/locales/<code>.json`.
3. سجّلها في `resources` داخل `config.ts`.

لا حاجة لأي تعديل آخر — المبدّل والاتجاه يشتقّان منها تلقائياً.
