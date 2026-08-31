# تكامل Azure AD (Microsoft Entra ID) — جهة حكومية

النظام حالياً يعمل بتسجيل دخول محلي (إيميل + كلمة مرور) فقط، مع إيقاف التسجيل الذاتي
(`DISABLE_SIGNUP="true"`) وإخفاء رابط SSO (`DISABLE_SSO="true"`).
البنية جاهزة لتفعيل Azure لاحقاً بدون تعديل كود — فقط إعدادات.

## خطوات التفعيل مستقبلاً

1. **في Supabase (المستضاف داخلياً):** فعّل مزود SAML SSO أو OIDC
   من لوحة Auth → SSO، وأضف بيانات Tenant الخاص بالهيئة من Entra ID
   (Metadata URL أو Client ID/Secret).
2. **في Azure Portal:** أنشئ Enterprise Application جديدة، وعيّن
   Redirect/ACS URL إلى `https://<supabase-host>/auth/v1/sso/saml/acs`،
   وفعّل مزامنة الحقول: `email`, `given_name`, `family_name`, `groups`.
3. **في النظام:** غيّر `DISABLE_SSO` إلى `"false"` في ملف `.env` وأعد التشغيل.
   سيظهر رابط "تسجيل الدخول عبر حساب الهيئة (Microsoft)" في صفحة الدخول.
4. **رفع الموظفين تلقائياً:** عند أول تسجيل دخول عبر SSO، يُنشأ حساب
   الموظف تلقائياً (`createUserFromSSO` في `app/modules/user/service.server.ts`)
   ويُربط بمساحة العمل حسب مجموعات Azure (Groups → Roles mapping) من
   إعدادات SSO للمساحة داخل النظام.

## ملاحظات

- إبقاء الدخول المحلي يعمل بالتوازي مع SSO ممكن (حسابات الطوارئ/الإدارة).
- حسابات الاختبار المُنشأة عبر `scripts/seed-demo-users.ts` محلية ولا تتأثر بالتكامل.
