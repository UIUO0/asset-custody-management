# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ More than one agent works in this repo at once

Assume another agent is editing the same tree right now, and that this file is
the shared log both of you write to. Practical consequences:

- **Never `Write` this file — only `Edit` it**, and re-read the surrounding
  lines immediately before each edit. A whole-file write silently discards
  whatever the other agent just recorded.
- **Keep entries additive and surgical.** Append to a list or a section rather
  than restructuring it. If a rule looks wrong, correct that rule in place; do
  not rewrite the section around it.
- **Re-read before you conclude.** Files change mid-task, `HEAD` can move under
  you (a `git pull` landed mid-session on 2026-08-05), and a "file modified on
  disk" notice is normal here, not a sign of corruption. Re-run the check rather
  than trusting an earlier reading.
- **Never stage or commit** (see [Git and Version control](#git-and-version-control)).
  It is not just policy here — staging while another agent works mixes their
  half-finished work into your change. `git rm` stages too; use plain `rm`.
- **Record what you changed here, in the section it belongs to**, so the next
  agent inherits the reasoning rather than rediscovering it.
- **Never delete an entry whose reason you cannot see** — it almost certainly
  documents a trap somebody already paid for. If it looks wrong, check the code
  first; if it really is stale, correct it and say why.
- **The code outranks this file.** Where the two disagree, the code is the
  truth: fix the entry, never rewrite working code to match a stale note.
- After a `git pull`, check `git status` for `UU` files before building on top
  of them — an unresolved merge left mid-tree will surface as a baffling
  compile error three steps later.

## Essential Commands

This is a **pnpm + Turborepo monorepo**. Use `pnpm` instead of `npm`.

Root-level convenience scripts follow the `<app>:<task>` pattern (e.g., `webapp:dev`, `docs:build`). When adding new apps that require dev servers or build steps, add matching `<app>:<task>` shortcuts to the root `package.json`.

### Webapp

- `pnpm webapp:dev` - Start webapp dev server on port 3000
- `pnpm webapp:build` - Build webapp for production
- `pnpm webapp:test -- --run` - Run Vitest unit tests (always use `--run` flag)
- `pnpm webapp:validate` - Run all tests, linting, and typecheck (use before commits)
- `pnpm webapp:start` - Start webapp production server locally (loads `.env` from monorepo root)

**IMPORTANT:** When running tests manually, ALWAYS use the `--run` flag to run tests once and exit. Without `--run`, Vitest runs in watch mode which consumes excessive memory. Never run multiple test processes in parallel as this can freeze the system.

### Docs

- `pnpm docs:dev` - Start docs dev server on port 5173
- `pnpm docs:build` - Build docs for production
- `pnpm docs:preview` - Preview docs production build on port 5174

### Code Quality

- `pnpm webapp:lint` - ESLint checking (webapp only)
- `pnpm turbo lint` - ESLint checking (all packages)
- `pnpm --filter @shelf/webapp lint:fix` - Fix ESLint issues automatically
- `pnpm turbo typecheck` - TypeScript type checking (all packages)
- `pnpm run format` - Prettier code formatting (root-level)
- `pnpm --filter @shelf/webapp validate` - Complete pre-commit validation
- `pnpm webapp:doctor` - Run [react-doctor](https://www.react.doctor/) against the webapp (React health diagnostics: hook misuse, perf, a11y, architecture). Not part of `validate` or the pre-commit hook. It **does** run in CI: the `🩺 React Doctor` GitHub Action scans changed files on every PR, posts a sticky comment, and fails the check on newly-introduced errors (warnings stay advisory).

### Security Review Agent (pre-commit)

A Claude-powered security reviewer runs automatically on `git commit` against security-sensitive diffs (routes, `*.server.ts`, prisma, Supabase wiring, server middleware, new dependencies). It catches the regressions hit most often — cross-org IDORs, missing `requirePermission` gates, open redirects, missing Zod validation, audit-trail gaps — before code reaches review.

- Interactive subagent: `.claude/agents/shelf-security-reviewer.md` (full toolset — for manual `claude --agent shelf-security-reviewer ...` use with permission prompts).
- Headless subagent: `.claude/agents/shelf-security-reviewer-headless.md` (`Skill`-only — what the pre-commit hook invokes; safe under `bypassPermissions` because there's no Bash/network channel to exfiltrate through).
- Pre-commit wrapper: `scripts/security-review-staged.sh`
- Wired into `lefthook.yml` at priority 5 (after typecheck)

Advisory by default — findings print, the commit proceeds. Opt in to blocking with `SHELF_SEC_REVIEW_BLOCK=1`; skip with `SHELF_SEC_REVIEW=0`. Manual use: `claude --agent shelf-security-reviewer "review PR #N"`.

📖 Full documentation: [apps/docs/security-review-agent.md](./apps/docs/security-review-agent.md).

### Database

All database commands run via the `@shelf/database` package (`packages/database/`). This package owns the Prisma schema, migrations, and client generation. The webapp does **not** manage database concerns directly — it consumes `@shelf/database` as a workspace dependency.

- `pnpm db:generate` - Generate Prisma client after schema changes
- `pnpm db:prepare-migration` - Create new database migration
- `pnpm db:deploy-migration` - Apply migrations and regenerate client
- `pnpm db:reset` - Reset database (destructive!)
- `pnpm webapp:setup` - Generate Prisma client + deploy migrations (for initial setup/onboarding)

### Build & Production

- `pnpm turbo build` - Build all packages and apps for **production**
- `pnpm webapp:start` - Start production server locally (loads `.env` from monorepo root)
- `pnpm run start` (inside `apps/webapp/`) - Used by Docker/Fly (env vars from platform)

## Monorepo Structure

This is a **pnpm workspaces + Turborepo** monorepo. All packages are defined in `pnpm-workspace.yaml` and orchestrated by `turbo.json`.

### Apps

| Package         | Path           | Description                                                                                                           |
| --------------- | -------------- | --------------------------------------------------------------------------------------------------------------------- |
| `@shelf/webapp` | `apps/webapp/` | Remix web application — the main product. Contains routes, components, modules (business logic), and integrations.    |
| `@shelf/docs`   | `apps/docs/`   | Developer documentation site (VitePress). Contains guides on local development, database triggers, architecture, etc. |

### Packages

| Package           | Path                 | Description                                                                                                                                                                                                                                                                                                                 |
| ----------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@shelf/database` | `packages/database/` | **Owns all database concerns**: Prisma schema (`prisma/schema.prisma`), migrations (`prisma/migrations/`), and the `createDatabaseClient()` factory (`src/client.ts`). All `db:*` root scripts delegate to this package. The webapp imports from this package — it does **not** run Prisma commands directly in production. |

### Tooling

| Package                    | Path                  | Description                                                           |
| -------------------------- | --------------------- | --------------------------------------------------------------------- |
| `@shelf/typescript-config` | `tooling/typescript/` | Shared `tsconfig` base configurations extended by all other packages. |

### How packages connect

- **Webapp → Database**: The webapp depends on `@shelf/database` (workspace dependency). Its `app/database/db.server.ts` is a thin wrapper that calls `createDatabaseClient()` from `@shelf/database`. All 135+ `~/database/db.server` imports in the webapp work unchanged.
- **Webapp → Prisma types**: The webapp's `build`, `typecheck`, and `validate` scripts run `prisma generate` to ensure types are available. In CI, this is done via `pnpm --filter @shelf/database run db:generate`.
- **Vite config**: The webapp's `vite.config.ts` includes `ssr.noExternal: ["@shelf/database"]` so Vite bundles it correctly, and aliases `.prisma/client/index-browser` for browser builds.

## Architecture Overview

**Shelf.nu** is an asset management platform built with Remix, React, TypeScript, and PostgreSQL.

### Core Technologies

- **Remix** - Full-stack React framework with file-based routing
- **Prisma** - Database ORM with PostgreSQL
- **Supabase** - Authentication, storage, and database hosting
- **Tailwind CSS + Radix UI** - Styling and UI components
- **Jotai** - Atomic state management

### Key Directory Structure

```
shelf/
├── turbo.json                       # Turborepo pipeline config
├── pnpm-workspace.yaml              # Workspace package definitions
├── packages/
│   └── database/                    # @shelf/database — Prisma client + types
│       ├── prisma/schema.prisma
│       ├── prisma/migrations/
│       └── src/client.ts            # createDatabaseClient() factory
├── apps/
│   └── webapp/                      # @shelf/webapp — Remix app
│       ├── app/
│       │   ├── routes/              # File-based routes (remix-flat-routes)
│       │   ├── modules/             # Business logic services
│       │   ├── components/          # Reusable React components
│       │   ├── database/db.server.ts # Thin re-export from @shelf/database
│       │   ├── atoms/               # Jotai state atoms
│       │   ├── utils/               # Utility functions
│       │   └── integrations/        # Third-party service integrations
│       └── server/                  # Hono server entry + middleware
└── tooling/
    └── typescript/                  # Shared tsconfig bases
```

### Route Organization

- `_layout+/` - Main authenticated application routes
- `_auth+/` - Authentication and login routes
- `_welcome+/` - User onboarding flow
- `api+/` - API endpoints
- `qr+/` - QR code handling for assets

## Development Patterns

### State Management

- **Server State**: Remix loaders/actions for data fetching and mutations
- **Client State**: Jotai atoms for complex UI state
- **URL State**: Search params for filters, pagination, and bookmarks
- **Optimistic UI & nProgress**: When implementing optimistic UI with fetchers, add the fetcher key to the `excludeFetchers` array in `apps/webapp/app/hooks/use-nprogress.ts` so the global loading bar does not show for operations that already provide instant visual feedback.

### Data Layer

- **Prisma Schema**: Located in `packages/database/prisma/schema.prisma` (owned by `@shelf/database`)
- **Client Generation**: Always run via `@shelf/database` (`pnpm db:generate`), never from the webapp directly
- **DB Client**: `@shelf/database` exports `createDatabaseClient()` factory; the webapp's `app/database/db.server.ts` is a thin wrapper
- **Row Level Security (RLS)**: Implemented via Supabase policies
- **Full-text Search**: PostgreSQL search across assets and bookings

### Component Architecture

- **Modular Services**: Business logic separated into `apps/webapp/app/modules/`
- **Reusable Components**: Organized by feature/domain in `apps/webapp/app/components/`
- **Form Handling**: Remix Form with client-side validation
- **UI Primitives**: Radix UI components with Tailwind styling
- **Date Display**: Always use the `DateS` component (`apps/webapp/app/components/shared/date.tsx`) for displaying dates in the UI. Do not use raw `toLocaleDateString()` or other custom date formatting.

### Email Templates

All HTML emails must follow the design established in
`app/emails/stripe/audit-trial-welcome.tsx`:

- **React Email components**: `Html`, `Head`, `Container`, `Text`, `Button`, `Link`
- **LogoForEmail** at the top of every email
- **Shared styles** from `app/emails/styles.ts` (`styles.p`, `styles.h2`, `styles.button`, `styles.li`)
- **Personalized greeting** with user's first name: `Hey {firstName},`
- **CTA buttons** using `styles.button` (not bare links)
- **Info/warning boxes**: yellow background `#FFF8E1` + border `#FFE082` for important notices
- **Both HTML and plain text exports**: HTML via `render()`, plain text as template literal
- **Send wrapper function** with `try/catch` + `Logger.error` + `ShelfError`
- **Closing**: `The Shelf Team`

### Button Type Prop (Required)

Every `<Button>` that renders as a native `<button>` element **must** have an explicit `type` prop. This is enforced by the `local-rules/require-button-type` ESLint rule.

- Use `type="submit"` for buttons that submit a form
- Use `type="button"` for all other buttons (modals, toggles, actions, etc.)
- Buttons with `to=` (link buttons) or `as="a"`/`as="span"` do not need `type`

```typescript
// ❌ Bad - missing type
<Button onClick={handler}>Cancel</Button>

// ✅ Good
<Button type="button" onClick={handler}>Cancel</Button>
<Button type="submit" disabled={disabled}>Save</Button>
<Button to="/home">Home</Button>  // Link button, no type needed
```

**Why:** The HTML spec defaults `<button>` to `type="submit"`, which can cause accidental form submissions. Explicit types prevent this and make intent clear.

### Disabled State for Form Submissions

Always use the `useDisabled` hook from `~/hooks/use-disabled` to disable buttons during form submission. Do **not** use `useNavigation` directly to check `navigation.state`.

```typescript
import { useDisabled } from "~/hooks/use-disabled";

// Inside component:
const disabled = useDisabled();
// For fetcher forms, pass the fetcher:
const disabled = useDisabled(fetcher);

<Button type="submit" disabled={disabled}>
  {disabled ? "Saving..." : "Save"}
</Button>
```

### Deprecated Components

- **DropdownMenu** (`apps/webapp/app/components/shared/dropdown.tsx`): Do not use for new features. Instead, use `Popover` from `@radix-ui/react-popover` with custom select behavior. See `apps/webapp/app/components/assets/assets-index/advanced-filters/field-selector.tsx` for a good example implementation.

### Silencing react-doctor findings

`react-doctor` runs in CI on every PR (`pnpm webapp:doctor`): warnings are
advisory, but **newly-introduced errors fail the PR check**, so keep it clean.

**Important:** `react-doctor` does **not** respect `// eslint-disable-next-line` comments. The only way to silence a finding is to refactor the code so the pattern no longer matches. Standard ESLint disable comments still work for `pnpm webapp:lint` — they just don't help with `pnpm webapp:doctor`.

**Refactor strategies for common findings:**

- **`react/no-danger` for static CSS injection** — use React's native `<style>{cssString}</style>` form (safe text child). See `apps/webapp/app/components/shared/mobile-dropdown-styles.tsx` for the reusable mobile-dropdown helper.
- **`jsx-a11y/no-autofocus`** — remove the `autoFocus` prop, then focus imperatively with `ref.current?.focus()` inside a `useEffect` when intentional modal/form focus is needed. This satisfies the rule and keeps the UX.
- **`react/no-danger` for scripts (e.g., `<script>` injecting `window.env`)** — if no refactor is possible, the finding will remain. Leave a short `// why:` comment above the call site so maintainers understand why it's there, and treat it as an accepted residual.

**When you must leave a finding in place** (e.g., SSR script injection, third-party API that only returns HTML), add a `// why:` comment above the code even though the finding will still appear in scans. The comment is for humans reviewing the diff later, not for the tool.

```tsx
// why: <explanation>
// react-doctor flags this but refactoring would regress <X>
<script ... />
```

### Form Validation Pattern (Required)

**IMPORTANT:** All forms MUST display server-side validation errors as a fallback. Client-side validation can fail or be bypassed, so server-side errors must always be shown to users.

**Why This Matters:**

- Client-side validation can be bypassed (disabled JS, modified requests)
- Zod schemas may behave differently on client vs server (e.g., date comparisons)
- Users must always see meaningful error messages, never generic "Something went wrong"

**Implementation Steps:**

1. **Import required utilities:**

```typescript
import { useActionData } from "react-router";
import { getValidationErrors } from "~/utils/http";
import type { DataOrErrorResponse } from "~/utils/http.server";
```

2. **Get validation errors from action data:**

```typescript
// Inside your component
const actionData = useActionData<DataOrErrorResponse>();

/** This handles server side errors in case client side validation fails */
const validationErrors = getValidationErrors<typeof yourZodSchema>(
  actionData?.error,
);
```

3. **Display server errors as fallback in each input:**

```typescript
<Input
  name={zo.fields.fieldName()}
  error={
    validationErrors?.fieldName?.message || zo.errors.fieldName()?.message
  }
  // ... other props
/>
```

**Complete Example:**

```typescript
// Schema definition
export const myFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email"),
  date: z.coerce.date().min(new Date(), "Date must be in the future"),
});

// Component
export default function MyForm() {
  const zo = useZorm("MyForm", myFormSchema);

  const actionData = useActionData<DataOrErrorResponse>();
  const validationErrors = getValidationErrors<typeof myFormSchema>(
    actionData?.error
  );

  return (
    <Form method="POST">
      <Input
        name={zo.fields.name()}
        error={validationErrors?.name?.message || zo.errors.name()?.message}
        label="Name"
      />
      <Input
        name={zo.fields.email()}
        error={validationErrors?.email?.message || zo.errors.email()?.message}
        label="Email"
      />
      <Input
        type="datetime-local"
        name={zo.fields.date()}
        error={validationErrors?.date?.message || zo.errors.date()?.message}
        label="Date"
      />
      <Button type="submit">Submit</Button>
    </Form>
  );
}
```

**Working Examples:**

- Reminder dialog: `apps/webapp/app/components/asset-reminder/set-or-edit-reminder-dialog.tsx`
- Booking form: `apps/webapp/app/components/booking/forms/edit-booking-form.tsx`

### Accessibility

All UI implementations must meet **WCAG 2.1 AA** as a minimum. This includes:

- Sufficient color contrast ratios (4.5:1 for normal text, 3:1 for large text)
- All interactive elements must be keyboard accessible
- Form inputs must have associated labels
- Use `aria-describedby` to link inputs to helper/error text
- Meaningful alt text for images and icons
- Focus indicators must be visible

### Code Documentation (Required)

All code must include inline documentation and JSDoc comments. This applies to every new file and every new export.

**File-level documentation:**

- Every file must start with a JSDoc block explaining its purpose, responsibilities, and how it fits into the broader system
- Include `@see` references to related files (routes, services, components) where helpful

**Function/component-level documentation:**

- Every exported function, component, and type must have a JSDoc comment
- Describe what it does, its parameters (`@param`), return values (`@returns`), and thrown errors (`@throws`)
- For React components, document the props

**Inline comments:**

- Add inline comments to explain non-obvious logic, business rules, or important distinctions
- Especially important: when a variable name could be confused (e.g., `userId` referring to different users in different contexts), add a clarifying comment
- Explain "why" rather than "what" — the code shows what, comments explain why

**Example:**

```typescript
/**
 * User Note Service
 *
 * Handles CRUD operations for admin notes on user profiles.
 * Notes are workspace-scoped: a note in Workspace A is invisible in Workspace B.
 *
 * @see {@link file://./../../routes/_layout+/settings.team.users.$userId.note.tsx}
 */

/** Arguments for creating a user note */
type CreateUserNoteArgs = { ... };

/**
 * Creates a new note on a user's profile within a specific workspace.
 *
 * @param args - The note content, target user, organization, and optional author
 * @returns The created UserNote record
 * @throws {ShelfError} If the database operation fails
 */
export async function createUserNote(args: CreateUserNoteArgs) { ... }
```

### Code Abstraction

- When you notice duplicated code patterns across multiple files or functions,
  abstract them into reusable helper functions
- Before implementing new functionality, check if similar logic already exists
  that can be extracted and reused
- Keep helper functions focused on a single responsibility
- Place shared helpers near the code that uses them, or in a shared utils file
  if used across multiple modules

### Deleting dead code — verify before you trust the tool

`react-doctor` runs `knip`, which reported **413 unused files**; only 43 were
actually dead. Never delete from that list directly. Its false positives here:

- **`.react-router/types/**`\*\* — generated, and the largest share by far.
- **`eslint-local-rules/`** — loaded by the ESLint config, not by imports.
- **Route files** — resolved by file-based routing, never imported.
- **Disabled, not dead.** `app/utils/theme.ts` has no importers because the
  dark-mode _toggle_ was removed — but the `.dark` block, `darkMode: "class"`
  and 19 files of `text-static-white` are all still in place. Deleting it would
  have destroyed the remaining half of a feature that is one wire from working.

Before deleting, grep the whole monorepo for the module by name (not just the
app), and confirm with `pnpm turbo typecheck`, the full test run **and**
`pnpm webapp:build` — a route-only or dynamic import will not surface in
typecheck alone.

#### التنظيف المنفَّذ في ٢٠٢٦‑٠٨‑١٠ — و**ما بقي عمداً**

حُذف ٢٣ ملفاً ميتاً بعد إزالة نظام الحجز، فنزلت قائمة knip من ٣٤ إلى ١١:

- **جزيرة ساعات العمل** (١١ ملفاً): `components/working-hours/*`،
  `hooks/use-working-hours.ts`، `modules/working-hours/{constants,zod-utils}.ts`،
  و`forms/time-select.tsx` و`shared/time-display.tsx` — لم يكن يستوردها إلا
  بعضها بعضاً. ⚠️ **`modules/working-hours/service.server.ts` حيّ** ويستعمله
  `admin-dashboard+/org.$organizationId` و `/api/:org/working-hours`.
- **جزيرة التقويم** (٤): `components/calendar/*`، `utils/calendar.ts`،
  `use-calendar-now-indicator-fix.ts`.
- **مفردات** (٦): `consumption-type-badge`، `import-button`، `layout/divider`،
  `shared/info-box`، `shared/returned-badge`، `scanner/drawer/uses/pending-items-list`.
- **باقي** (٢): `modules/reports/index.ts` (barrel بلا مستهلك)،
  `test/helpers/remix-responses.ts`.

ومعها **٥٣ مفتاح ترجمة يتيماً** (`workingHours.*` و `calendar.*` من الملفين)،
و**استعلام `getWorkingHoursForOrganization` من لودر `_layout`** — كان يعمل في
كل طلب مصادَق ويُرسل `workingHours` في الحمولة ولا يقرؤه أحد على العميل.

**الأحد عشر الباقية كلها إبقاء متعمَّد** — لا تحذفها: `eslint-local-rules/*`
(٨، يحمّلها إعداد ESLint)، و`app/utils/theme.ts` (انظر أعلاه)،
و`server/dev/server.ts` (محمّل بناء خادم التطوير)، و`test/mocks/database.ts`
(بلا مستورد لكنه الموضع الموثَّق لمحاكيات القاعدة في قسم الاختبارات).

⚠️ **مزلقان وقعتُ فيهما وأنت ستقع:**

- **`test/helpers/assertions.ts` ليس ميتاً** — يستورده
  `app/utils/http.server.test.ts` بمسار نسبي (`../../test/helpers/...`) ولم
  تُدرجه أداة الفحص. أمسكه `tsc` وحده.
- **البحث بالاسم يكذب.** `components/layout/divider.tsx` يبدو أن له ٩ مستوردين،
  وكلهم يستوردون `shared/textual-divider.tsx` — ملفاً آخر. طابق **مسار
  الاستيراد كاملاً** لا اسم الملف.

**الطريقة التي أثبتت الأمان:** احذف الدفعة كاملةً، شغّل
`tsc` + كل الاختبارات + `vite build` + `eslint`، ثم `git checkout --` للاسترجاع
إن ظهر شيء. أرخص من التحقّق ملفاً ملفاً وأوثق منه.

**الدفعة الثانية في اليوم نفسه** (لا تكشفها knip لأنها كود **مستعمَل** لا
يتيم): أنظمة التتبّع الأربعة ومتغيّراتها وحزمها — تفصيلها في المزلقين
[٧](#مزالق-هندسية-مكلّفة--اقرأها-قبل-أن-تكرّرها) و ٨ — ومعها `utils/ics.ts`
(تقويم الحجز) و `QueueNames.bookingQueue` من pg-boss. المجموع في الشجرة:
**٢٩ ملفاً · ~٤٦٠٠ سطر · ١٦ حزمة**، والحالة بعدها **صفر أخطاء أنواع · صفر
تحذيرات lint · ١٨١ ملف اختبار / ٢٦٣٣ اختباراً تمر · بناء إنتاج ناجح**.

⚠️ **الفارق الذي يحكم متى تتوقّف:** ما سبق **حذفٌ بحت** — كودٌ لا يستدعيه
أحد. وما بقي (طبقة كميات الحجز · سطح Stripe) **تغييرُ سلوك** يلبس ثوب
التنظيف. لا تخلط الاثنين في دفعة واحدة، ولا تنجز نصف الثاني.

#### جرد ٢٠٢٦‑٠٨‑١٢ — ما حُذف، و**ما ثبت أنه ليس ميتاً**

جرد كامل (ملفات · صادرات · جداول · أعمدة · تعدادات · مفاتيح ترجمة · حزم).
النتيجة المهمة أن **صفر ملف كان ميتاً** — الأحد عشر التي تُبلغ عنها knip هي
الإبقاءات المتعمَّدة الموثّقة أعلاه بحرفها. المحذوف فعلاً:

| ما حُذف                                                                  | لماذا                                                                                                                                                                           |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **١٩٥٦ مفتاح ترجمة** (١٠٤٨ من `ar` · ٩٠٨ من `en`)                        | يتيمة — أكبر كتلها `bookings` و `reports` و `bookingForm`                                                                                                                       |
| `app/utils/rate-limit.server.ts` + اختباره                               | `enforceUserRateLimit` لا يستدعيه إلا اختباره؛ مستهلكه كان `requireMobileAuth`                                                                                                  |
| `mobilePkceChallengeCookie` ومسار SSO للجوال                             | كل السلسلة تصبّ في `/oauth/callback/mobile` المحذوف                                                                                                                             |
| `User.lastMobileActiveAt` + فهرسه                                        | بقيّة جوال؛ تعليقه يصف كاتبه بـ`requireMobileAuth` التي لم تعد موجودة                                                                                                           |
| `Image.altText` · `AuditAssignment.role`                                 | صفر قراءة وصفر بيانات                                                                                                                                                           |
| `TagUseFor` · `AuditAssignmentRole`                                      | تعدادان يتيمان                                                                                                                                                                  |
| `patches/expo-image` + `patchedDependencies`                             | بقيّة جوال — **كانت تُفشِل `pnpm install`** بـ`ERR_PNPM_PATCH_NOT_APPLIED`                                                                                                      |
| `@react-router/serve` · `prettier-plugin-tailwindcss` · `tsconfig-paths` | الأول: `start` يشغّل `node build/server/index.js` مباشرةً. الثاني: **لا إعداد prettier في المستودع أصلاً** فلا يُحمَّل. الثالث: المستعمَل هو `vite-tsconfig-paths` (اسم مختلف). |

⚠️ **وخمسة جداول بدت بصفر استعمال وليست ميتة** — لا تحذفها بناءً على عدّ
`db.<model>`: `Announcement` (نداء متعدّد الأسطر) و `SsoDetails` و `Tier` و
`TierLimit` (تُقرأ عبر `include` متداخل) و `CustodyHandoverAsset` (يُكتب
بالكتابة المتداخلة على `CustodyHandover`). وكذلك `ssoDetailsId` و `tierLimitId`
و `inviteeUserId` — أعمدة FK تسندها علاقات حيّة.

⚠️ **وعدد `knip` غير مستقرّ بين تشغيلين متتاليين** (١٣ ثم ١١ في نفس الجلسة،
والفارق ملفان مستوردان فعلاً). لا تحذف من قائمته مباشرةً.

**وما بقي عمداً:** `BookingStatus` و `BookingApprovalState` (تفكيك الحجز بيد
تغيير مواز) وسطح Stripe كاملاً (انظر المزلق ٩ — تبويبٌ لميزات مستعمَلة، حذفه
**يقفل** الجرد والباركود لا ينظّف).

### TypeScript Strictness

- **Never use `any` as a shortcut.** The `any` type should only be used when it genuinely makes sense (e.g., wrapping third-party APIs with unknown shapes). Using `any` because it's "easier" or "less work" to figure out the proper type is not acceptable. Always find or define the correct type — use `unknown` with type narrowing if the shape is truly dynamic.

### Key Business Features

- **Asset Management**: CRUD operations, QR code generation, image processing
- **Booking System**: Calendar integration, conflict detection, PDF generation
- **Multi-tenancy**: Organization-based data isolation
- **Authentication**: Supabase Auth with SSO support

### Bulk Operations & Select All Pattern

When implementing bulk operations that work across multiple pages of filtered data, follow the **ALL_SELECTED_KEY pattern**:

**The Pattern:**

1. **Component Layer** - Pass current search params when "select all" is active
2. **Route/API Layer** - Extract and forward `currentSearchParams`
3. **Service Layer** - Use `getAssetsWhereInput` helper to build where clause from params

**Key Implementation Points:**

- Use `isSelectingAllItems()` from `apps/webapp/app/utils/list.ts` to detect select all
- Always pass `currentSearchParams` alongside `assetIds` when ALL_SELECTED_KEY is present
- Use `getAssetsWhereInput({ organizationId, currentSearchParams })` to build Prisma where clause
- Set `takeAll: true` to remove pagination limits

**Working Examples:**

- Export assets: `apps/webapp/app/components/assets/assets-index/export-assets-button.tsx`
- Bulk delete: `apps/webapp/app/routes/_layout+/assets._index.tsx` (action)
- QR download: `apps/webapp/app/routes/api+/assets.get-assets-for-bulk-qr-download.ts`

**📖 Full Documentation:** See [docs/select-all-pattern.md](./apps/docs/select-all-pattern.md) for detailed implementation guide, code examples, and common pitfalls.

## Testing Approach

### Unit Tests (Vitest)

- Tests co-located with source files
- Happy DOM environment for React component testing
- Run with `pnpm webapp:test -- --run` or `pnpm --filter @shelf/webapp test:cov` for coverage

### Validation Pipeline

Always run `pnpm webapp:validate` before committing - this runs:

1. Prisma type generation
2. ESLint with auto-fix
3. Prettier formatting
4. TypeScript checking
5. Unit tests

### Writing & Organizing Tests

#### Test Philosophy

- Write behavior-driven tests focusing on observable outcomes rather than implementation details.
- Tests should describe what the system does, not how it does it.
- Avoid testing internal private methods or state; instead, test public interfaces and user-visible effects.

#### When to Mock

- Mock only external network calls, time-based functions, feature flags, or heavy dependencies that are impractical or slow to run in tests.
- Avoid mocking internal business logic or utility functions to keep tests realistic and maintainable.
- Prefer using real implementations where possible to catch integration issues early.

#### Mock Justification Rule

- Every mock must be accompanied by a `// why:` comment explaining the reason for mocking.
- This encourages thoughtful use of mocks and helps reviewers understand test design choices.

#### Mocks drift — assume they are stale, not that the code is wrong

Seven test files broke this way at once (fixed 2026-08-05). When a route or
service test fails, check the mock against the source **before** changing an
assertion:

- **`findFirst` vs `findUnique`.** Nearly every query here is scoped by
  `organizationId` as well as `id` — that is the cross-org guard, and it is not
  a unique compound, so it _must_ be `findFirst`. A mock still declaring
  `findUnique` means the mock is out of date, not that the query is wrong.
  **Never "fix" such a test by switching the source to `findUnique`** — that
  removes the guard.
- **A new dependency the mock never got.** A service that starts calling
  `getMobileUserContext` (or any new helper) will hit the real database through
  an unmocked path. Symptom: the loader short-circuits and the assertion reads
  "expected 1 call, got 0".
- **A unit test that reaches the network is a bug in the test.** One suite
  opened a real Prisma connection, failed with 503 on any machine without
  Postgres, and leaked an unhandled rejection that Vitest blamed on _whichever
  file ran next_. If you see `Can't reach database server`, find the unmocked
  module — do not chase the file Vitest names.
- **Assert the contract, not the sentence.** User-facing copy is translated and
  changes; pinning a whole message makes tests fail for wording edits that broke
  nothing. Assert `status` and that no write happened.

`createLoaderArgs` / `createActionArgs` from `@mocks/remix` supply a default
`context` with a working `getSession()` (user `user-123`), matching what the
real server hands every loader. Pass `context` explicitly only when the test
needs a different user — do not hand-roll the shape.

#### Organizing Mocks and Factories

- **Test files**: Co-located with source files (e.g., `apps/webapp/app/modules/user/service.server.test.ts`)
- **Shared mocks**: Place in `apps/webapp/test/mocks/` directory, organized by domain (remix.tsx, database.ts)
- **Factories**: Place in `apps/webapp/test/factories/` directory for generating test data
- **MSW handlers**: `apps/webapp/test/mocks/handlers.ts`

Example directory structure:

```
apps/webapp/
├── app/
│   ├── modules/
│   │   └── user/
│   │       ├── service.server.ts
│   │       └── service.server.test.ts  # Co-located test
└── test/
    ├── mocks/
    │   ├── remix.tsx          # Loader/action args + Remix hook mocks
    │   ├── database.ts        # Database/Prisma mocks
    │   └── handlers.ts        # MSW API handlers
    ├── factories/
    │   ├── user.ts            # User factory
    │   ├── asset.ts           # Asset factory
    │   └── index.ts           # Export all
    └── routes-tests/          # Route loader/action tests
```

#### Path Aliases (Configured)

Path aliases are configured in `vitest.config.ts` for easy imports:

```typescript
import { createUser } from "@factories"; // → apps/webapp/test/factories/index.ts
import { createRemixMocks } from "@mocks/remix"; // → apps/webapp/test/mocks/remix.tsx
```

#### Factories & Test Data

- Use factories to generate consistent and realistic test data.
- Factories should allow overrides for specific fields to tailor data for each test case.
- Avoid hardcoding data within tests; use factories to keep tests clean and maintainable.

Example factory usage:

```typescript
import { userFactory } from "@factories/userFactory";

const testUser = userFactory.build({ role: "admin" });
```

#### Pre-Commit Checklist

Before committing tests:

- Ensure tests are behavior-driven and do not rely heavily on implementation details.
- Confirm mocks have `// why:` comments explaining their necessity.
- Verify tests run quickly and reliably without flaky behavior.
- Check that test data is generated via factories or well-structured mocks.
- Review test readability and maintainability.

## Environment Configuration

The `.env` file lives at the **monorepo root** (not inside `apps/webapp/`). Copy `.env.example` to `.env` and fill in your values. Vite, Prisma, and all `db:*` commands load from this single root file.

### Required Environment Variables

- `DATABASE_URL` and `DIRECT_URL` - PostgreSQL connections
- `SUPABASE_URL` and `SUPABASE_ANON_PUBLIC` - Supabase configuration
- `SESSION_SECRET` - Session encryption key

### Feature Flags

- `ENABLE_PREMIUM_FEATURES` - Toggle subscription requirements
- `DISABLE_SIGNUP` - Control user registration
- `SEND_ONBOARDING_EMAIL` - Control onboarding emails

## Important Files to Understand

1. **`packages/database/prisma/schema.prisma`** - Complete database schema and relationships
2. **`apps/webapp/app/config/shelf.config.ts`** - Application configuration and constants
3. **`apps/webapp/app/modules/`** - Core business logic services (asset, booking, user, etc.)
4. **`apps/webapp/app/routes/_layout+/`** - Main authenticated application routes
5. **`apps/webapp/vite.config.ts`** - Build configuration with Remix and development settings
6. **`packages/database/src/client.ts`** - Database client factory (shared across apps)

## Development Workflow

1. **Database Changes**: Modify `packages/database/prisma/schema.prisma` → `pnpm db:prepare-migration` → `pnpm db:deploy-migration` (runs via `@shelf/database`)
2. **New Features**: Create in `apps/webapp/app/modules/` for business logic, `apps/webapp/app/routes/` for pages
3. **Component Updates**: Follow existing patterns in `apps/webapp/app/components/`
4. **Testing**: Write unit tests for utilities  
   Follow the testing conventions outlined in the Writing & Organizing Tests section to ensure consistent, behavior-driven testing and minimal mocking.
5. **Pre-commit**: Always run `pnpm webapp:validate` to ensure code quality

## Git and Version control

- **NEVER stage (`git add`) or commit files automatically.** Only stage or commit when the user explicitly asks you to do so.
- Always use Conventional Commits spec when making commits and opening PRs: https://www.conventionalcommits.org/en/v1.0.0/
- use descriptive commit messages that capture the full scope of the changes
- **IMPORTANT: Each line in the commit message body must be ≤ 100 characters**
  - Wrap long lines to stay within the limit
  - This is enforced by commitlint pre-commit hook
  - Subject line can be longer, only body lines are restricted
- dont add 🤖 Generated with [Claude Code](https://claude.ai code) & Co-Authored-By: Claude <noreply@anthropic.com>" because it clutters the commits
- Include test readability and mock discipline in PR reviews. Overly mocked or verbose tests should be refactored before merge.

## حافظ على مواكبة هذا الملف (إلزامي)

**هذا الملف هو ما يقرأه كل وكيل قبل أن يلمس المستودع.** تركُه متخلّفاً عن الكود
لا يُنتج توثيقاً ناقصاً فحسب — بل يُنتج وكلاء يعملون بمعلومات خاطئة بثقة، وهو
أسوأ من غياب التوثيق.

**قبل إنهاء أي مهمة، حدِّث `CLAUDE.md` إن كان تغييرك:**

| التغيير                                    | ما يُحدَّث                                         |
| ------------------------------------------ | -------------------------------------------------- |
| مسار عمل جديد (سير حالة، بوابة، دورة حياة) | جدول «مسارات العمل المبنية» + مستند في `apps/docs` |
| باب دخول أُغلق أو تحوّل                    | تنبيه صريح — وإلا أعاد وكيل فتحه                   |
| دور أو صلاحية أو `PermissionEntity` جديد   | جدول الأدوار وقاعدة الفحص الإيجابي                 |
| مزلق كلّفك وقتاً في التشخيص                | «مزالق هندسية مكلّفة» — **بالعَرَض لا بالسبب فقط** |
| أمر `pnpm` جديد أو تغيّر خطوات التشغيل     | «Essential Commands»                               |
| نمط جديد يتكرّر في ٣ ملفات أو أكثر         | قسم الأنماط المناسب                                |

**اكتب المزالق بعَرَضها الظاهر لا بسببها التقني وحده.** الوكيل التالي يصل
ومعه العَرَض («الزر يحمل ولا يتغيّر شيء») لا السبب («تعداد Prisma غير معرّف في
المتصفح»). المزلق المكتوب بالسبب فقط لا يُعثر عليه وقت الحاجة.

**اذكر أسماء الجداول والملفات صراحةً** — الوكلاء يبحثون بـ `grep` قبل أن يقرأوا.

> **العمل المتوازي:** قواعد التحرير حين يعمل وكيلان معاً موحّدة في قسم
> [More than one agent works in this repo at once](#️-more-than-one-agent-works-in-this-repo-at-once)
> أعلى الملف — لا تُكرّرها هنا.

## Rule Improvement Triggers

- New code patterns not covered by existing rules
- Repeated similar implementations across files
- Common error patterns that could be prevented
- New libraries or tools being used consistently
- Emerging best practices in the codebase

# Analysis Process:

- Compare new code with existing rules
- Identify patterns that should be standardized
- Look for references to external documentation
- Check for consistent error handling patterns
- Monitor test patterns and coverage

# Rule Updates:

- **Add New Rules When:**

  - A new technology/pattern is used in 3+ files
  - Common bugs could be prevented by a rule
  - Code reviews repeatedly mention the same feedback
  - New security or performance patterns emerge

- **Modify Existing Rules When:**

  - Better examples exist in the codebase
  - Additional edge cases are discovered
  - Related rules have been updated
  - Implementation details have changed

- **Example Pattern Recognition:**

  ```typescript
  // If you see repeated patterns like:
  const data = await prisma.user.findMany({
    select: { id: true, email: true },
    where: { status: "ACTIVE" },
  });

  // Consider adding to the files
  // - Standard select fields
  // - Common where conditions
  // - Performance optimization patterns
  ```

- **Rule Quality Checks:**
- Rules should be actionable and specific
- Examples should come from actual code
- References should be up to date
- Patterns should be consistently enforced

## Continuous Improvement:

- Monitor code review comments
- Track common development questions
- Update rules after major refactors
- Add links to relevant documentation
- Cross-reference related rules

## Rule Deprecation

- Mark outdated patterns as deprecated
- Remove rules that no longer apply
- Update references to deprecated rules
- Document migration paths for old patterns

## Documentation Updates:

- Keep examples synchronized with code
- Update references to external docs
- Maintain links between related rules
- Document breaking changes

- When you write any knowledgebase articles or documentation always provide the content in markdown

## نشر هيئة تطوير المنطقة الشرقية (EPDA Deployment)

هذا المستودع مُخصّص لنشر داخلي في **هيئة تطوير المنطقة الشرقية** (Eastern
Province Development Authority). التخصيصات التالية مطبّقة على `apps/webapp`
ويجب الحفاظ عليها عند أي تعديل مستقبلي.

### الهوية البصرية

- الشعار: `public/static/images/sda-logo-full.png` (كامل)،
  `sda-logo-white-text.png` (للخلفيات الداكنة)، `sda-symbol.png` (الرمز).
  المسارات معرّفة في `app/config/shelf.config.ts` → `logoPath`.
- اللون الأساسي: أزرق الهيئة `#044E8B` (مشتق من الشعار).
- **لا تُعِد أي مرجع إلى `shelf.nu` أو شعاره** في الواجهة أو الإيميلات.

**«السطح الذي يراه المستخدم» أوسع مما تظن.** القاعدة لا تقتصر على النص
المعروض: **أسماء ملفات التنزيل** و**نصوص `alt`** و**ترويسات
`Content-Disposition`** كلها منها، وقد سُرِّبت فيها `shelf` فعلياً وصُحّحت في
٢٠٢٦‑٠٨‑٠٥. (كان `shelf://auth-callback` استثناءً لمخطط الرابط العميق، وسقط مع حذف تطبيق
الجوال في ٢٠٢٦‑٠٨‑٠٦.) أما `showShelfBranding` (عمود
قاعدة بيانات) و `name="shelfTier"` (اسم حقل) فأسماء داخلية لا يراها أحد.

**ملصقات QR والباركود تطبع شعار الهيئة**، ويتحكّم بذلك مفتاح
`showShelfBranding` في إعدادات مساحة العمل. الاسم موروث — و*ما* يطبعه هو
`config.logoPath.fullLogo` لا شعار المورّد. الصورة تُلتقط بـ `html-to-image`،
فأي أصل تضيفه إلى الملصق **يجب أن يكون من نفس الأصل (same-origin)** وإلا
لوّث الـcanvas وفشل التنزيل بصمت.

### اللغة والاتجاه والمظهر

اللغة الافتراضية **عربي (RTL)** مع تبديل للإنجليزي. **المظهر فاتح فقط** —
الوضع الداكن أُزيل من الواجهة في `72f86d1`، فلا مبدّل مظهر ولا كوكي ولا فئة
`dark` تُضاف إلى `<html>` إطلاقاً.

⚠️ **لكن بنية الوضع الداكن ما زالت قائمة**: كتلة `.dark` في
`app/styles/global.css` كاملة، و `app/utils/theme.ts` (التفضيل + سكربت منع
الوميض) باقٍ بلا مستوردين، و ١٩ ملفاً ما زالت تستخدم `text-static-white`.
أي أن إعادة تفعيله سلكٌ واحد لا إعادة بناء — **فلا تحذف هذه البنية** ظنّاً
أنها ميتة، والتزم بـ `text-static-white` للنص فوق الخلفيات الملوّنة حتى
يبقى الخيار مفتوحاً.

📖 **اقرأ [apps/docs/epda-i18n-and-theming.md](./apps/docs/epda-i18n-and-theming.md)
قبل أي تعديل على الواجهة** — يشرح إضافة النصوص المترجمة، وقواعد الخصائص
المنطقية (`ms-`/`me-`/`ps-`/`pe-`/`text-start`/`text-end` بدل الفيزيائية).

نقاط حرجة:

- أي نص ظاهر جديد يمر عبر `t()` ويُضاف إلى **كلا** ملفي
  `app/i18n/locales/ar.json` و `en.json`.
- **`t` اعتماديةٌ في `useMemo` و `useCallback`.** أي memo يستدعي `t()` بداخله
  يجب أن تحوي مصفوفةُ اعتمادياته `t`، وإلا **بقي النص بلغته القديمة بعد تبديل
  اللغة** — النص محفوظ والمفتاح لم يتغيّر فلا سبب لإعادة الحساب. صُحّح ١٤
  موضعاً في ٢٠٢٦‑٠٨‑٠٥؛ التحذير يظهر في lint كـ `react-hooks/exhaustive-deps`
  فلا تُسكِته، أصلحه.
- **لا تستدعِ `useTranslation()` خارج مكوّن React إطلاقاً** — ولا داخل
  `superRefine`/`refine` في Zod تحديداً. مخططات Zod تعيش في نطاق الوحدة
  وتُنفَّذ على **الخادم** أيضاً، فالـhook هناك ينهار. القاعدة المعتمدة في
  `app/i18n/validation-messages.ts`: **رسائل المخططات تبقى إنجليزية حرفية**
  وهي مصدر الحقيقة، والترجمة تحدث عند **حدّ العرض** عبر `useValidationMessage`.
  لإضافة رسالة: أضف نصها الإنجليزي الحرفي إلى `VALIDATION_MESSAGE_KEYS` ثم
  المفتاح إلى ملفَّي الترجمة.
- **لا تكتب نصاً عربياً كقيمة احتياطية في `t("key", "نص")`.** القيمة الاحتياطية
  تظهر للمستخدم الإنجليزي كما هي — أضف المفتاح إلى الملفين بدلاً منها.
- قوالب الإيميل و PDF **تبقى** بالخصائص الفيزيائية (`ml-`/`text-left`) —
  عملاء البريد ومولّد PDF لا يدعمون الخصائص المنطقية.
- `remix-i18next` **متعمَّد عدم استخدامه** — يجرّ `react-router-dom@6` الذي
  يتعارض مع React Router 7 ويكسر البناء. كشف اللغة مكتوب يدوياً في
  `app/i18n/i18n.server.ts`.

⚠️ **استثناء قائم ومقصود: مسار الاستلام والأصناف بأوامر الشراء عربيٌّ مباشر
بلا `t()`** — `app/components/goods-receipt/`، و`receipts.*`، و
`purchase-orders.*`، و`assets.$assetId_.finance.tsx` (نحو ٢٥٠ نصاً). السبب أن
معظمها **ألفاظ النموذجين الرسميين نفسها** (نموذج ٢/٣: «مأمور عهدة ساحة
الاستلام»، «حد الرسملة»…)، وترجمتها تُنتج مستنداً لا يطابق الورقة التي يُعيد
إنتاجها. ما ليس من ألفاظ النموذج (عناوين التبويب والحالات) يستحق `t()` ولم
يُنقل بعد. **إن نقلته فانقله بلغة النموذج الرسمي لا بترجمة حرفية**، ولا تخلط
النقل بتعديل آخر.

**قبل التسليم، افحص المفاتيح المفقودة** — المفتاح غير الموجود يُطبع حرفياً
للمستخدم (`common.date` ظهر هكذا فعلاً):

```bash
# مفاتيح مستعملة في الكود وغير موجودة في ملفات الترجمة
grep -rhoE 't\(\s*"[a-zA-Z0-9_]+(\.[a-zA-Z0-9_]+)+"' apps/webapp/app \
  | sed -E 's/.*"(.*)"/\1/' | sort -u > /tmp/used.txt
```

ثم قارنها بمفاتيح `ar.json`. وتحقّق أيضاً من تطابق الملفين — الفرق المسموح
الوحيد صيغ الجمع العربية (`_zero`/`_two`/`_few`/`_many`).

### الأدوار والصلاحيات

ستة أدوار تشغيلية فوق أدوار Shelf الأصلية:

| الدور           | enum                    | الدور في سير العمل                                  |
| --------------- | ----------------------- | --------------------------------------------------- |
| تقنية المعلومات | `OWNER`                 | صلاحيات كاملة — **وهي أيضاً إدارة مستقبِلة**        |
| المستودعات      | `WAREHOUSE`             | يضيف الصنف، يعتمده، ويسلّمه للإدارات دفعةً واحدة    |
| المالية         | `FINANCE`               | يعدّل بيانات الصنف والترميز — **لا يضيف ولا يعتمد** |
| المخزون         | `INVENTORY`             | يراقب ويعلّق للمراجعة — **لا يقرّر**                |
| الإدارة         | `DEPARTMENT`            | تستلم دفعةً وتسلّم موظفيها — **لا تنشئ ولا تعتمد**  |
| الموظف          | `SELF_SERVICE` / `BASE` | يستلم عهدةً ويوقّع — **لا يطلب**                    |

#### `DEPARTMENT` عامٌّ عمداً — والإدارة بيانات لا كود

المرافق وتقنية المعلومات إدارتان مستقبِلتان، لكن **الدور واحد اسمه `DEPARTMENT`
لا `FACILITIES`**. تقنية المعلومات تعمل بـ`OWNER` لأنها أدمن النظام أصلاً، وليس
لها حساب منفصل — لكن **مكتبها موجود** كصفّ `TeamMember`.

ثلاث قطع، وفصلها هو ما يجعل الإدارة الثالثة صفّاً لا ترحيلاً:

| القطعة                                    | تجيب عن                        |
| ----------------------------------------- | ------------------------------ |
| `OrganizationRoles.DEPARTMENT`            | «هل يتصرّف كإدارة؟» (الصلاحية) |
| `TeamMember.isDepartment`                 | «هذا الصفّ مكتب لا شخص»        |
| `UserOrganization.departmentTeamMemberId` | «أيُّ إدارة؟» (النطاق)         |

**الإدارات `TeamMember` لا جدول جديد**، لأن العهدة أصلاً `TeamMember`‑scoped
و`userId` اختياري فيها. المستودع يسلّم المكتب، والمكتب يسلّم موظفيه — بنفس مسار
`CustodyHandover`.

**وللقطع الثلاث شاشة منذ ٢٠٢٦‑٠٨‑١٠:** `/settings/team/departments`
(`app/modules/department/service.server.ts`). قبلها كانت الثلاث قابلةً للكتابة
من `scripts/seed-epda-users.ts` وحده — أي أن «بيانات لا كود» كانت صحيحةً في
المخطط وكاذبةً عملياً: إضافة الإدارة الثالثة كانت جراحة قاعدة بيانات. لا تُضِف
مساراً موازياً لكتابتها.

⚠️ **والدور والمؤشّر يُكتبان معاً دائماً — في تحديث واحد.** كلٌّ منهما وحده
**لا يفعل شيئاً ولا يُظهر خطأً**: `resolveDepartmentDeskId` تشترطهما معاً، فيبدو
على الشاشة أن الربط نجح ويرى المستخدم صفحةً فارغة. ولهذا **`DEPARTMENT` تبقى
خارج `ASSIGNABLE_ORGANIZATION_ROLES`**: منحُها من قائمة تغيير الدور يضبط الدور
ويترك المؤشّر `null` — وهو بالضبط الفخّ. تُمنح من هذه الشاشة وحدها، مقرونةً
بمكتبها.

والجدول يقول صراحةً إن مكتباً **بلا ممثِّل** محاضره لا يستطيع أحد توقيعها —
ولا يمنع الحالة: سلطةٌ لا تستطيع سحب صلاحية شخص حتى تجد بديله أسوأ من التي
تستطيع.

⚠️ **`DEPARTMENT` غير مسجَّل في `ROLES_WITH_ORG_WIDE_VISIBILITY`** (فيُحجب
افتراضياً، وهو الصحيح)، لكن ذلك وحده يريه **لا شيء**: عهدة الدفعة على مكتب
الإدارة لا على صفّه الشخصي. الحلّ `visibleCustodianIds` في `role-scope.ts` —
نطاقٌ ثالث بين «كل شيء» و«سجلاتي». وفيه قاعدتان يحرسهما اختباران:

- **المؤشّر وحده لا يكفي** — موظف عادي تصادف أن له `departmentTeamMemberId` لا
  يرث مخزون الإدارة. الدور هو ما يمنح رؤية المكتب، والمؤشّر يقول أين يعمل فقط.
- **`[]` ليست `null`.** الفارغة تعني «لا تُظهر شيئاً»، و`null` تعني «لا تُرشِّح».
  خلطهما يحوّل صفحةً فارغة إلى تسريب كامل.

⚠️ **مكتب الإدارة صفٌّ بلا حساب — وهذا يكسر كل فحص يقارن بالصفّ الشخصي.**
هذه ليست ملاحظة نظرية: المسار كان **مقطوعاً بالكامل** عند أول تشغيل (صُحّح في
٢٠٢٦‑٠٨‑٠٦). المستودع يفتح المحضر بنجاح، ثم يتوقّف كل شيء لأن أربعة مواضع
كانت تُرشِّح بـ`ownMember.id` وحده:

| الموضع                              | العَرَض                                    |
| ----------------------------------- | ------------------------------------------ |
| `listOpenHandovers`                 | المحضر لا يظهر في «بانتظار توقيعي»         |
| `countHandoversAwaitingMySignature` | الشارة صفر رغم وجود محضر ينتظره            |
| حارس `handovers_.$handoverId`       | فتحه بالرابط المباشر ← **404**             |
| `resolveSignableParty`              | لا خانة له ← **لا يستطيع التوقيع إطلاقاً** |

**القاعدة:** أي فحص يسأل «هل هذا الشخص هو الطرف المقابل؟» يجب أن يقارن بـ
**صفّين**: صفّه الشخصي **و**مكتب إدارته (`resolveOwnDepartmentId`). ابحث عن
`ownCounterpartyIds` — هذا هو النمط.

و`resolveSignableParty` وُسِّعت بـ`ownDepartmentTeamMemberId`، ووَسّعت
**مَن يُعدّ طرفاً مقابلاً** فقط — لا عدد الخانات. الرجوع المبكر ما زال يمنع
توقيع النصفين، ويحرسه اختبار صريح: «موظف الإدارة لا يوقّع خانة المستودع أيضاً».

⚠️ **ولا تكتفِ باختبار الدالة — تحقّق أنها مستدعاة.** كُتبت
`visibleCustodianIds` وووثّقت واختُبرت بستة اختبارات… ولم تُستدعَ في أي استعلام،
فبقيت الإدارة لا ترى شيئاً والاختبارات كلها خضراء. اختبار الوحدة لا يكشف سلكاً
غير موصول؛ ابحث بـ`grep` عن اسم الدالة خارج ملفها قبل أن تعدّ المهمة منتهية.

**عهدة المكتب تُعرض في `/my-custody`** في قسم منفصل («عهدة إدارتي») — لا تُدمج
مع العهدة الشخصية: الدمج يقرأ كأن الموظف مسؤول شخصياً عن ثمانين جهازاً.

⚠️ **`requirePermission` تُعيد `role` واحداً — `roles[0]` — لا قائمة.** هذا
كافٍ لفحص الصلاحية (الأوسع يفوز)، لكنه **فاقدٌ للمعلومة**: كل من يسأل «هل يحمل
هذا الشخص `DEPARTMENT`؟» يجب أن يقرأ `UserOrganization.roles` كاملةً.

العَرَض الذي كشفه: وُقّع محضر الدفعة، **وانتقلت العهدة فعلاً في القاعدة**
(`IN_CUSTODY` بعهدة إدارة تقنية المعلومات)، ومع ذلك لم تظهر الأصناف للأدمن.
السبب أن أدواره مخزَّنة `[OWNER, DEPARTMENT]` فـ`roles[0]` هو `OWNER`، وتمرير
`[role]` جعل المكتب `null`. **لا تستنتج «التسليم لم ينجح» من صفحة فارغة —
افحص `Custody` أولاً.**

القاعدة: `roles: membership.roles` لا `roles: [role]`. يحرسه اختباران.

**ومنذ ٢٠٢٦‑٠٨‑١٠ لم يعد عليك جلبها بنفسك: `requirePermission` تُعيد `roles`
كاملةً بجانب `role`.** استعملها في كل سؤال عن **عضوية** دور، وأبقِ `role`
للرُّتبة وحدها. وثلاثة مواضع كانت تقرأ `roles[0]` فأُصلحت معها:

| الموضع                                                                 | العَرَض قبل الإصلاح                                                                                                        |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `getUpdatesForUser` · `getUnreadCountForUser` · `markAllUpdatesAsRead` | إعلانٌ موجَّه إلى `DEPARTMENT` **لا يراه** `admin@epda.local` — لا في الشارة ولا في القائمة ولا يمسحه «تعليم الكل مقروءاً» |
| `changeUserRole` (حارس «المالك وحده يغيّر دور أدمن»)                   | عضوية مخزَّنة `[DEPARTMENT, ADMIN]` تُقرأ إدارةً فيمرّ أدمنٌ غير مالك من الحارس                                            |
| `resolveRoleChange` (كشف التنزيل)                                      | `ADMIN → WAREHOUSE` يُقرأ تنزيلاً فتُنقل ملكية كل ما يملكه المستخدم                                                        |

الفاصلة الآن `highestRole(roles)` في `app/utils/roles.ts` — **الأوسع رؤيةً لا
الأول في المصفوفة**. لا تكتب `roles[0]` في حارسٍ جديد.

⚠️ **و`changeUserRole` كان يدهس المصفوفة (`set: [newRole]`) — وهذا كان باباً
بلا رجعة.** `DEPARTMENT` ليست رتبةً بل علامةَ «هذا الحساب يمثّل مكتب إدارة»،
وهي **غير موجودة في `ASSIGNABLE_ORGANIZATION_ROLES`**. فتغييرُ دورِ حساب إدارة
من الواجهة كان يمسحها **بلا أي طريقة لإعادتها إلا بتحرير القاعدة**، ويبقى
`departmentTeamMemberId` معلَّقاً بلا أثر — فيقع بالضبط عَرَض «مكتب الإدارة صفٌّ
بلا حساب» أعلاه: محاضر المكتب المفتوحة لا يستطيع أحد توقيعها فتُعلَّق للأبد.

القاعدة الآن `preservedRoles(userOrg.roles)`: الحوار يستبدل **الرتبة** ويُبقي
كل دور لا يستطيع هو أن يُعيده. ومشتقّة من `ASSIGNABLE_ORGANIZATION_ROLES` لا
مكتوبةً بالاسم، فأي دور غير قابل للإسناد يُضاف لاحقاً يُحفظ تلقائياً.

⚠️ **«أي مكتب أمثّل؟» سؤال مستقلّ عن «أي صفوف أرى؟» — لا تشتقّ أحدهما من
الآخر.** `resolveDepartmentDeskId` (الدور + المؤشّر) هي الفاصلة، و
`visibleCustodianIds` تستدعيها ولا تعرّفها.

اشتقاق المكتب من الرؤية انكسر فوراً على `admin@epda.local`: يحمل `OWNER`
(رؤية شاملة ⇒ `visibleCustodianIds` تُعيد `null` أي «لا تُرشِّح») **و**يمثّل
إدارة تقنية المعلومات. فكان الجواب «لا مكتب» للحساب الذي يمثّله بالضبط، ولا
يظهر له قسم «عهدة إدارتي». يحرسه أربعة اختبارات في `role-scope.test.ts`.

**الحسابات التجريبية** (كلمات المرور في `scripts/seed-epda-users.ts`):

| الحساب                  | الأدوار             | المكتب                |
| ----------------------- | ------------------- | --------------------- |
| `facilities@epda.local` | `DEPARTMENT`        | إدارة المرافق         |
| `admin@epda.local`      | `OWNER, DEPARTMENT` | إدارة تقنية المعلومات |

**لا حساب منفصل لـIT عمداً** — الهيئة تُشغّل تقنية المعلومات على حساب الأدمن
نفسه، فيحمل الدورين معاً: `OWNER` لإدارة النظام و`DEPARTMENT` ليستلم دفعات
مكتبه ويوقّعها. بدون `DEPARTMENT` كان مكتب IT يستقبل محاضر **لا يستطيع أحد
إكمالها** فتبقى معلّقة للأبد.

وحملُه الدورين **لا يخرق** «لا يوقّع شخص واحد نصفَي محضر»: الطرف المقابل
المسمّى يأخذ خانته ويرجع، فخانة المستودع تبقى لموظف المستودعات.

⚠️ **البذرة تُصلح الأدوار عند إعادة التشغيل** (`update: { roles, … }`) — وهذا
مقصود: حسابٌ بُذر قبل أن تصير IT مكتباً مستقبِلاً يبقى `[OWNER]` بلا إصلاح.
انتبه أنها تدهس أي تعديل يدوي على الأدوار.

**قاعدة حاكمة: لا تفحص الأدوار فحصاً سلبياً.** النمط القديم
(`role !== SELF_SERVICE` أي «إن لم يكن موظفاً بسيطاً فهو مسؤول») يمنح كل دور
يُضاف لاحقاً صلاحيات مسؤول بصمت. النطاق يُشتق من قائمة السماح المركزية في
`app/utils/permissions/role-scope.ts` عبر `rolesAreScopedToOwnRecords(role)`،
والصلاحية تُفحص بـ `userHasPermission({ entity, action })`. الدور غير المسجَّل
**يُحجب افتراضياً** — وهناك اختبار يحرس هذه الخاصية.

فرّق بين سؤالين مختلفين لا يغني أحدهما عن الآخر:

- **أي الصفوف يراها؟** → `rolesAreScopedToOwnRecords` (نطاق البيانات)
- **أي إجراء يملكه؟** → `userHasPermission` (الصلاحية)

إجراءان مضافان إلى `PermissionAction` ومتعمَّد فصلهما:

- `approve` — نقل عنصر إلى الأمام في سير العمل (اعتماد صنف، قبول طلب).
- `hold` — تجميد عنصر للمراجعة دون البتّ فيه. **ليس نسخة أضعف من `approve`**:
  المخزون يعلّق ولا يقرّر، والمستودعات تقرّر ولا تعلّق. دمجهما يمنح كل دور
  سلطة الآخر، ويوجد اختبار يفشل إن ملك أي دور تشغيلي الاثنين معاً.

**`asset.delete` للمخزون وحده** — لا المستودعات ولا المالية. المستودعات تضيف
وتعتمد ولا تحذف. (كانت `WAREHOUSE` تملكها فعلياً خلافاً للمصفوفة وخلافاً
لتعليق الكود الذي يعلوها مباشرةً، وصُحّح في ٢٠٢٦‑٠٨‑٠٥.)

⚠️ **راجع كتلة الدور كاملةً مقابل المصفوفة، لا الإجراء الذي تعدّله وحده.**
كانت `WAREHOUSE` تنقصها `booking.create` و `booking.update` رغم أن المصفوفة
تقول «كالمسؤول» — فيستطيع المستودع **حذف** حجز وإضافة أصناف إليه ولا يستطيع
**إنشاءه**. العَرَض: صفحة `Unauthorized` عند «إنشاء حجز جديد» من صفحة الصنف.
صُحّح في ٢٠٢٦‑٠٨‑٠٥.

الدرس: **مجموعة صلاحيات غير متماسكة داخلياً = خطأ** — `manageAssets` بلا
`update`، أو `delete` بلا `create`، ليست قراراً تصميمياً بل سهو. عند إضافة أي
كيان لدور، قارن كتلته كاملةً بـ `ADMIN` واسأل عن كل فرق: أمقصود هو أم منسيّ؟

⚠️ **`Role2PermissionMap` مصدر الحقيقة، والتعليق فوقه ليس كذلك.** التعليقات
هناك انحرفت عن المصفوفة مرة وسترجع تنحرف. اختبارات
`app/utils/permissions/role-scope.test.ts` تحرس المصفوفة المعتمدة نفسها —
**عدّل الاختبار مع أي تغيير مقصود في الصلاحيات**، ولا تصدّق تعليقاً يخالف
مصفوفةً.

#### تطبيق الجوال حُذف كاملاً (٢٠٢٦‑٠٨‑٠٦)

قرار مالك المشروع: **النظام ويبٌ فقط.** حُذف `apps/companion` (٢١٥ ملفاً) ومعه
كل سطحه في الخادم — فلا تُعِد بناءه ولا تُضِف مساراً جديداً تحت `/api/mobile`:

- **٣٨ مساراً** تحت `app/routes/api+/mobile+/` واختباراتها.
- **وحدات `app/modules/api/*`** كلها (`mobile-auth`, `mobile-usage`,
  `mobile-custody-visibility`, …) — المجلد نفسه لم يعد موجوداً.
- `modules/auth/mobile-sso.server.ts` ومسار `oauth.callback_.mobile.tsx`.
- `modules/audit/mobile-evidence.server.ts`.
- `mobileIpRateLimit` من `server/rate-limit.ts`، ومساراته من `publicPaths`
  في `server/index.ts`.
- مسارا `.well-known` (Universal Links / App Links) — لا تطبيق يطالب بالنطاق.
- `companionAndroidPackageName` و `mobileActivityDebounceMs` من الإعدادات،
  وسكربتات `companion:*` من `package.json`، وخُطّاف `eslint-companion`.

⚠️ **`requireMobileAuth` لم يعد موجوداً.** أي كود يستدعيه من ذاكرة نموذج قديم
لن يُترجم — وهذا مقصود. المصادقة كلها بالجلسة عبر `requirePermission`.

### مسارات العمل المبنية

| المسار                 | الملخّص                                                             | التوثيق                                                                          |
| ---------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| استلام الصنف           | `Asset.lifecycleStage`: `PENDING` → `READY` بيد المستودعات          | [epda-asset-intake-workflow.md](./apps/docs/epda-asset-intake-workflow.md)       |
| محاضر التسليم الموقّعة | `CustodyHandover` — التوقيع الثاني هو ما ينقل العهدة                | [epda-custody-signatures.md](./apps/docs/epda-custody-signatures.md)             |
| استلام التوريدات       | `GoodsReceipt` — نموذجا الاستلام هما **الباب الوحيد** لدخول الأصناف | [epda-goods-receipt-workflow.md](./apps/docs/epda-goods-receipt-workflow.md)     |
| **دورة الحياة كاملةً** | من التوريدة إلى توقيع الموظف — **وكل جدول يُكتب فيه** بكل خطوة      | [epda-asset-lifecycle-workflow.md](./apps/docs/epda-asset-lifecycle-workflow.md) |

**ابدأ من الأخير عند تتبّع «أين ذهب هذا الصنف؟»** — الثلاثة الأولى تشرح كلٌّ
مرحلةً، وهو يصل بينها ويسمّي الصفّ الذي يشهد على كل انتقال.

#### ⚠️ الحجوزات الزمنية أُزيلت — النظام عهدة فقط

قرار مالك المشروع (٢٠٢٦‑٠٨‑٠٦): الهيئة **لا تستخدم الحجز الزمني إطلاقاً**.
الأصل ينتقل بالعهدة والتوقيع لا بحجز له `from` و `to`. لذلك حُذف نظام الحجز
كاملاً من `apps/webapp` — المسارات والوحدات الأربع والتقويم وتقارير الحجز
الستة وأعمدة الإتاحة. **لا تُعِد بناءه ولا تُعِد استيراد `~/modules/booking/*`.**

الحالة بعد ٢٠٢٦‑٠٨‑٠٦: **الويب‑آب نظيف** (صفر أخطاء أنواع · ٢٨٣٦ اختباراً
تمر · بناء إنتاج ناجح). وما زال قائماً عمداً حتى تُنجز مراحله:

- ~~**جداول `Booking*` باقية في `schema.prisma`**~~ — **أُسقطت كلها في
  ٢٠٢٦‑٠٨‑١٢** (ترحيل `20260812093358_drop_bookings_and_mobile_auth`): عشرة
  جداول — `Booking` · `BookingAsset` · `BookingNote` · `BookingSettings` ·
  `BookingModelRequest` · `PartialBookingCheckin` · `PartialBookingCheckout` ·
  `MobileAuthCode` · وجدولا الربط الضمنيان `_BookingNotificationRecipients` و
  `_BookingSettingsAlwaysNotify`. ومعها عمودا `ConsumptionLog.bookingId` و
  `bookingAssetId`. **لا تُعِد أياً منها.**

  ⚠️ **قيمة `CHECKED_OUT` في `AssetStatus` باقية عمداً** — تُفحص `switch`
  شاملاً في عشرات المواضع، وPostgres لا يُسقط قيمة enum يشير إليها صفّ.
  وكذلك `BookingStatus` و `BookingApprovalState` باقيان كتعدادين بلا جدول.

  ⚠️ **والمترجم هو ما وجد البقايا، لا `grep`.** بعد إسقاط الجداول ظهرت تسعة
  مواضع لم يرها أي مسح نصّي — `Prisma.BookingWhereInput` في لوحة الأوامر،
  و`bookingSettings` في إنشاء المنظمة، و`bookings.updateMany` في قبول الدعوة،
  ونوع `AdvancedAssetBooking`، وطور كامل في بذرة العرض التوضيحي. **أسقِط
  الجداول أولاً ثم اتبع `tsc`** — أرخص من محاولة العثور عليها مسبقاً.

- ~~**`booking` و `bookingNote` باقيان في `Role2PermissionMap`**~~ — **حُذفا
  فعلاً** (تحقُّق ٢٠٢٦‑٠٨‑١٠): لم يبقَ في `permission.data.ts` إلا تعليقات
  تشرح الحذف. لا تبحث عنهما.
- **`availableToBook` باقٍ ولم يُلمس** — و**ليس بلا مستهلك** خلافاً لما كان
  مكتوباً هنا (صُحّح ٢٠٢٦‑٠٨‑١٠). ما زال حيّاً في **الاستيراد والتحديث**
  (`import-update-diff.ts`، `import-update.server.ts`، `import-update-types.ts`)
  و**تصدير CSV** (`csv.server.ts`، `import-ready-export.server.ts`) و**عمود في
  الفهرس المتقدّم** (`advanced-asset-columns.tsx`). ~~و**شارة المجموعة**
  (`kit-status-badge.tsx`)~~ — حُذف الملف مع المجموعات في ٢٠٢٦‑٠٨‑١١. أي أن
  شارة «غير متاح للحجز» ما زالت **ظاهرة
  للمستخدم** في نظام بلا حجز — قراره مؤجَّل لأنه حقل موثّق ومقصود (انظر
  «`lifecycleStage` و `availableToBook`»)، لكن **سطحه المرئي** يستحق الإزالة
  ولو بقي الحقل.

##### ⚠️ ترتيب إلزامي: نظّف طبقة الكميات **قبل** إسقاط الجداول

استعلامات حجز حيّة تغذّي **شارة حالة الصنف ونافذة تفصيل الكمية** — أبرزها
`components/assets/asset-status-badge/quantity-data.ts`،
و`api+/assets.$assetId.quantity-breakdown.ts`، و`modules/{asset,location,
consumption-log}/service.server.ts`، و`modules/asset/{fields,data.server,
utils.server}.ts`. (كانت ٣١ ملفاً؛ نصيب `modules/kit` منها رحل مع المجموعات في
٢٠٢٦‑٠٨‑١١، والباقي على حاله — **العدد نقص، والقاعدة لم تتغيّر**.)

هي ميتة **منطقياً** (لا حجز يمكن أن يوجد ⇒ `reserved` و `checkedOut` صفر
دائماً) وحيّة **تركيبياً**. ونتيجتان:

- **إسقاط الجداول أولاً يكسر البناء فوراً** — عميل Prisma يفقد العلاقات
  فينهار typecheck في الملفات الـ٣١.
- **حذفها ليس حذفاً بحتاً بل إعادة كتابة لمنطق «المتاح/المحجوز»** في سطح
  يراه المستخدم. نصفُ طبقةٍ منظَّف أسوأ من طبقة كاملة — أنجزها دفعةً واحدة
  أو لا تبدأها.

**بديل «الأصناف المتاحة» وطلب الموظف:** إدارتا **المرافق** و**IT** تستلمان
دفعةً واحدة برقم أمر الشراء ثم تسلّمان الموظف مباشرةً بلا طلب منه — وتوقيعه
إلزامي. **حسابات الموظفين تبقى** (قرار المالك ٢٠٢٦‑٠٨‑٠٦): التوقيع يتطلّب
جلسة، وحذفها كان سيفرض توقيع الطرفين على جهاز واحد وهو ما تمنعه قاعدة
«لا يوقّع شخص واحد نصفَي محضر».

#### ⚠️ المجموعات والوسوم أُزيلت كاملةً (٢٠٢٦‑٠٨‑١١)

قرار مالك المشروع: الهيئة **لا تجمّع الأصناف في مجموعات ولا تُوسمها**. حُذف
`Kit` و `AssetKit` و `KitCustody` و `Tag` و `KitStatus` من المخطط ومن القاعدة
(ترحيل `20260811120000_drop_kits_and_tags`)، ومعها ٧٢ ملفاً من المسارات
والمكوّنات والوحدات و٣٤٠ مفتاح ترجمة يتيماً. الحالة بعدها: **صفر أخطاء أنواع ·
صفر أخطاء lint · ١٧٦ ملف اختبار / ٢٥١١ اختباراً تمر · بناء إنتاج ناجح**.

**لا تُعِد `~/modules/kit/*` ولا `~/modules/tag/*` ولا مساراً تحت `/kits`
أو `/tags`.** وثلاثة أشياء بقيت **عمداً** — لا تحذفها ظنّاً أنها بقايا:

| ما بقي                                                                        | لماذا                                                                                                                                                                 |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ASSET_KIT_CHANGED` · `ASSET_TAGS_CHANGED` · `KIT` في تعدادات `ActivityEvent` | صفوف نشاط كُتبت قبل الحذف ما زالت تحملها، وPostgres لا يُسقط قيمة enum يشير إليها صفّ. (`KIT_CREATED` و `KIT_UPDATED` وحدهما حُذفا، بعد التحقّق من أن عددهما صفر.)    |
| وسم `kits_list` في `markdoc.config.ts`                                        | ملاحظات قديمة تحمل `{% kits_list … /%}`. الوسم بقي **بلا `render`** وبـ`transform` يُخرج نصاً («٣ kits») — بدونه يسقط الجزء من منتصف الجملة. **لا تُعِد له مكوّناً.** |
| `TagComponent` و وسم `tag` في markdoc                                         | نفس السبب — عرض اسم فقط، لا يمسّ جدولاً محذوفاً.                                                                                                                      |

⚠️ **والسطح الذي فاتني أولاً: `query.server.ts`.** هو SQL خام، فلا يراه المترجم
ولا الاختبارات التي تفحص أسماءً مستعارة فقط — بقي يستعلم `AssetKit`/`Kit`/
`Tag`/`_AssetToTag` بعد إسقاطها، فانكسرت صفحة `/assets` وحدها. تفصيله وأثره في
المزلق [٣و](#مزالق-هندسية-مكلّفة--اقرأها-قبل-أن-تكرّرها). **عند حذف أي جدول،
ابدأ بجرد `Prisma.sql` قبل الكود المكتوب بأنواع.**

⚠️ **مزلقان يستحقّان الانتباه:**

- **الفهرسان الجزئيان انطويا إلى فهرس واحد.** `Custody_operator_unique` و
  `AssetLocation_manual_unique` كانا شرطيَّين (`WHERE kitCustodyId IS NULL` /
  `WHERE assetKitId IS NULL`) بجانب توأمين للمجموعات. Postgres يُسقطهما تلقائياً
  مع العمود الذي يشير إليه شرطهما، والترحيل يُعيد إنشاءهما **بنفس الاسم** فهرسين
  عاديَّين. الاسم مثبَّت بـ`map:` في المخطط لا بـ`name:` وحده — `name:` اسمٌ في
  عميل Prisma فقط، ولولا `map:` لصار اسم الفهرس في القاعدة
  `Custody_assetId_teamMemberId_key` ولانحرف عن كل تعليق يشير إليه.
- **صفحة `locations/:id/scan-assets` أُعيدت بعد حذفها خطأً.** كانت اسمها
  `scan-assets-kits` فسقطت مع كنس المجموعات، ومعها زرّان حيّان يشيران إليها —
  وهي **مسحُ أصناف** إلى موقع، لا ميزةَ مجموعات. أُعيدت باسم `scan-assets`.
  الدرس: قبل حذف ملف لأن اسمه يحوي `kit`، اقرأ ما يفعله.

**وما لم يُنجز:** `availableToBook` ما زال حقلاً حيّاً وشارته ما زالت ظاهرة —
مذكورٌ أعلاه، ولم يتغيّر بهذا العمل (سطره في القائمة السابقة كان يُحيل إلى
`kit-status-badge.tsx` وقد حُذف ذلك الملف؛ بقية مستهلكيه كما هي).

#### لا يوقّع شخص واحد نصفَي محضر — ولو ملك الصلاحيتين

`resolveSignableParty` هو نموذج الأمان كله للتوقيع عن بُعد، ويسدّ **بابين** لا
باباً واحداً:

- خانة الموظف مربوطة بصف `TeamMember` الخاص به، فلا يوقّعها المسؤول نيابةً عنه.
- ومن كان **هو** الطرف المقابل المسمّى يأخذ خانته **وحدها**، ولو ملك
  `asset.custody`. كان يسقط بعدها إلى خانة المستودع فيوقّع النصفين معاً —
  ومحضرٌ وقّعه شخص واحد لا يشهد عليه أحد، والتوقيع الثاني هو ما ينقل العهدة
  فعلاً. سُدّ في ٢٠٢٦‑٠٨‑٠٥ ويحرسه اختباران في `handover.test.ts`.

**الرجوع المبكر `if (isCounterparty) return …` حاملٌ للقاعدة** — تحويله إلى
سقوطٍ إلى ما بعده يعيد الثغرة بصمت. مسؤول آخر يوقّع الخانة الثانية؛ القاعدة
تقيّد **من** يوقّع لا **هل** يكتمل المحضر.

#### ولكل سطر **كمية** — والنقل جزئي (٢٠٢٦‑٠٨‑٠٩)

`CustodyHandoverAsset.quantity` و `CustodyHandover.releasingTeamMemberId`.
السبب: سطر توريدة من ٣٠ قلماً هو **صنف واحد** كميته ٣٠، والإدارة تسلّم ١٠
لموظف و٢٠ لآخر. بلا كمية لكل سطر لا يستطيع المحضر نقل غير المخزون كاملاً.

**العَرَض الذي كشفه:** وُقّع المحضر ووصل الإدارة **قلم واحد** من ثلاثين —
لأن `Custody.quantity` قيمتها الافتراضية `1` في المخطط، والإنشاء لم يحدّدها.
٢٩ قلماً بقيت تُقرأ «على الرفّ» ولا شيء يشير إلى التناقض حتى يعدّها أحد.

ثلاث قواعد يحرسها ١٥ اختباراً:

- **«في عهدة» حسابٌ لا سؤال نعم/لا للأصناف الكمّية.** صنف بـ٣٠ قلماً و١٠
  خارجة ما زال يملك ٢٠ على الرفّ ويجوز صرفها. الحارس القديم
  (`if (heldBy) throw`) يبقى للأصناف المفردة وحدها.
- **الإنقاص لا الحذف.** `deleteMany` على عهدة المُسلِّم يُعيد باقي الكمية إلى
  الرفّ بصمت. الإدارة التي تسلّم ١٠ من ٣٠ **تحتفظ بـ٢٠**، والصفّ يُحذف فقط
  حين تصل إلى صفر. وفي الاستلام `increment` لا استبدال: موظف يحمل ٥ ويوقّع
  على ١٠ صار يحمل ١٥.
- **`AVAILABLE` فقط حين لا يحمل أحد شيئاً.** قلب الحالة والكمية ما زالت خارجة
  هو ما يسمح لمحضر ثانٍ بصرف المخزون نفسه مرتين.

⚠️ **`releasingTeamMemberId` مخزَّن على المحضر لا ممرَّر فقط** — الأثر يقع عند
**التوقيع** وقد يتأخّر أياماً، وبحلولها يكون مخزون المُسلِّم قد تحرّك.

##### ⚠️ وفحوص `openHandover` **لا تكفي** — المخزون يُعاد فحصه عند التوقيع

هذه أهمّ نتيجة للتأخّر أعلاه، وكانت مفقودة حتى ٢٠٢٦‑٠٨‑١٠. `openHandover`
**يُبطل** أي محضر آخر مفتوح على الأصناف نفسها، فلا يتسابق محضران. لكن ذلك لا
يغلق إلا باباً واحداً — وكل مسارات العهدة الأخرى ما زالت تعمل في الفجوة:
`releaseCustody` تمسح صفوف العهدة، و`QuantityCustodyDialog` تصرف من الرفّ
مباشرةً، وأيٌّ منهما لا يعلم بمحضر ينتظر ذلك المخزون.

فكان الأثر يُطبَّق بلا سؤال، والحساب يتوقّف عن الاتّزان بصمت:

| الحالة       | ما كان يحدث                                                                                                     |
| ------------ | --------------------------------------------------------------------------------------------------------------- |
| صرف من الرفّ | ٣٠ قلماً، محضر بـ٣٠، وصُرفت ٣٠ من مكان آخر ← صفّ عهدة جديد بـ٣٠ = **٦٠ من ٣٠**                                  |
| تحويل        | صفّ المُسلِّم اختفى ← `applyHandoverEffect` **لا يجد ما يُنقصه فيتخطّاه** ويُضيف للمستلِم                       |
| صنف مفرد     | حامله صار غيره، والفهرس الجزئي على `(assetId, teamMemberId)` **يسمح بزوج مختلف** ← شخصان يحملان لابتوباً واحداً |

الحارس `assertHandoverStillApplicable` في `handover.server.ts`، يُستدعى من
`recordHandoverSignature` داخل الترانزاكشن **قبل** `applyHandoverEffect` مباشرةً،
ويحرسه تسعة اختبارات. وثلاث ملاحظات:

- **قواعده مرآةٌ لـ`openHandover` عمداً** — المحضر الذي أمكن فتحه يمكن توقيعه
  ما لم يتغيّر العالم فعلاً. أي تشديد في أحدهما يُنقل إلى الآخر.
- **الرمي يُرجِع الترانزاكشن كلها، والتوقيع معها.** مقصود: محضرٌ تحرّك مخزونه
  لا يُكمَل بناءً على ما كان صحيحاً يوم فُتح. يُفتح من جديد على الوضع الحقيقي.
- **الاسترجاع أضيق فحصاً** — لا يزيد عهدةً أبداً فلا يُنشئ مخزوناً. و«لا يحمل
  شيئاً أصلاً» يمرّ بلا خطأ: شخصٌ أرجعه قبله = تكرار لا تناقض.

**ولا تفصل الحارس عن `applyHandoverEffect` بمنطق آخر بينهما** — الفاصل الزمني
الصفري بينهما داخل الترانزاكشن هو ما يجعله فحصاً لا تخميناً.

⚠️ **الصنف الكمّي الذي في عهدة يمرّ بالمحضر لا بـ`QuantityCustodyDialog`.**
النافذة تكتب العهدة **بلا توقيع إطلاقاً** — تركها لهذه الحالة كان يفتح باباً
يخالف «لازم يوقّع». تبقى للصرف من الرفّ فقط
(`isQtyTracked && !assetCanBeReleased` في `actions-dropdown.tsx`).

⚠️ **التسمية تتبع ما سيُفلّ فعلاً، لا حالة الصنف.** صنفٌ في عهدة يعني «فك
العهدة» للجميع **إلا** موظف الإدارة الذي يملكه مكتبه: هو يُسلّمه لا يفكّه،
والخادم يشتقّ **تسليماً** لا استرجاعاً. فالقائمة تعرض له «تسليم لموظف»،
والنافذة تقول «توقيع الإدارة المسلِّمة» لا «توقيع المستودعات» — المكتب لم يلمس
رفّ مستودع قط، وتسميته مستودعاً تُحرّف المستند.

المصدر `isDepartmentTransfer` من لودر `assets.$assetId.tsx` — يُشتقّ على
الخادم لأن مؤشّر الإدارة على العضوية والعميل لا سبيل له إليه. **زرٌّ يقول
عكس ما يفعله الخادم هو الشكل الذي يجعل الموظف يتردّد قبل الضغط.**

#### المحضر يحمل **عدة أصناف** — لا صنفاً واحداً (٢٠٢٦‑٠٨‑٠٦)

`CustodyHandover.assetId` **حُذف**، وحلّ محلّه الجدول الوسيط
`CustodyHandoverAsset`. السبب: المستودع يسلّم أمر شراء كاملاً لإدارة، والورقة
التي تُوقَّع **مستند واحد يسرد كل السطور**.

**لم يُترك `assetId` بجانب الجدول الوسيط عمداً** — مصدرا حقيقة لشيء واحد هو
بالضبط خطأ `financeCode` الموثّق أدناه. والمحضر ذو الصنف الواحد صار سطراً
واحداً في الجدول الوسيط: مسار واحد، فلا يمكن أن ينحرف مسار الدفعة عن المفرد.

`openHandover` صار يأخذ **`assetIds: string[]`** لا `assetId`. وثلاث قواعد
يحرسها ستة اختبارات:

- **الكل أو لا شيء.** صنفٌ واحد غير صالح يرفض الدفعة كاملةً ولا يسلّم الباقي.
  محضرٌ يسرد أصنافاً أقل مما تحرّك فعلاً لا يكتشفه أحد إلا في الجرد.
- **`applyHandoverEffect` يمرّ على كل سطر** — أثرٌ على السطر الأول وحده يترك
  البقية «متاحة» في النظام وهي في الإدارة فعلاً. وكذلك **ملاحظة لكل صنف**، لأن
  سجلّ الصنف هو حيث يبحث الناس عن «كيف وصل هذا إليه؟».
- **صفحة المحضر تطبع كل السطور لا عددها.** «١٢ صنفاً» ليست شيئاً يوقّع عليه
  إنسان.

**`resolveSignableParty` لم يُمسّ** — لا يقرأ الأصناف أصلاً، فنموذج أمان
التوقيع بقي كما هو حرفياً.

⚠️ **الأصناف تدخل عبر `/receipts` فقط.** `/assets/new` و `/assets/import`
صارا تحويلاً (في الـ`loader` **والـ`action`** — تحويل الـGET لا يمنع POST
معاداً من تبويب قديم). لا تُعِد فتح باب إنشاء ثالث؛ إن احتجت مساراً جديداً
للإدخال فليمرّ عبر `GoodsReceipt`. المبالغ **هللات صحيحة** لا `float`.

⚠️ **وكان البابان الثالث والرابع مفتوحَين حتى ٢٠٢٦‑٠٨‑١٠ — فابحث عن
`createAsset` لا عن أسماء المسارات.** «أغلقنا `/assets/new` و`/assets/import`»
لم يكن يعني أن الإنشاء أُغلق:

| الباب                                | لماذا لم يُلحَظ                                           |
| ------------------------------------ | --------------------------------------------------------- |
| `assets/$assetId/overview/duplicate` | اسمه «تكرار» لا «إنشاء» — وكان زرّاً في قائمة إجراء الصنف |
| `POST /api/v1/assets`                | مسار آلة، ولا أحد يتصفّحه                                 |

وكلاهما كان يُنتج أصنافاً **بلا `receiptLine`**، وهذه بالضبط هي الحالة التي
يعفيها `assertReceiptSignedBeforeApproval` صراحةً (للمخزون السابق للمسار) —
فتمرّ إلى `READY` بلا مورّد ولا أمر شراء ولا سعر ولا تواقيع. أي أن الضوابط
الورقية كان يمكن الالتفاف عليها كاملةً: افتح أي صنف، كرّره عشراً، ثم اعتمدها.

أُغلقا بـ`assertIntakeClosed` (التكرار) و`405` برسالة تدلّ على النماذج
(الـAPI)، وأُزيل مدخل التكرار من `actions-dropdown.tsx`. **`PATCH
/api/v1/assets/:id` لم يُمسّ** — به تُعيد المالية الترميز ولا يُنشئ شيئاً.

**القاعدة المستفادة:** الباب ليس مساراً اسمه `new`. عند مراجعة هذا الضابط
ابحث عن **مستدعي `createAsset` / `bulkCreateAssetsFromModel` /
`createAssetsFrom*Import`** خارج `goods-receipt/service.server.ts`، واسأل عن كل
واحد.

#### ما هو إلزامي في النموذجين — والأهم: ما ليس إلزامياً

الإلزامي (٢٠٢٦‑٠٨‑١٠): **السنة المالية · الجهة · رقم الجهة · المستودع ·
التاريخ · المورد · سعر الوحدة · اسم الصنف · الكمية**، ولكل نموذج **مرجع أمره**:
`purchaseOrderNumber` لنموذج ٢ و `purchaseRequestNumber` لنموذج ٣. وللنموذج ٢
وحده **مجموع الضريبة**.

⚠️ **مرجع الأمر هو الأهم.** `orderNumberOf` يقرأ
`purchaseOrderNumber ?? purchaseRequestNumber`، فنموذجٌ بلا أيّهما لا ينتمي إلى
أمر شراء إطلاقاً: أصنافه تدخل السجل، ولا تظهر تحت أي أمر، ولا تصل طابور ترميز
المالية — توريدة ضائعة على مرأى الجميع بلا ما يشير إلى ذلك.

**فُرض بـ`superRefine` لا بجعل الحقلين إلزاميين**، لأن لكل نموذج واحداً منهما
فقط؛ إلزامهما معاً يجعل كلا النموذجين غير قابل للتعبئة. والـ`path` يوجّه الخطأ
إلى الخانة نفسها لا إلى رأس الصفحة.

**ولماذا الضريبة إلزامية في نموذج ٢:** الخانة الفارغة كانت تُقرأ صفراً **بصمت**،
فالنسيان يُنقص إجمالي مستند موقَّع بمقدار الضريبة بالضبط. الإعفاء حقيقي — لكن
يُكتب ٠. لذلك صار للضريبة قارئ خاص (`optionalRiyalParts`) يميّز «لم تُلمس» عن
«صفر مقصود»؛ بدونه لا يستطيع الفحص أن يعرف الفرق.

**وما يبقى اختيارياً مقصود:**

- **وثيقة الشحن · المعاينة · إشعار الاستلام المؤقت · المستند** — ليست كل توريدة
  لها محضر معاينة أو إشعار مؤقت. إلزامها يجعل النموذج غير قابل للتعبئة.
- ⚠️ **«نوع الصنف» يبقى اختيارياً قطعاً** — القاعدة موثّقة في
  `classification.ts`: إلزام الاختيار يدفع الموظف إلى أقرب نوع شكلاً فيُنتج
  **تصنيفاً محاسبياً خاطئاً بثقة**، وهو أسوأ من تصنيف غائب ظاهر للعيان.
- الوصف · الوحدة · الملاحظات · رقم الصنف التسلسلي.

**الرسائل بالعربية ولكل حقل رسالته** — «مطلوب» مكرّرة سبع عشرة مرة تترك الموظف
يبحث عن أي خانة. وتُستعمل `required_error` **مع** `min(1)`: الخانة الفارغة في
المتصفّح تصل `""`، والخلية الفارغة في **القالب المرفوع** تصل `undefined`،
ولا يغطّيها إلا الأولى.

⚠️ **القالب يجب أن يطلب ما يطلبه الفحص.** وإلا عبّأ الموظف ثمانين سطراً ورفع،
فقيل له إن «المستودع» ناقص — خانة لم تطلبها الورقة أصلاً. يحرسه اختبار يقارن
`headerFieldsFor(...).required` بقائمة الفحص.

⚠️ **ولا تُعلِّم الإلزام بتغيير التسمية.** إضافة «(مطلوب)» إلى نص التسمية
**كسرت كل رفع** — القارئ يطابق نص التسمية حرفياً. العلامة في **اللون وملاحظة في
عمود مجاور**، والتسمية تبقى هي العقد. أمسكه اختبار الذهاب والعودة.

#### ثلاثة أنواع من خانات الترويسة — لا تخلطها

خانات النموذجين ليست صنفاً واحداً، والفرق يحكم أين تُكتب القيمة:

| النوع              | الخانات                       | من يملؤها                   |
| ------------------ | ----------------------------- | --------------------------- |
| **يكتبها الموظف**  | المورد · المستودع · السنة     | الموظف، ولا افتراض لها      |
| **افتراضية**       | الجهة · رقم الجهة             | مُعبّأة مسبقاً، وله تعديلها |
| **يشتقّها النظام** | رقم التسلسل · **عدد الصفحات** | لا خانة لها إطلاقاً         |

**الافتراضية من `config.entity`** في `app/config/shelf.config.ts` — اسم الهيئة
ورقمها كما هما على النموذجين. السبب أن كل نموذج هنا يسمّي الجهة نفسها، وإعادة
كتابتها هي كيف ينتهي مستند موقَّع بـ«هيئة تطوير المنطقة الشرقيه» وآخر بـ«الهيئة»
— ثلاث تهجئات لجهة واحدة في حزمة مستندات رسمية. **`defaultValue` لا `value`**:
افتراضٌ لا قفل. والقالب يُعبّئها في الخلية أيضاً، فالبابان يتفقان.

⚠️ **«عدد الصفحات» سُحبت من الموظف (٢٠٢٦‑٠٨‑١٠).** كانت خانة رقم حرّة يملؤها
**قبل** أن يوجد جدول الأصناف: يكتب «١»، ثم يلصق ثلاثين سطراً، فيُحفظ مستند يقول
صفحة واحدة ويُطبع أربعاً. لا شيء يفحص، والرقم مطبوع على ورقة تُوقَّع وتُحفظ.
القاعدة في `app/modules/goods-receipt/pagination.ts`:

- **`ITEM_LINES_PER_PAGE = 12` مربوط بتخطيط الطباعة** في
  `receipts.$receiptId_.print.tsx`. غيّرت التخطيط ← حرّك الثابت معه.
- **التقريب لأعلى دائماً.** الزيادة نصف صفحة بيضاء، والنقص يُقرأ «صفحة ضائعة».
- **الخادم يحسبها ولا يقبلها** — أُزيلت من `GoodsReceiptSchema` أصلاً، تماماً
  كما أن `itemClass` ليست في `ReceiptLineSchema`. أُثبت بإرسال `pageCount: 99`
  فتجاهله النظام.
- **مخزَّنة لا محسوبة عند القراءة**: يجب أن تبقى كما كانت يوم وُقّع المستند.
  لذلك تغيير الثابت يستلزم ترحيل بيانات — كما في
  `20260810090000_derive_receipt_page_count` الذي صحّح الصفوف القائمة (نموذج من
  سطرين كان يقول ١١ صفحة).

#### قالب الإكسل — بابٌ ثانٍ للتعبئة لا باب ثانٍ للدخول

`/receipts/template/:type` ينزّل قالب `.xlsx` مطابقاً لشكل النموذج الورقي،
و`/receipts/new` يقبله مرفوعاً. توريدة بثمانين سطراً لا تُكتب في متصفّح.

⚠️ **الرفع ليس مساراً موازياً للإنشاء.** `parseTemplateWorkbook` يستخرج القيم
فقط، ثم تمرّ بـ`GoodsReceiptSchema` و`createGoodsReceipt` نفسيهما. مسار رفع
بتحقّق خاص به = باب ثالث للمخزون بقفل مختلف، وهو ما تمنعه قاعدة «الأصناف تدخل
عبر `/receipts` فقط».

**القراءة بالتسمية لا بالإحداثي.** الخانات تُلتقط بمطابقة نصّ التسمية في العمود
الأول، وجدول الأصناف بعنوان «الرقم». قارئٌ يقول «المورد في C7» يفسد عند أوّل من
يُدرج صفاً — وهم يُدرجون.

**والصف المدموج ليس سطر صنف أبداً.** كتلة الإرشادات أسفل الجدول مدموجة بعرض
الورقة، والخلية المدموجة **تُعيد قيمة سيّدها من كل عمود تمتدّ عليه** — فكان كل
رفع يُنتج ستة أصناف وهمية نصّها الإرشادات. يحرسه اختبار.

عمودان زائدان على الورقة الرسمية — **«نوع الصنف»** و**«طريقة التتبّع»** —
مُلوّنان وموسومان «(للنظام)» ليعرف من يقارن القالب بالورقة أيّها منّا. الأول
يقرّر أصل/مادة عبر حد الرسملة، والثاني يقرّر ٥٠٠ سجل أم سجل واحد بكمية ٥٠٠.

والسعر في **خانتَي ريال وهللة** كما في الورقة تماماً: هي الصيغة الوحيدة التي
يقبلها `parseRiyalParts`، فلا يدخل مبلغ مدموج من هنا أيضاً. ومن كتب `4500.5`
في خانة الريال يُنقل كسره إلى خانة الهللة بدل رفضه — الرفض يُقرأ كعطب في القالب.

#### الطباعة قراءة — لا صلاحية لها ولا تُخفى عن أحد

مساران: `/receipts/:id/print` و `/purchase-orders/:orderNumber/print`، كلاهما
`goodsReceipt.read` فقط — أي المستودعات والمالية والمخزون. **لا تضف صلاحية
طباعة**: من يقرأ المستند على الشاشة يقرؤه على الورق، والحاجز الوحيد المعقول هو
حاجز القراءة نفسه. (الموظف بلا `goodsReceipt` أصلاً، وهذا مقصود.)

والزر موجود في **ثلاثة** مواضع لا واحد: صفحة النموذج، صفحة الأمر، **وصفّ كل
منهما في القائمة**. المهمة المتكرّرة «اطبع لي نماذج الأسبوع الماضي» كانت رحلة
دخول وخروج من كل سجل.

اللاحقة `_` في اسم الملف (`$orderNumber_.print`) تُخرج الصفحة من تخطيط الأب.
و`@page` هنا **أفقي (landscape)** بخلاف النموذج: جدول الأصناف ثمانية أعمدة،
والعمودي يضغط عمود «التصنيف» — وهو تحديداً ما تطبعه المالية.

⚠️ **صفحة الطباعة تستدعي `window.print()` تلقائياً**، فأي أداة آلية تفتحها
تتجمّد على حوار الطباعة. للتحقق منها برمجياً استعمل `fetch` واقرأ HTML، لا
تنقّل المتصفح إليها.

#### النموذج الملغى لا يدخل في حساب أي شيء

`state = VOIDED` يعني مستنداً أُلغي، لا صرفاً حدث. لذلك يُستبعد من **إجمالي أمر
الشراء وعدد النماذج وعدد الأصناف وطابور الترميز** جميعاً، ويُذكر منفصلاً
(`voidedReceiptCount`) لأن إجمالياً يُسقط مستنداً بصمت يُقرأ كخطأ حسابي أمام من
يمسك الورق. العَرَض الذي كشفه: أمر `PO-2026-118` كان يعرض «٣ نماذج · ٦ أصناف ·
٣٥٬٥٠٣٫٠٨» وفيها نموذج ملغى بقيمة ١٦٬٩٠١٫٥٨ — صُحّح في ٢٠٢٦‑٠٨‑٠٥.

الأصناف التي أنشأها النموذج الملغى **تبقى** (المخزون وصل فعلاً؛ انظر
`voidGoodsReceipt`)، لكنها تُوسَم `fromVoidedReceipt` في صفحة الأمر ولا تُطلب
للترميز. المورّد وأقدم تاريخ يُحتسبان من النموذج الملغى أيضاً — الأمر حدث،
والملغى ماله وأصنافه فقط. يحرس ذلك `purchase-order.test.ts`.

#### الإلغاء والحذف فعلان مختلفان — بالصلاحية نفسها (٢٠٢٦‑٠٨‑١٢)

كان `goodsReceipt.delete` يعني **الإلغاء وحده**. صار له معنيان، وكلاهما
لـ`goodsReceipt.delete` (المستودعات والمخزون) — لأنهما سلطة واحدة على مستند
واحد، والفارق كم يبقى منه لا مَن يملكه:

| الفعل         | الخدمة                                    | ما يبقى                      |
| ------------- | ----------------------------------------- | ---------------------------- |
| إلغاء نموذج   | `voidGoodsReceipt`                        | المستند + الأصناف            |
| إلغاء أمر     | `voidPurchaseOrder` (يُلغي نماذجه الحيّة) | المستندات + الأصناف          |
| **حذف نموذج** | `deleteGoodsReceipt`                      | **لا شيء** — المستند وأصنافه |
| **حذف أمر**   | `deletePurchaseOrder`                     | **لا شيء**                   |

**«حذف أمر شراء» لا يمكن أن يعني إلا حذف نماذجه** — لا جدول `PurchaseOrder`؛
الأمر هو الرقم المكتوب عليها.

⚠️ **الحارس الوحيد غير القابل للتفاوض: الصنف الذي تحرّك لا يُحذف.** ليس سياسة
بل بنية — `Custody` و`CustodyHandoverAsset` كلاهما `onDelete: Cascade` على
`assetId`:

- صنفٌ في يد أحدهم يختفي من سجلّ العهدة بلا أثر يقول من كان يحمله.
- **ومحضرٌ وقّعه طرفان يحتفظ بتواقيعه ويفقد سطراً بصمت** — مستند موقَّع يسرد
  أصنافاً أقل مما وُقِّع عليه، لا يكتشفه أحد إلا في الجرد.

**والفحص عن الحركة لا عن حالة الورق:** نموذج موقَّع بالكامل لم يغادر مخزونه
الرفّ **يُحذف**، ونموذج غير موقَّع سُلّمت أصنافه **يُرفض**. المهم هل تحمّل أحدٌ
مسؤولية الأصناف، لا ما تقوله الحالة.

⚠️ **وترتيب الحذف مقصود: الأصناف أولاً ثم النموذج.** `Asset.receiptLine` هو
`SET NULL`، فحذف النموذج أولاً **يُيتّم أصنافه** لا يأخذها معه — وصنفٌ بلا
`receiptLine` هو بالضبط الشكل الذي يمرّ من `assertReceiptSignedBeforeApproval`
بلا فحص. يحرسه اختبار يؤكّد الترتيب.

⚠️ **وحذف الأمر يفحص الأمر كلّه قبل أن يمسّ صفّاً.** الحذف نموذجاً نموذجاً مع
ترك كلٍّ يحرس نفسه يترك الأمر نصف ممحوٍّ حين يُرفض الثالث — ولا تراجع.
`assertOrderAssetsHaveNotMoved` تسأل مرة واحدة عن كل أصناف الأمر.

⚠️ **صور التواقيع تبقى في التخزين** يتيمةً في حاوية خاصة. حذفها أولاً يعني أن
فشل نداء تخزين يترك نموذجاً نصف ممحوّ؛ الصفوف هي السجلّ الذي يهمّ.

#### النموذج قد يُحفظ ناقص الأصناف — وله الآن مخرج

الأصناف تُنشأ **بعد** ترانزاكشن النموذج (`createAsset` يولّد معرّفاً متسلسلاً
و QR لكل صنف، وحبس الترانزاكشن لذلك يقفل عدّاد التسلسل على الجميع). فالفشل في
المنتصف يترك نموذجاً محفوظاً بأصناف أقل من أسطره. كان التعليق يقول «قابل
للإصلاح» ولم يكن هناك ما يُصلحه — نموذج في هذه الحالة يبقى ناقصاً للأبد، أي
توريدة وُقِّعت على الورق ولم يدخل مخزونها النظام إطلاقاً. (وُجد فعلاً:
`EPDA-RCV-2026-0001`، موقَّع بالكامل و صفر أصناف.)

`materializeReceiptItems` **مُصدَّرة ومتكرّرة الاستدعاء بأمان** (تتخطّى كل سطر
أنتج أصنافاً)، ولها مدخلان:

- **عند التوقيع**: تُستدعى قبل ترقية النموذج إلى `SIGNED` — آخر فرصة قبل أن
  يصير المستند نهائياً. تفشل ← يبقى `SAVED` ولا يُرقّى.
- **زر «استكمال إنشاء الأصناف»** في صفحة النموذج (`intent=materialize`،
  صلاحية `goodsReceipt.update`) — المخرج الوحيد لنموذج وُقِّع **قبل** أن يكتشف
  النقص.

وصفحة النموذج تعرض النقص صراحةً («أُنشئ N من أصل M»)، لأن عدّاد السطر وحده لا
يُقرأ كخطأ إلا لمن يحسب `BULK ? 1 : quantity` ذهنياً.

#### التصنيف أصل/مادة والترميز — قواعد لا تُخمَّن

`سعر الوحدة > حد الرسملة لنوع الصنف ← أصل`، وإلا مادة. الحدود في
`app/modules/goods-receipt/capitalization.ts` (مركبات ١٠٬٠٠٠ · الباقي ١٬٠٠٠)،
ويحرسها اختبار يثبّت الجدول كاملاً — **تغيير حدّ يستلزم تعديل الاختبار**، لأنه
سياسة محاسبية لا إعداد يُضبط عرضاً.

- **«تتعدى» = أكبر تماماً.** الصنف **على** الحدّ مادة. `>=` كانت سترسمل كل
  مكتب بألف ريال. اختباران على الحافة يحرسانها.
- **سعر الوحدة لا مجموع السطر** — ثلاثة لابتوبات بـ٤٬٥٠٠ ثلاثةُ أصول.
- **بلا نوع = `null` لا مادة.** الافتراض كان سيشطب أصولاً بصمت.
- **النموذج يعرض النتيجة بنفس دالة الخادم** — لا يُعرض جواب ويُخزَّن آخر.
- `ItemCategory` **ليس** جدول `Category` الحرّ: اختراع نوع = اختراع حدّ رسملة.

**الترميز `asset.update`** لا `goodsReceipt.update` — الرقم يقع على الصنف لا على
المستند. المواد **تُرفض** بـ400. لا صيغة ولا تفرّد (قرار ٢٠٢٦‑٠٧‑٢٧).

⚠️ **الترميز في `Asset.financeCode` وحده — لا في حقل مخصّص.** كان حقل مخصّص
باسم «ترميز الاصل» يحمل الغرض نفسه، فصار للرقم مكانان لا يعرف أحدهما الآخر:
صنف رُمِّز من أحدهما يُقرأ غير مرمَّز من الآخر. العَرَض: صفحة الصنف تقول
«غير محدَّد» بينما المالية رمّزته فعلاً. وُحِّدا في ٢٠٢٦‑٠٨‑٠٥ لصالح العمود
(مفهرس بفهرس جزئي يقود طابور المالية، ويفرض «الأصول فقط»)، والحقل المخصّص
**عُطِّل ولم يُحذف** بترحيل ينسخ ولا يستبدل.

**الدرس:** قبل إضافة عمود لمفهوم من مفاهيم العمل، **ابحث في `CustomField`**
أولاً — الحقول المخصّصة يصنعها المستخدمون والوكلاء الآخرون بلا ترحيل، فلا
تظهر في المخطط ولا في الكود.

**الازدواج الثاني حُسم باللغة لا بالحذف (٢٠٢٦‑٠٨‑٠٥).** حقل مخصّص اسمه
«الرقم التسلسلي» (فارغ، صفر قيم) مقابل `Asset.sequentialId` الذي يحمل
`SAM-xxxx`. الحقلان **ليسا** الشيء نفسه على الأرجح: عمود النظام معرّف داخلي
مولَّد، والحقل المخصّص أنشأه أحدهم لرقم المصنّع التسلسلي — والمشكلة أن
الاسمين متطابقان، فيقرأ المستخدم رقمين مختلفين تحت عنوان واحد. الحل: الحقل
المخصّص **لم يُمَسّ** (لا حذف ولا تعطيل لبيانات لم نفهم الغرض منها)، وعناوين
الأعمدة الجديدة صارت **«المعرّف المتسلسل»** — وهي الصيغة التي تستعملها
`settings.sequentialIdsEnabled` أصلاً. لا تُسمِّ عموداً جديداً «الرقم
التسلسلي».

**أوامر الشراء مشتقّة لا مخزَّنة** (`/purchase-orders`): لا جدول
`PurchaseOrder`؛ الأمر هو الرقم المكتوب في النموذج. `orderNumberOf` هو المكان
الوحيد الذي يقرّر أي حقل هو رقم الأمر.

#### شارتا التسليم بين المالية والمستودعات (٢٠٢٦‑٠٨‑١١)

الترميز والاعتماد **تتابُع**: المالية ترمّز، ثم المستودعات تعتمد. ولا طرف يعرف
أن العصا سُلِّمت إليه — المالية كانت تفتح كل أمر شراء بحثاً عن غير المرمَّز،
والمستودعات تعود إلى الشاشات نفسها تنتظر ظهور الأرقام. فتبقى توريدة مكتملةً
غير مُفرَج عنها بلا ما يقول ذلك.

شارة على **«الأصناف»** و**«الأصناف بأوامر الشراء»** في القائمة الجانبية، من
`getAssetActionQueue` في `app/modules/asset/action-queue.server.ts`:

| الجانب     | الشارة تقول                           | الشرط                                            |
| ---------- | ------------------------------------- | ------------------------------------------------ |
| المالية    | «لديك N أصلاً لم تُرمَّز بعد»         | `itemClass = ASSET` · بلا ترميز · نموذج غير ملغى |
| المستودعات | «لديك N صنفاً تم ترميزها ولم تُعتمَد» | `PENDING` · **مرمَّز** · نموذج غير ملغى          |

⚠️ **الفاصلة ليست الدور بل `asset.approve`.** المستودعات تملك `asset.update`
أيضاً، فـ`update` وحدها لا تميّز المالية. القاعدة: **من يستطيع الاعتماد فهو
الطرف المستقبِل** ويأخذ شارة الاعتماد؛ ومن يستطيع التعديل ولا يستطيع الاعتماد
يأخذ شارة الترميز — وهم المالية بالضبط. المخزون لا يملك `update` فلا يرى شيئاً.

⚠️ **يعمل هذا في لودر `_layout` — أي على كل تحميل صفحة مصادَقة.** لذلك
العدّادان **مشروطان بالصلاحية داخل الخدمة نفسها**: الموظف الذي لا يرمّز ولا
يعتمد لا يدفع ثمن أي استعلام. لا تُلغِ هذا الشرط.

⚠️ **شارة الاعتماد تعدّ المرمَّز فقط** — صنفٌ ما زال ينتظر المالية ليس عبء
المستودعات، وإظهاره يجعل الشارة رقماً لا يستطيعون التصرّف فيه. **ونتيجةً لذلك
المواد لا تظهر في شارة الاعتماد إطلاقاً** (لا تُرمَّز أصلاً)، فمادةٌ معلَّقة لا
يعلن عنها شيء. مقصود بحسب الصياغة المطلوبة — راجعه إن ظهرت مواد عالقة.

**والشارة تحمل جملتها لا رقمها فقط**: `badge.label` تُعرض `title` و`aria-label`،
لأن رقماً عارياً في قائمة جانبية لا يقول عن ماذا هو.

#### الاعتماد على مستوى الأمر — مقفلٌ حتى يكتمل الترميز (٢٠٢٦‑٠٨‑١٠)

زر **«اعتماد N صنفاً وإتاحتها»** في صفحة الأمر ينقل كل أصنافه المعلَّقة إلى
`READY` دفعةً واحدة. و**لا يعمل حتى ترمّز المالية كل أصول الأمر** —
`getOrderApprovalState` و `approveOrderAssets` في `purchase-order.server.ts`.

**لماذا هذا الترتيب:** الاعتماد هو ما يضع الصنف في التداول، وقد يُسلَّم لإدارة
في اليوم نفسه. ملاحقةُ رقم ترميز لصنفٍ صار على مكتب أحدهم أسوأ بكثير من إسنادِه
والتوريدة ما زالت في المستودع.

ثلاثة استثناءات من القفل، وكلها متعمَّدة:

- **المواد لا تُحتسب إطلاقاً** — لا تُرمَّز أصلاً، فانتظارها يقفل الأمر للأبد.
- **أصناف النموذج الملغى مستبعَدة من العدّادين** — كما هي مستبعَدة من الإجمالي
  ومن طابور الترميز؛ تركُها تمنع الاعتماد هو الخطأ نفسه في موضع جديد.
- **`itemClass: null` لا يمنع** — بلا تصنيف لا ترميز مستحقّ، و`setAssetFinanceCode`
  ترفضه صراحةً، فعدُّه انتظارٌ لشيء يرفضه النظام.

⚠️ **القفل مفروضٌ في الخدمة لا في الزر.** الزر يُعطَّل (ولا يُخفى — الإخفاء يترك
المستودع يتساءل أين ذهب)، لكن `approveOrderAssets` تُعيد الفحص عند كل استدعاء:
حالة الصفحة قديمة بقِدَم آخر تحميل، وقد تكون المالية مسحت ترميزاً في تبويب آخر.
و**الأصناف تُشتقّ من رقم الأمر على الخادم ولا تُؤخذ من النموذج** إطلاقاً.

⚠️ **والترميز الممسوح يصل `""` لا `null`** — الفحص يسأل عن الاثنين. اختبارٌ يحرسه.

#### `approveAssetsByIds` — أثر الاعتماد في موضع واحد

`app/modules/asset/approve.server.ts`. ثلاثة أبواب تستدعيه: إجراء الفهرس الجماعي
(`bulkApproveAssets` صارت **غلافاً** يحلّ التحديد ثم يمرّره)، وصفحة الأمر، ولاحقاً
أي باب جديد. الأثر واحد: `READY` + `availableToBook: true` + بوابة التواقيع
الثلاثة (`assertReceiptSignedBeforeApproval`) + ملاحظة لكل صنف.

**وحدةٌ مستقلّة لا جزءٌ من `asset/service.server.ts`** — للسبب نفسه الموثّق في
`receipt-gate.server.ts`: خدمة أوامر الشراء تحتاجه، والوصول إليه عبر خدمة الأصول
يجعل ملفاً تستورده مئةُ مسار اعتماديةً لطبقة الاستلام. والدورة عبر ذلك الملف
**لا تكسر البناء** بل تُنتج `undefined` وقت التشغيل.

#### بوابة التواقيع تحرس **الأبواب الثلاثة** — لا اثنين (سُدّت ٢٠٢٦‑٠٨‑١٠)

`assertReceiptSignedBeforeApproval` تُستدعى الآن من:

| الباب                        | من أين                                      |
| ---------------------------- | ------------------------------------------- |
| الفهرس (اعتماد جماعي)        | `bulkApproveAssets` ← `approveAssetsByIds`  |
| أمر الشراء (اعتماد الدفعة)   | `approveOrderAssets` ← `approveAssetsByIds` |
| **صفحة الصنف (اعتماد مفرد)** | `updateAssetLifecycleStage` مباشرةً         |

**الثالث كان مفتوحاً**: `updateAssetLifecycleStage` لم تكن تستدعي البوابة إطلاقاً،
بينما تعليق النسخة الجماعية يزعم أنها «المعبر الوحيد الذي تمرّ به كل الاعتمادات —
إجراء الفهرس، وصفحة الصنف، وأي مستدعٍ لاحق». فالصنف نفسه يُرفض من الفهرس ويُعتمد
من صفحته. **ضابطٌ تفرضه شاشة ولا تفرضه أخرى ليس ضابطاً.**

⚠️ **والإرجاع للمراجعة يبقى بلا بوابة عمداً** — هو _تضييق_ يسحب الصنف من التداول،
وربطُه بتوقيع يحبس صنفاً اعتُمد خطأً في المكان الذي يجب ألا يبقى فيه.

يحرسه `app/modules/asset/lifecycle-stage.test.ts` — **بملف منفصل عن
`service.server.test.ts`** لأن الأخير كان غير قابل للتشغيل وقت الكتابة (يستورد
خدمة المجموعات التي كانت تُحذف في تغيير مواز)، وقاعدةٌ تحكم ما يدخل التداول لا
يصحّ أن تصير غير قابلة للتحقّق لأن وحدةً أخرى تحت الهدم.

#### `lifecycleStage` و `availableToBook` — حقلان لا يُدمجان

يبدوان مترادفين وليسا كذلك، والخلط بينهما يقود إلى «لنحذف أحدهما»:

|         | `lifecycleStage`            | `availableToBook`                            |
| ------- | --------------------------- | -------------------------------------------- |
| السؤال  | هل دخل الصنف التداول أصلاً؟ | هل يُحجز زمنياً؟                             |
| يحكم    | الرؤية + الحجز + **العهدة** | **الحجز فقط** — مسار العهدة لا يفحصه إطلاقاً |
| الطبيعة | بوابة تُعبر مرة             | خاصية دائمة                                  |

الحالة التي تُبرِّر بقاء `availableToBook`: صنف معتمَد وظاهر وقابل للتسليم
عهدةً لكنه **لا يُحجز** — طابعة مثبّتة، أو لابتوب عهدة دائمة. حذفه يجعل كل
صنف تعتمده المستودعات يدخل بركة الحجز قسراً بلا استثناء ممكن.

**الربط المعتمد (٢٠٢٦‑٠٨‑٠٥):** الاعتماد `PENDING → READY` يضبط
`availableToBook = true` **في نفس الكتابة**، في `updateAssetLifecycleStage`
و `bulkApproveAssets` معاً (لأن للاعتماد مدخلين، ويجب ألا ينتجا صنفين
مختلفين). وثلاث قواعد تحكم هذا الربط:

- **أثرٌ لمرة واحدة لا قفل.** المفتاح يبقى صالحاً بعد الاعتماد — وهناك اختبار
  يثبّت ذلك تحديداً، لأن تحويله إلى قفل يُلغي حالة الاستثناء أعلاه.
- **الإرجاع للمراجعة لا يمسّ `availableToBook`.** المرحلة تحجب كل شيء أصلاً،
  ومسحه كان سيُلغي قراراً متعمَّداً للمستودعات بصمت.
- **الملاحظة تذكر الأثر صراحةً** — الحقل يتغيّر بلا أن يلمس أحدٌ مفتاحه، فلا
  بد أن يشرح سجل الصنف سبب انقلابه.

والمفتاح **مخفي على الأصناف `PENDING`** في صفحة الصنف: هناك هو بلا أثر
(المرحلة تمنع الحجز)، وظهوره كان يقرأ كنسخة ثانية متناقضة من لوحة الاعتماد
فوقه. يظهر بعد الاعتماد حيث يصير الرافعة الوحيدة الباقية.

**النمط المشترك بينها — اتبعه في أي سير عمل جديد:** الحالة تُضاف كحقل مستقل
لا كقيمة جديدة في enum قائم (`AssetStatus` / `BookingStatus` يُفحصان `switch`
فحصاً شاملاً في عشرات المواضع، وتوسيعهما يغيّر كل واحد منها بصمت). المنع
يُفرض في **الاستعلام وطبقة الخدمة**، لا بإخفاء الزر. والترحيل يُبقي الصفوف
القائمة على الحالة القديمة حتى لا يتجمّد النظام بأثر رجعي.

### الإعدادات المركزية و API الخارجي — محصورة بأدمن النظام

📖 **اقرأ [apps/docs/epda-admin-api-and-settings.md](./apps/docs/epda-admin-api-and-settings.md)
قبل أي تعديل على الإعدادات أو مفاتيح API.**

**تمييز جوهري:** هذه الطبقة تُحرَس بـ `requireAdmin` (`Roles.ADMIN` على مستوى
النظام) **لا** بـ `userHasPermission` ولا بدور مساحة عمل. مالك مساحة العمل
(`OWNER`) لا يصلها. السبب: إعدادات المصادقة تُقرأ في شاشة الدخول قبل وجود سياق
مساحة عمل أصلاً، ومفتاح API يعمل بلا جلسة.

- الصفحتان تحت `routes/_layout+/admin-dashboard+/` (`settings` · `integrations`).
- **`requireAdmin` يُكرَّر في لودر كل صفحة** رغم وجوده في التخطيط الأب — المسار
  الابن يُجلَب مباشرةً عند التنقّل من العميل وعبر `.data`، فوراثة بوابة الأب
  **لا تكفي**.
- **السجلّ مصدر الحقيقة لا الجدول**: `app/modules/app-settings/registry.ts`
  يعرّف أي الإعدادات موجودة؛ مفتاح غير مسجَّل يُتجاهَل قراءةً ويُرفَض كتابةً.
  إضافة إعداد = مدخل في السجلّ ولا شيء غيره.
- **فخّ النائب**: النموذج يعيد `••••••••` للأسرار التي لم تُلمس؛ `updateSettings`
  يتخطّاها. إزالة ذلك تمسح كل سرّ عند أول حفظ — هناك اختبار يحرسه.
- **الجدولان**: `AppSetting` (مفتاح/قيمة، غير مرتبط بمساحة عمل — إعدادات
  المصادقة تُقرأ في شاشة الدخول قبل وجود سياقها) و `ApiKey`.
- **رمز API لا يُخزَّن** — بصمة SHA-256 فقط. يُعرض مرة واحدة عند الإنشاء.
- **`/api/v1/*` لا يقبل `organizationId` من الطلب إطلاقاً** — المفتاح يحدّد
  مساحة العمل. أي وسيط كهذا يفتح تسرّباً عابراً للمنظمات.
- **حارس الإقفال**: تعطيل دخول كلمة المرور لا يُطبَّق على أدمن النظام أبداً،
  وإلا أقفل تكاملُ دليلٍ مضبوطٍ خطأً الحسابَ اللازم لإصلاحه.

### صفحات الموظف والقائمة الجانبية

القائمة مقسّمة حسب **لمن هو القسم**، وكل عنوان قسم يحمل نفس شرط ظهور أبنائه
حتى لا يبقى عنوان فوق فراغ (`app/hooks/use-sidebar-nav-items.tsx`):

- **خدماتي** (الجميع): الأصناف المتاحة · الأصناف في عهدتي
- **المخزون** (`!isScopedToOwnRecords`): الأصناف · المواقع · التصنيفات
- **العمليات**: الجرد · التذكيرات · التقارير
- **الفريق** (`teamMember.read`): المستخدمون · الإدارات · أعضاء غير مسجّلين ·
  الدعوات المعلّقة

⚠️ **الوسم يحكم ما بعده، فقسمٌ بلا وسم يُبتلع في القسم السابق.** حُذف وسم
«المنظمة» في ٢٠٢٦‑٠٨‑١٣ فسقطت «الفريق» تحت «العمليات» للمستودعات وتحت «خدماتي»
للإدارة — تُقرأ عمليةً مرةً وخدمةً شخصية مرة. أي قسم جديد يأخذ وسمه أو يرث وسم
جاره بصمت.

**وإعدادات مساحة العمل أُزيلت كاملةً في ٢٠٢٦‑٠٨‑١٣** — الشاشات الأربع
(`settings.general` · `custom-fields` · `asset-models` · `emails`) وقائمتها،
مع `settings.index` يوجّه إلى `team`. السبب: هيئة واحدة بمساحة عمل واحدة،
والتصنيفان (`CustomField` · `AssetModel`) **صفر صفّ** ولا يمسّهما مسار الاستلام.

⚠️ **طبقة البيانات باقية عمداً** — `CustomField` في ٧٨ ملفاً و `AssetModel` في
٥١، منسوجةً في الاستيراد والتصدير والفهرس المتقدّم. حذفها **تغييرُ سلوك** لا
تنظيف. ولذلك **أُعيدت شاشات `settings.asset-models.*` بعد حذفها**: نموذج تعديل
الصنف يُنشئ طرازاً مباشرةً عبرها (`inline-entity-creation-dialog`)، فحذفُها
يجعل ذلك الزر يردّ 404. هي خارج القائمة الجانبية ومقصودةٌ كنقطة نهاية للحوار.

عناصر «الحجوزات» و«الطلبات» و«التقويم» و«إعدادات الحجز» أُزيلت مع نظام الحجز
(٢٠٢٦‑٠٨‑٠٦)، و«المجموعات» و«الوسوم» أُزيلا معهما في ٢٠٢٦‑٠٨‑١١.
و«الأصناف المتاحة» **مرشَّحة للإزالة** لأن الموظف لم يعد يطلب لنفسه — الإدارة
تبادر بالتسليم.

فهرس `/assets` **مخفيٌّ عن الموظف** — سطح تصفّح للمخزون كله لا يستطيع أن يفعل
فيه شيئاً، وقد غطّته «الأصناف المتاحة». المسار ما زال يعمل بالرابط (مسح QR،
الروابط داخل الصفحات).

#### صفحة الهبوط تتبع الدور — لا تكتب `/assets` ثابتاً

كانت **كل** مداخل الدخول تحوّل إلى `/assets` بلا استثناء (١٢ موضعاً: الدخول،
`/`، OTP، OAuth/SSO، الانضمام، استعادة كلمة المرور)، فيهبط الموظف على الصفحة
التي تُخفيها عنه قائمته الجانبية أصلاً — يفتح النظام على مخزون لا يملك فيه
إجراءً. صُحّح في ٢٠٢٦‑٠٨‑٠٥.

المصدر الوحيد الآن `app/utils/landing-route.server.ts`:

- `resolveLandingRoute(roles)` — دالة نقية: المقيّد بسجلاته → `/my-custody`،
  وغيره → `/assets`. مشتقّة من `rolesAreScopedToOwnRecords` **لا** من قائمة
  أدوار مكتوبة يدوياً، فالدور الجديد يرث صفحة الموظف افتراضياً.
- `getLandingRouteForUser({ userId, request })` — تقرأ الدور من
  `getSelectedOrganization` وهي **بلا استعلام إضافي**: نفس الاستدعاء الذي
  يجريه المسار أصلاً لضبط كوكي المنظمة يعيد `userOrganizations` بأدوارها.

قاعدتان عند إضافة مدخل دخول جديد:

- **استعمل المساعد، ولا تكتب مساراً ثابتاً.**
- **`redirectTo` الصريح يسبق المساعد دائماً** — المستخدم الذي طُرد من رابط
  عميق عند انتهاء جلسته يجب أن يعود إليه، لا إلى صفحة هبوطه.

يحرسه `app/utils/landing-route.test.ts`، وفيه الخاصية المهمة: **الدور غير
المعروف يهبط على صفحة الموظف** — فشلٌ مغلق كبقية النظام.

### مزالق هندسية مكلّفة — اقرأها قبل أن تكرّرها

**‑١. ⚠️ حذف الصنف كان يُفرِغ المحاضر الموقّعة بصمت — والقاعدة تشهد على ذلك.**
`Custody` و`CustodyHandoverAsset` كلاهما `onDelete: Cascade` على `assetId`.
كان `deleteGoodsReceipt` وحده يحرس ذلك، بينما **`deleteAsset` و
`bulkDeleteAssets` — وهما حيث يحذف المخزون فعلاً — بلا أي فحص**. فيبقى المحضر
بتواقيعه ويفقد سطراً، ولا شيء يُبلِّغ.

**ليست نظرية:** وُجد في قاعدة التطوير **٦ محاضر `COMPLETED` بتوقيعين وصفر
أسطر** — أُنتجت بهذه الطريقة بالضبط. والتعليق فوق الحذف الجماعي كان يذكر أن
الحذف «يتتالى على العهدة» دون إدراك النتيجة.

الحارس الآن في وحدة واحدة: `app/modules/asset/movement-guard.server.ts`
(`assertAssetsHaveNotMoved`)، يستدعيه المساران قبل الحذف. يأخذ **مقطع `where`**
لا قائمة معرّفات، فيخدم أي تحديد (أسطر نموذج، أمر شراء كامل، معرّفات صريحة)
ويبقى تعريف «تحرّك» في مكان واحد. و`organizationId` يُفرض بعد الـspread فلا
يستطيع مستدعٍ توسيعه.

⚠️ **ومحاكي الاختبار خدعني هنا:** `bulkDeleteAssets` يستدعي `asset.findMany`
**مرتين** (الصفوف، ثم الحارس)، و`mockResolvedValue` واحد يجيب الاثنين — فيقرأ
الحارس الصفوف نفسها «متحرّكة» ويرفض. المحاكي يجب أن يفرّق بشرط `where.OR`؛
انظر `mockAssetsForBulkDelete` في `service.server.test.ts`.

**٠. ⚠️ `<Header>` كان يبتلع أزراره بصمت — والعَرَض «الزر غير موجود».**
كان جسمه `return header ? … : null` أي يقرأ `header` من **بيانات اللودر** لا من
خصائصه. فصفحةٌ تكتب `<Header title="…">…أزرار…</Header>` ولا يُعيد لودرها مفتاح
`header` **لا ترسم شيئاً إطلاقاً**: لا عنوان ولا أزرار، بلا خطأ ولا تحذير.

كانت شاشتان حيّتان في هذه الحالة: **صفحة نموذج الاستلام** (طباعة · إلغاء ·
حذف) و**فهرس النماذج** (نموذج جديد). صُلح في ٢٠٢٦‑٠٨‑١٣ بجعل الشرط
`!!header || !!title || !!children`.

**الدرس الأهم:** لم يكشفه `tsc` ولا ٢٥٠٠ اختبار — تمرير الخصائص صحيحٌ تماماً،
ومفتاح اللودر غير مرئي من موضع الاستدعاء. **كشفه فتحُ الصفحة في المتصفح.** أي
ادّعاء عن «الزر موجود» يُثبَت بفتح الصفحة لا بقراءة الملف.

⚠️ **وأثرٌ جانبي متوقَّع عند الإصلاح:** أزرارٌ كانت مخفيّة بالعطب ظهرت — ومنها
زرّ **«نموذج جديد»** الذي لم يكن محروساً بصلاحية أصلاً، فظهر للمخزون الذي لا
يملك `goodsReceipt.create`. **حين تُصلح إخفاءً، افحص ما ظهر.**

**١. لاحقة `.client.ts` تكسر العرض على الخادم.** مُلحق React Router يستبدل كل
صادرات الوحدة بـ `undefined` في حزمة الخادم. أي مكوّن يُعرض على الخادم ويستدعيها
يرمي `TypeError: X is not a function` ويُسقط المستند بخطأ 500 صامت. الدوال
النقية (صلاحيات، مساعدات) تعيش في وحدة محايدة —
`permission.validator.ts` و `custody-and-bookings-permissions.validator.ts`.
**لا تُعِد حاجب SSR في `_layout.tsx`**؛ إن كسر فحصُ صلاحيةٍ العرضَ فالإصلاح في
الوحدة.

النسختان القديمتان بلاحقة `.client` **حُذفتا** (٢٠٢٦‑٠٨‑٠٥) بعد أن بقيتا
إعادة تصدير بلا مستوردين. لا تُنشئ بديلاً عنهما: وجود المسار المكسور وحده
دعوة لاستيراده مجدداً وإعادة الخطأ 500 نفسه. **فحص الصلاحية ليس عميلاً فقط.**

**١ب. والعكس أيضاً: دالة نقية داخل `.server.ts` تُسقط اختبارها.** استيراد
الوحدة يُنشئ عميل Prisma، فيحاول الاتصال ويفشل بـ`P1001` على أي جهاز بلا
Postgres، **ويتسرّب الرفض غير المُلتقط إلى ملف اختبار آخر يلومه Vitest**.
حدث في `landing-route.test.ts` رغم أنه لا يستدعي إلا `resolveLandingRoute`
النقية. الحل نفسه في الاتجاه المعاكس: النقي في وحدة محايدة
(`landing-route.ts`) والاستعلام في `.server.ts` تُعيد تصديره — كما في
`custody/handover.ts`. **إن رأيت `Can't reach database server` في اختبار
وحدة، فالخلل في الاستيراد لا في الاختبار الذي سُمّي.**

**٢. `dateStyle` و `timeStyle` يتعارضان مع الخيارات المفصّلة في Intl.**
`getDateTimeFormatFromHints` تحقن `{year, month, day}` افتراضياً، ومزجها مع
`dateStyle` يرمي `TypeError: Invalid option` **أثناء العرض** فيُسقط المسار كله.
الحارس يفحص الاختصارين معاً الآن — لكن انتبه للنمط في أي مُنسِّق جديد.

**٣. عميل Prisma لا يُولَّد تلقائياً.** بعد أي تعديل على المخطط:
`pnpm db:deploy-migration` ثم **`rm -rf apps/webapp/node_modules/.vite`**
**ثم أعِد تشغيل خادم التطوير** — Vite يحتفظ بنسخة مُحسَّنة مسبقاً من
`@prisma/client` فتبقى القيم القديمة (`undefined` للتعدادات الجديدة) تُقدَّم
حتى بعد التوليد.

**٣د. ⚠️ فهرسٌ في القاعدة وغير مُعلَن في المخطط = بريزما تحذفه في أوّل ترحيل
قادم — أيّاً كان موضوعه.** هذا أخطر مزلق في الترحيلات هنا لأنه **صامت**: تكتب
ترحيلاً عن جدول ألف، فيخرج لك `DROP INDEX` عن جدول باء لم تلمسه.

وقع فعلاً في ٢٠٢٦‑٠٨‑٠٦: ترحيل دور `DEPARTMENT` وُلّد وفيه حذف **أربعة** فهارس
لا علاقة لها به — `Asset_financeCodedById_idx` و `Asset_receiptLineId_idx`
(يقودان طابور المالية) و `Location_address_trgm_idx` و
`Location_description_trgm_idx` (بحث المواقع). أنشأتها ترحيلات يدوية سابقة ولم
تُعلَن في `schema.prisma`، فرأتها بريزما انحرافاً.

**آلية `PROTECTED_INDEXES` لا تحميك** — فيها مدخل واحد (`_AssetToTag_asset_idx`)
ولم تكن تشمل أياً من الأربعة.

**العلاج الدائم: أعلِن الفهرس في المخطط، لا تُرقّع الترحيل.** الفهرس المُعلَن
والموجود = صفر فرق = لا جملة تُولَّد أصلاً. والفهارس الثلاثية (`gin_trgm_ops`)
تُعلَن كبقيتها — انظر `Location_name_trgm_idx`:

```prisma
@@index([address(ops: raw("gin_trgm_ops"))], type: Gin, name: "Location_address_trgm_idx")
```

**ولّد الترحيل دائماً بـ`--create-only` واقرأ الـSQL سطراً سطراً قبل تطبيقه.**
وانتبه أيضاً لمفتاحين أجنبيين متعمَّد عدم إعلانهما (`BookingAsset_assetKitId_fkey`
و `ConsumptionLog_bookingAssetId_fkey`) — بريزما تحذفهما بالمنطق نفسه؛ انزعهما
من ترحيلك ما لم تكن تقصدهما.

**٣هـ. الترحيل الذي ينقل بيانات: بريزما ترتّبه خطأً.** ترحيل ٢٠٢٦‑٠٨‑٠٦ نفسه
ولّد `DROP COLUMN "assetId"` **قبل** إنشاء الجدول الوسيط الذي يُفترض أن يستقبل
قيمه — أي أنه كان سيمسح ربط كل محضر بأصنافه. الترتيب الصحيح المكتوب يدوياً:
أنشئ الوجهة ← `INSERT ... SELECT` ← ثم احذف المصدر. لا تثق بترتيب الـdiff حين
يكون في التغيير نقلُ بيانات.

**٣ج. `supabase/seed.sql` لا يعمل إلا عند `supabase db reset`.** إضافة حاوية
تخزين إليه **لا تُنشئها** في قاعدة بيانات قائمة. العَرَض: كل شيء يبدو سليماً
حتى أول رفع، فيظهر «تعذّر حفظ صورة التوقيع» ولا شيء في السجلّات يقول إن
الحاوية أصلاً غير موجودة.

وقع هذا فعلاً في ٢٠٢٦‑٠٨‑٠٥ على حاويتين معاً: `custody-signatures`
(محاضر التسليم) و `goods-receipt-signatures` (نماذج الاستلام) — كلتاهما
معلَنة في `seed.sql` وغير موجودة في القاعدة. أي أن نظام التواقيع كله كان
معطَّلاً بلا أن يشير شيء إلى السبب.

بعد إضافة أي حاوية إلى `seed.sql`، أنشئها في القاعدة القائمة أيضاً:

```sql
insert into storage.buckets (id, name, public)
values ('<اسم-الحاوية>', '<اسم-الحاوية>', false)
on conflict (id) do nothing;
```

رسالة الخطأ في `goods-receipt/service.server.ts` تسمّي الحاوية الآن حين يبدو
أنها مفقودة. **رسالة صديقك في `custody/handover.server.ts` ما زالت عامة**
(«could not be stored… try again») — وهي نصيحة عديمة الجدوى لعطل لا تُصلحه
الإعادة.

**٣و. ⚠️ حذفتَ `JOIN` من SQL خام؟ ابحث عن اسمه المستعار في `GROUP BY` أيضاً.**
المترجم **لا يرى داخل `Prisma.sql`** إطلاقاً، فالمرجع اليتيم يمرّ من typecheck
ومن ٢٦٠٠ اختبار، ثم ينفجر عند Postgres وحده.

وقع في ٢٠٢٦‑٠٨‑٠٦: حُذفت وصلات الحجز (`b` / `bu` / `btm`) من
`buildAdvancedAssetsQuery` وبقيت في `GROUP BY`. العَرَض المخادع: **صفحة
`/assets` تنكسر لبعض المستخدمين فقط** («عذراً، حدث خطأ ما» +
`Failed to fetch paginated and filterable assets`) — لأن المسار الخام يعمل في
الوضع **`ADVANCED`** وحده، و`AssetIndexSettings.mode` **لكل مستخدم على حدة**.
المالية والمخزون كانا `ADVANCED` فانكسرت لهما، والمستودعات والأدمن `SIMPLE`
فعملت لهما. لا تستنتج «المشكلة في الصلاحيات» من هذا النمط — افحص وضع الفهرس.

⚠️ **ووقع مرتين، والثانية أهمّ من الأولى (٢٠٢٦‑٠٨‑١١).** الأسماء الثلاثة نفسها
(`b`/`bu`/`btm`) كانت ما تزال في **`CUSTODY_SORT_CASE`**، وهو لا يُحقَن إلا حين
يكون الفرز **بالعهدة** نشطاً. اختبار ٢٠٢٦‑٠٨‑٠٦ كان يبني **استعلاماً واحداً
بالفرز الافتراضي**، فالشكل المكسور لم يُولَّد أصلاً وبقيت الاختبارات خضراء
بينما `?sortBy=custody:asc` يُعيد 500.

**الدرس الحاكم: التأكيد على استعلام واحد لا يغطّي إلا الفروع التي سلكها ذلك
الاستعلام.** أي شرط في بناء SQL (`sortBy`، `hasSearch`، `withBarcodes`، وجود
مرشِّح) يضاعف الأشكال الممكنة، والاختبار يجب أن يكنسها كلها. الاختبارات الآن
تفعل ذلك: أربعة تأكيدات × ٣٢ شكلاً، وفيها **فحص عام** يستخرج كل
`<alias>.<column>` ويطالب بأن يكون له `FROM`/`JOIN` — وهو ما كان سيمسك
الحادثتين بلا أن يفكّر أحد في الاسم بعينه.

⚠️ **و`query.server.ts` ليس الملف الوحيد.** `bulk-operations-helper.server.ts`
يبني وصلاته بنفسه لنفس `whereClause`، وكان فيه عطبان صامتان: وصلتا الوسوم،
و`LEFT JOIN "Location" l ON a."locationId"` — و`Asset.locationId` استُبدل بمحور
`AssetLocation` قبل ذلك بكثير. أي أن **كل عملية جماعية بـ«تحديد الكل» كانت
تفشل** (تسعة مواضع استدعاء). عند تعديل `generateWhereClause` أو أي وصلة، افحص
**كلا الملفين** — هما المستهلكان الوحيدان لذلك الشرط.

**وللتشخيص — نفّذ الاستعلام لا تقرأه فقط.** المِسبار الذي كشف الثلاثة: استورد
`buildAdvancedAssetsQuery` + `generateWhereClause` + `parseSortingOptions`،
ولّد كل شكل فرز، ومرّره على `db.$queryRaw` مقابل القاعدة الحقيقية:

```bash
pnpm exec dotenv -e ../../.env -- tsx probe.ts   # من apps/webapp
```

⚠️ **و`orderByInner` نصّ (`string`) لا `Prisma.sql`.** تمريره `Prisma.sql`
يُنتج `ORDER BY [object Object]` وخطأً وهمياً عند `[` يضيّع وقتك — خذه من
`parseSortingOptions(sortBy)` كما يفعل المستدعي الحقيقي.

**٣ز. ⚠️ والأخطر: `include` في Prisma **ليس** محميّاً بالمترجم حين يمرّ بغلاف
عامّ.** هذا ليس SQL خاماً — كود مكتوب بأنواع، ومع ذلك يمرّ فيه اسم علاقة
محذوفة بلا أي خطأ.

السبب: `getAsset<T extends Prisma.AssetInclude>` يستنتج `T` من الكائن الحرفي
نفسه، فيتخطّى TypeScript فحص «الخصائص الزائدة» الذي كان سيطبّقه على وسيط عادي.
والدليل القاطع: `db.asset.findFirst({ include: { bogus: true } })` **يُخطئ**،
وتمرير الحرفيّ نفسه عبر الغلاف **يُترجَم نظيفاً**. بريزما ترفضه **وقت التشغيل
فقط**.

فشحن `assetKits: { … }` في **ثلاثة لودرات حيّة** بعد إسقاط المجموعات — عبر
typecheck و lint و٢٥٠٠ اختبار وبناء إنتاج — وانكسرت كل صفحة صنف. **والعَرَض
يخدع تماماً**: «Asset not found · does not exist or you do not have permission»،
فيُقرأ صفّاً مفقوداً أو مشكلة صلاحيات، والمُلتقِط العامّ في `getAsset` هو من
يعيد كتابة كل سبب إلى هذه الرسالة الواحدة.

**جُرِّب تشديد النوع وأُلغي**: الصيغ التي تفرض التطابق
(`T & { [K in Exclude<…>]: never }` و `Exact<T, Shape>`) تكسر الاستنتاج — يرتدّ
`T` إلى القيد فلا يُمسك شيء، ويبدأ نداءٌ مشروع بالفشل. **لا تُعِد المحاولة.**

القاعدتان بدلاً منه:

- **كل `include` للأصناف يُصدَّر من `modules/asset/fields.ts` ويُضاف إلى
  `FIELD_SETS` في `fields.test.ts`.** الاختبار يمشي على `Prisma.dmmf` فلا
  يحتاج صيانة عند تغيّر المخطط، لكن **الـ`include` المتروك مضمَّناً في اللودر
  لا يراه ولا يحميه**.
- **تحقّق بالتشغيل لا بالبحث النصّي.** البحث عن الاسم خذل مرتين هنا: `grep`
  عن `assetKits` كان يعطي عشرات النتائج في تعليقات وأسماء أعمدة، فيغرق الحيّ
  منها في الضجيج. المِسبار الذي كشفها نفّذ استعلام كل لودر على القاعدة فعلاً.

**٣ب. لا تستورد قيم تعدادات Prisma في أي وحدة تصل المتصفح.**
`import { GoodsReceiptType } from "@prisma/client"` يعمل في الخادم و**قيمته
`undefined` في حزمة المتصفح** (الويب‑آب يوجّه `.prisma/client/index-browser`
في بناء العميل). الأعراض **صامتة ومكلفة**: الوحدة ترمي
`Cannot read properties of undefined` أثناء تحميل React Router للمسار، فيُلغى
التنقّل ويبقى المستخدم على الصفحة السابقة **بلا أي رسالة خطأ** — لا في الواجهة
ولا في صفحة الخطأ. شُخِّص هذا فعلياً من `console` المتصفح لا من الخادم، لأن
العرض من الخادم (SSR) و`.data` كلاهما ينجح.

القاعدة:

- **القيم** تُستورد من وحدة ثوابت محايدة (مثل
  `app/modules/goods-receipt/enums.ts`) تكتب القيم نصوصاً صريحة مع
  `satisfies Record<PrismaEnum, PrismaEnum>` — فإضافة عضو للمخطط بلا تحديثها
  **تكسر البناء** بدل أن تُفاجئ زمن التشغيل.
- **الأنواع** تُستورد عادياً بـ `import type` (تُمحى عند البناء فلا تكلّف شيئاً).
- الوحدات `*.server.ts` وحدها تستورد التعدادات الحقيقية.

ينطبق على المكوّنات، والوحدات المحايدة، **ونصف المسار الذي يُعرض في العميل**
(`assets.new.tsx` كان قد التفّ على هذا يدوياً بـ `const AssetLifecycleStage = {…}`).

**٣ج. `X._index.tsx` بلا `X.tsx` أب يُنتج مساراً مكسوراً في العميل.**
`remix-flat-routes` يُخرج عندها مدخلاً يحمل `path` و`index` معاً وأبوه
`_layout` بلا مسار. في React Router يعني `index: true` «طابِق مسار الأب
تماماً»، فيُطابَق ضدّ `/` لا ضدّ `/X` — العرض من الخادم ينجح (يُطابق الإعداد
المسطّح حيث يبقى `path`) بينما **التنقّل من العميل لا يجد تطابقاً**. أضِف دائماً
`X.tsx` أباً يعرض `<Outlet/>` كما في `assets.tsx` و`receipts.tsx`.

**٤. صفحة الخطأ تخبرك بمصدر العطل.** `ErrorContent` يعرض رسالة اللودر الحقيقية
إن كان الخطأ من اللودر؛ فظهور النص العام «حدث خطأ غير متوقّع» يعني **خطأ عرض
خام**. استخدم هذا للتشخيص قبل التخمين، وافحص `/route.data` لترى حمولة اللودر
مباشرةً.

**٥. ⚠️ الشاشة تُرشِّح والتصدير لا يُرشِّح — عطبٌ صامت بامتياز.** كان مسار
التقارير الثلاثة (الشاشة · CSV · PDF) يقرأ المرشِّحات **كلٌّ على حدة**، فقرأتها
الشاشة وتوقّف التصديران: يُرشِّح الموظف الجرد على موقع واحد، يضغط «تصدير»، فيخرج
له **كل** أصول مساحة العمل — بلا خطأ ولا تنبيه، وباسم ملف يقول إنه التقرير
المرشَّح. ومسار الـPDF كان يقرأ الـsearch params تحت تعليق `// Parse filters`
ثم لا يستعملها إطلاقاً. صُحّح في ٢٠٢٦‑٠٨‑٠٩.

القاعدة: **قراءة المرشِّحات في وحدة واحدة** — `app/modules/reports/filters.ts`
— يستدعيها الثلاثة. والترقيم (`page`/`pageSize`) وحده خارجها، لأنه الشيء الوحيد
الذي تختلف فيه الشاشة عن التصدير اختلافاً مشروعاً.

وقاعدتان تحرسهما الاختبارات:

- **دالة قارئة لكل تقرير بنوعها الصريح، لا `Record<string, unknown>` واحدة.**
  النسخة الموحّدة تُترجَم بنجاح ثم **تُسقط `timeframe` صامتةً** عند النشر في
  وسائط مكتوبة — القيم `unknown` لا تخبر المترجم بشيء.
- **الغائب `undefined` لا `[]`.** المصفوفة الفارغة تصل إلى `in` في Prisma فتعني
  «لا تُطابق شيئاً»، فيتحوّل تقريرٌ بلا مرشِّح إلى تقرير فارغ. و`?categories=`
  (ما تُرسله قائمة أُفرغت) يجب أن يُقرأ «بلا مرشِّح».

**العَرَض الذي تبحث عنه:** عدد صفوف الملف المصدَّر = عدد كل السجلات مهما غيّرت
المرشِّحات.

**٦. `/api/public-stats` و `/api/oss-friends` حُذفا (٢٠٢٦‑٠٨‑٠٩).** كانا في
`publicPaths` أي **بلا مصادقة**، مع `Access-Control-Allow-Origin: *` وتخزين
أسبوع: الأول ينشر عدد أصول الهيئة وعدد مستخدميها للإنترنت المفتوح، والثاني
يجلب من `formbricks.com` وهو تسويقٌ لـshelf.nu لا شأن للهيئة به. **لا تُعِد
مساراً عاماً يعدّ صفوفاً.** وحُذف معهما `calendarFeedRateLimit` ومدخل
`/api/calendar/feed/*path` — مسار التقويم أُزيل مع نظام الحجز وبقيت بوابته
مفتوحة على لا شيء.

**٧. كل تتبّع خارجي حُذف (٢٠٢٦‑٠٨‑١٠) — ولا تُعِد واحداً.** نظام داخلي لهيئة
حكومية لا يبثّ سلوك موظفيه إلى طرف ثالث، وأربعتها كانت أدوات نموّ لمنتج SaaS
لا شأن للهيئة بها:

| المحذوف                  | ما كان يفعله                                                |
| ------------------------ | ----------------------------------------------------------- |
| Microsoft Clarity        | تسجيل جلسات وخرائط حرارة لكل صفحة                           |
| Cloudflare Web Analytics | إحصاء زيارات                                                |
| Crisp                    | دردشة دعم shelf.nu — كان زرّ «تواصل معنا» يفتح صندوقهم      |
| PostHog                  | أحداث قمع التحويل (`signup_completed`, `upgrade_completed`) |

حُذفت معها متغيّرات البيئة السبعة (`MICROSOFT_CLARITY_ID`, `CRISP_WEBSITE_ID`,
`CLOUDFLARE_WEB_ANALYTICS_TOKEN`, `POSTHOG_API_KEY`, `POSTHOG_HOST`,
`FORMBRICKS_ENV_ID`, `FULL_CALENDAR_LICENSE_KEY`) وثلاث حزم. **`getBrowserEnv`
كان يشحن مفاتيحها إلى المتصفح** — فكل متغيّر تضيفه هناك يصير عاماً.

⚠️ **الأثر الجانبي المفيد:** `Sentry` و`Logger` باقيان — الأول تتبّع أخطاء
والثاني سجلّ خادم، وكلاهما تشخيص لا تتبّع سلوك. لا تحذفهما مع الموجة.

**٨. الحزم المحذوفة (٢٠٢٦‑٠٨‑١٠) — تحقّق قبل أن تعيد واحدة.** سبع حزم
`@fullcalendar/*` (رحلت مع التقويم)، و `crisp-sdk-web` و `posthog-node` و
`react-microsoft-clarity` (التتبّع أعلاه)، و `detectrtc` و `react-dropzone` و
`prosemirror-gapcursor` و `prosemirror-transform` و `pino-pretty` و `cookie`
و `cross-env` و `nodemailer-mock` — كلها كانت **بصفر استيراد** في الشجرة.

⚠️ **`<style data-fullcalendar />` في `root.tsx` كان أثراً يتيماً** بقي بعد
حذف الحزم. أي عنصر في `root.tsx` مربوط بمكتبة تحذفها لن يشير إليه المترجم —
افحصه بالعين.

**٩. ⚠️ `/api/stripe-webhook` في `publicPaths` — مسار مفتوح بلا مصادقة.**
موجود في `server/index.ts` ويستقبل طلبات من الإنترنت لخدمة دفعٍ لا تستعملها
الهيئة. لم يُغلق بعد لأن سطح Stripe **ليس كوداً ميتاً**: ٨٥ ملفاً متشابكة مع
نظام `tier` الذي **يبوّب ميزات مستعمَلة فعلاً** (إضافة الجرد `audits`، إضافة
الباركود). حذفه بلا تخطيط **يقفل ميزات** لا ينظّف.

عند معالجته: أغلق المسار العام أولاً (تعديل صغير مستقلّ)، ثم قرّر مصير `tier`
بوصفه قراراً تصميمياً — أتُفتح الإضافتان للجميع أم يبقى التبويب بلا Stripe؟

**١٠. ⚠️ بوابة تخطيطٍ أبٍ أضيق من أبنائها = عنصر قائمة يردّ 403 دائماً.**
`/settings` كان لودره يطلب `generalSettings.read` بينما شريط تبويباته مبنيٌّ
**لكل قسم على حدة** (تعليقه نفسه يسمّي المخزون كمن يرى «الحقول المخصّصة» وحدها).
فلم يصل أحدٌ غير أدمن مساحة العمل إلى المكوّن أصلاً. والعَرَض في القائمة
الجانبية: «الفريق» تُعرض على `teamMember.read` — يملكها **المستودعات والمالية
والمخزون والإدارة** — وضغطُها يردّ _Unauthorized_ للأربعة جميعاً.

الحلّ `requireAnyPermission` في `roles.server.ts`: تدخل إن ملكتَ **أياً** من
صلاحيات الأقسام، ويبقى كل ابن يحرس نفسه. والقائمة مصدرها واحد الآن —
`app/modules/settings/sections.ts` — يقرؤه اللودر وشريط التبويبات معاً.

**القاعدة:** إن كان المسار الأب مجرّد حاوية (`<Outlet/>` وشريط تبويبات) فبوابته
**اتحاد** بوابات أبنائه لا واحدة منها بعينها. واختبر بالنقر لا بالقراءة:
`tsc` والاختبارات لا ترى تناقضاً بين شرط إظهار عنصر القائمة وحارس المسار.

⚠️ **وسقط مع الإصلاح تبويب «الحجوزات»** — كان يشير إلى `/settings/bookings`،
وهو مسار أُزيل مع نظام الحجز فكان يسقط في صفحة «غير موجود».

**١٠ب. قائمة المستخدم (أعلى/أسفل الشريط) نُظّفت في ٢٠٢٦‑٠٨‑١٣.** أُزيل
**«الاشتراكات»** — وكان **العنصر الوحيد هناك بلا شرط**، بينما تبويبه داخل
`/account-details` خلف `enablePremium`، فتُعلن القائمة شاشةً تُخفيها الصفحة.
⚠️ **ومسارات Stripe نفسها باقية عمداً** — متشابكة مع `tier` الذي يبوّب الجرد
والباركود (مزلق ٩). حذفتُ `components/subscription` مرة فانكسر البناء في ١١
موضعاً، فاسترجعتُها: **الزر وحده يُزال، لا الطبقة.**

وصفحة الحساب هبطت من أربعة تبويبات إلى قسم واحد: **«التقويمات» لم يكن له مسار
أصلاً** (`/account-details/calendars` غير موجود — رحل مع الحجز)، و«مساحات
العمل» بلا معنى لمساحة واحدة. وفي **«الملف الشخصي»** كان تبويب **«Bookings»**
يشير إلى مسار محذوف، وتبويباته مكتوبة إنجليزية حرفية (`"Assets"`/`"Notes"`).

⚠️ **وزلّة تستحقّ التسجيل:** إضافة مفتاح ترجمة بإعادة كتابة الـJSON برمجياً
(`json.dumps`) أسقطت **١٠٤٧ مفتاحاً** من `ar.json` و٩٠٧ من `en.json` بصمت —
و`tsc` وحده كشفها (مفاتيح غير موجودة في النوع المستنتج). **أدرِج السطر نصّياً
وتحقّق من العدد قبل وبعد.**

**١١. صفحة «غير موجود» كانت تردّ 200.** المسار الشامل `app/routes/$.tsx` بلا
لودر، فيُعرض المحتوى الصحيح بحالة نجاح — لكل مسار محذوف (`/kits`، `/tags`،
`/bookings`، `/calendar`) ولكل رابط مكتوب خطأً. أي أن كل مراقب توفّر أو زاحف
روابط أو عميل API يقرأ الحالة كان يرى نجاحاً. أُضيف
`export function loader() { return new Response(null, { status: 404 }); }` —
**يُعاد ولا يُرمى**، لأن الرمي يسلّم الطلب لحدّ الخطأ ويضيّع الصفحة الودّية.

### المصادقة

- دخول محلي بالإيميل وكلمة المرور فقط. `DISABLE_SIGNUP="true"` و
  `DISABLE_SSO="true"` في `.env`.
- تكامل Azure AD (Entra ID) جاهز بنيوياً — التفعيل إعدادات فقط بدون كود.
  📖 [apps/docs/epda-azure-entra-sso.md](./apps/docs/epda-azure-entra-sso.md).

### التشغيل المحلي

قاعدة البيانات والمصادقة عبر Supabase محلي (Docker) — لا خدمات خارجية:

```bash
supabase start          # يحتاج Docker Desktop شغالاً
pnpm webapp:setup       # migrations
pnpm webapp:seed:epda   # سوبر أدمن + مستخدمَين تجريبيين
pnpm webapp:dev
```

إعدادات Supabase في `supabase/config.toml`، وحاويات التخزين في
`supabase/seed.sql`. الحسابات التجريبية في
`apps/webapp/scripts/seed-epda-users.ts`.

#### ⚠️ «User not found» على كل صفحة = سكيما `public` فُرِّغت، والحساب لم يُفرَّغ

العَرَض: تسجّل الدخول بنجاح، ثم **كل** صفحة مصادَقة تعرض «User not found ·
The user you are trying to access does not exist». الرسالة تُغري بأن الخلل في
المستخدم أو في الصلاحيات، وليس كذلك.

السبب أن **الحسابات تعيش في سكيمتين**: `auth.users` (يملكها Supabase) و
`public."User"` (تملكها Prisma). أي شيء يمسح سكيما `public` — `pnpm db:reset`،
أو `DROP SCHEMA` يدوي، أو `db push --force-reset` — **لا يمسّ `auth.users`**.
فتبقى جلسة المتصفح صالحة تماماً وتشير إلى صفّ مستخدم لم يعد موجوداً، ويرمي
`getUserByID` في لودر `_layout`.

**شخّصه باستعلام واحد** قبل أن تقرأ سطر كود:

```bash
docker exec supabase_db_shelf-epda psql -U postgres -d postgres -tAc \
  'SELECT (SELECT count(*) FROM "User") AS public_users, (SELECT count(*) FROM auth.users) AS auth_users;'
```

`0 | 7` تعني هذه الحالة بالضبط. العلاج `pnpm webapp:seed:epda`.

⚠️ **والبذرة كانت عاجزة عن إصلاحها حتى ٢٠٢٦‑٠٨‑١١** — احتياطي
«الحساب موجود مسبقاً» في `ensureAuthAccount` كان يبحث في `db.user` أي في
**السكيما الفارغة نفسها**، فلا يجد شيئاً ويرمي «Failed to create auth account».
صار يبحث في `auth.users` عبر `listUsers` ويُعيد ضبط كلمة المرور المعروفة.

**والمعرّفات تُعاد لا تُولَّد**: الحسابات القديمة في `auth.users` تُلتقط بمعرّفاتها
نفسها، فجلسة المتصفح المفتوحة تعمل بعد البذر مباشرةً بلا إعادة تسجيل دخول.
ولهذا **لا تحذف صفوف `auth.users` اليتيمة** لتبدأ من نظيف — الحذف يبطل كل جلسة
قائمة بلا فائدة.

**والبذرة موصولة بـ`migrate reset` منذ ٢٠٢٦‑٠٨‑١٢** عبر `migrations.seed` في
`packages/database/prisma.config.ts`، فـ`pnpm db:reset` يُعيد البذر تلقائياً
ولا يترك التطبيق في هذه الحالة. تقع الحالة الآن فقط حين تُمسح البيانات بطريق
آخر (حذف يدوي، سكربت تنظيف). **لا تنزع هذا الربط** — بدونه كل reset يُنتج
تطبيقاً معطوباً برسالة لا تدلّ على السبب.

⚠️ **و`prisma migrate reset` يحجبه Prisma على الوكلاء**: يرفض التنفيذ ويطلب
موافقة صريحة من المستخدم عبر `PRISMA_USER_CONSENT_FOR_DANGEROUS_AI_ACTION`.
لا تتجاوزه. لاختبار إعداد البذرة بلا هدم استعمل `prisma db seed` — يشغّل الأمر
نفسه المُعرَّف في `migrations.seed` دون أن يمسّ صفّاً واحداً.

#### ⚠️ `P3005` من `webapp:setup` أو `db:deploy-migration` — والقاعدة سليمة

العَرَض: `The database schema is not empty` رغم أن كل شيء يعمل. السبب أن جدول
`_prisma_migrations` **غير موجود**: القاعدة بُنيت بـ`db push` أو بتطبيق SQL
مباشرةً، فلا تاريخ ترحيلات فيها، و`migrate deploy` يرفض الكتابة على سكيما
مأهولة لا يعرف حالتها. سُوّي في ٢٠٢٦‑٠٨‑١١ بـ**baseline**: تسجيل الترحيلات
الـ٢٧٦ مطبَّقةً، فصار `deploy` يمرّ ويطبّق الجديد فقط.

⚠️ **لا تُسوِّها بـ`db:reset`** — يمسح البيانات ويوقعك في حالة «User not found»
أعلاه. وقبل أي baseline **أثبت أن القاعدة فعلاً في حالة آخر ترحيل**، وإلا
سجّلت كذباً يظهر بعد شهر كترحيل يفشل في المنتصف:

```bash
# يجب أن يكون الفرقان متطابقين — وهنا: مفتاح ConsumptionLog وحده (متعمَّد)
pnpm --filter @shelf/database exec prisma migrate diff \
  --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url "$DIRECT_URL" --script
pnpm --filter @shelf/database exec prisma migrate diff \
  --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script
```

**البصمة هي SHA‑256 لملف `migration.sql` حرفياً** — هكذا يمكن تسجيل الدفعة
كاملةً بـ`INSERT` واحد بدل ٢٧٦ استدعاءً للـCLI. وفخّان:

- **`ON CONFLICT DO NOTHING` لا يمنع التكرار** — المفتاح الأساسي `id` (وهو
  UUID تولّده أنت) لا `migration_name`. فترحيل سُجِّل سابقاً بـ`migrate resolve`
  يصير صفّين.
- **الحَكَم هو `prisma migrate status` لا عدّ الصفوف.** بصمة واحدة خاطئة
  يُبلَّغ عنها فوراً كـ«modified after applied». وللتأكّد أن `deploy` لم يصر
  صامتاً: أضف ترحيلاً وهمياً، طبّقه، تحقّق أن الجدول أُنشئ، ثم أزِله.
