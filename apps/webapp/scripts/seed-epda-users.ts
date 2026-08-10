/**
 * EPDA seed script — هيئة تطوير المنطقة الشرقية
 *
 * Creates the initial accounts for the internal deployment:
 *   1. Super admin  : admin@epda.local      (app-wide ADMIN role + workspace OWNER)
 *   2. Test user 1  : user1@epda.local      (workspace BASE member)
 *   3. Test user 2  : user2@epda.local      (workspace BASE member)
 *   4. Warehouse    : warehouse@epda.local  (WAREHOUSE — المستودعات)
 *   5. Finance      : finance@epda.local    (FINANCE — المالية)
 *   6. Inventory    : inventory@epda.local  (INVENTORY — المخزون)
 *   7. Facilities   : facilities@epda.local (DEPARTMENT — إدارة المرافق)
 *
 * Accounts 4-7 exist so each operational role can be exercised end to end
 * without hand-editing `UserOrganization.roles` in the database.
 *
 * There is no IT account: تقنية المعلومات are the workspace's system
 * administrators and run on `admin@epda.local`. Both department *desks*
 * (إدارة المرافق, إدارة تقنية المعلومات) are seeded as `TeamMember` rows so the
 * warehouse can hand a purchase order to either.
 *
 * All three share one TEAM workspace: "هيئة تطوير المنطقة الشرقية".
 * Asset index settings are created lazily by the app on first visit, so they
 * are intentionally not seeded here.
 *
 * Usage (from the monorepo root, with .env configured):
 *   pnpm --filter @shelf/webapp seed:epda
 *
 * Idempotent: re-running skips accounts/workspace that already exist.
 *
 * @see {@link file://./../app/modules/user/service.server.ts} for the
 *      app's runtime user-creation flow this script mirrors.
 */
/* eslint-disable no-console */
import { OrganizationRoles, Roles } from "@prisma/client";
import { createDatabaseClient } from "@shelf/database";
import { createClient } from "@supabase/supabase-js";

// Env is injected by dotenv-cli (see the `seed:epda` npm script)
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE, DATABASE_URL } = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !DATABASE_URL) {
  console.error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE / DATABASE_URL in .env",
  );
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const db = createDatabaseClient();

const WORKSPACE_NAME = "هيئة تطوير المنطقة الشرقية";

/**
 * Department desks — `TeamMember` rows that hold custody but are not people.
 *
 * The warehouse hands a whole purchase order to one of these in a single
 * signed محضر; the department then hands single assets on to its own staff.
 *
 * Adding a third department is a row here plus a user pointed at it. No enum
 * value, no migration, no permission-map edit — which is the whole reason
 * `DEPARTMENT` is generic rather than named `FACILITIES`.
 */
const FACILITIES_DEPARTMENT = "إدارة المرافق";
const IT_DEPARTMENT = "إدارة تقنية المعلومات";
const DEPARTMENTS = [FACILITIES_DEPARTMENT, IT_DEPARTMENT] as const;

/** Accounts to seed. Change passwords after first login! */
const ACCOUNTS = [
  {
    email: "admin@epda.local",
    password: "Epda@Admin#2026",
    username: "epda-admin",
    firstName: "مدير",
    lastName: "النظام",
    isSuperAdmin: true,
    // OWNER for the workspace, DEPARTMENT so the same account can also receive
    // and sign for إدارة تقنية المعلومات. Owner-only would leave the IT desk
    // with nobody able to sign its محاضر — the batch would stall forever.
    //
    // Holding both does NOT let one person sign both halves: a named
    // counterparty takes that slot and returns (see `resolveSignableParty`),
    // so the warehouse half still needs a warehouse officer.
    orgRoles: [OrganizationRoles.OWNER, OrganizationRoles.DEPARTMENT],
    department: IT_DEPARTMENT,
  },
  {
    email: "user1@epda.local",
    password: "Epda@User1#2026",
    username: "epda-user1",
    firstName: "مستخدم",
    lastName: "تجريبي ١",
    isSuperAdmin: false,
    orgRoles: [OrganizationRoles.BASE],
  },
  {
    email: "user2@epda.local",
    password: "Epda@User2#2026",
    username: "epda-user2",
    firstName: "مستخدم",
    lastName: "تجريبي ٢",
    isSuperAdmin: false,
    orgRoles: [OrganizationRoles.BASE],
  },
  {
    email: "warehouse@epda.local",
    password: "Epda@Warehouse#2026",
    username: "epda-warehouse",
    firstName: "موظف",
    lastName: "المستودعات",
    isSuperAdmin: false,
    orgRoles: [OrganizationRoles.WAREHOUSE],
  },
  {
    email: "finance@epda.local",
    password: "Epda@Finance#2026",
    username: "epda-finance",
    firstName: "موظف",
    lastName: "المالية",
    isSuperAdmin: false,
    orgRoles: [OrganizationRoles.FINANCE],
  },
  {
    email: "inventory@epda.local",
    password: "Epda@Inventory#2026",
    username: "epda-inventory",
    firstName: "موظف",
    lastName: "المخزون",
    isSuperAdmin: false,
    orgRoles: [OrganizationRoles.INVENTORY],
  },
  {
    email: "facilities@epda.local",
    password: "Epda@Facilities#2026",
    username: "epda-facilities",
    firstName: "موظف",
    lastName: "المرافق",
    isSuperAdmin: false,
    orgRoles: [OrganizationRoles.DEPARTMENT],
    // Links this user to the إدارة المرافق desk row created below. Without it
    // the account holds the role but points at no department, and sees nothing.
    department: FACILITIES_DEPARTMENT,
  },
  // No separate IT account: تقنية المعلومات are the workspace's system
  // administrators, so they run on `admin@epda.local` — which is why that
  // account carries `DEPARTMENT` and points at the IT desk above.
] as const;

/** Creates (or finds) the Supabase auth account and returns its id. */
async function ensureAuthAccount(email: string, password: string) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!error) return data.user.id;

  // Already exists → look it up so the script stays idempotent
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) return existing.id;

  throw new Error(
    `Failed to create auth account for ${email}: ${error.message}`,
  );
}

async function main() {
  // 1. Master data: make sure both app-wide roles exist
  await db.role.upsert({
    where: { name: Roles.USER },
    update: {},
    create: { name: Roles.USER },
  });
  await db.role.upsert({
    where: { name: Roles.ADMIN },
    update: {},
    create: { name: Roles.ADMIN },
  });

  // 2. Users
  const created: { id: string; email: string; isSuperAdmin: boolean }[] = [];

  for (const account of ACCOUNTS) {
    const existing = await db.user.findUnique({
      where: { email: account.email },
    });
    if (existing) {
      console.log(`= ${account.email} already exists — skipping`);
      created.push({
        id: existing.id,
        email: existing.email,
        isSuperAdmin: account.isSuperAdmin,
      });
      continue;
    }

    const authId = await ensureAuthAccount(account.email, account.password);

    const user = await db.user.create({
      data: {
        id: authId,
        email: account.email,
        username: account.username,
        firstName: account.firstName,
        lastName: account.lastName,
        // Skip the onboarding wizard for seeded accounts
        onboarded: true,
        roles: {
          connect: account.isSuperAdmin
            ? [{ name: Roles.USER }, { name: Roles.ADMIN }]
            : [{ name: Roles.USER }],
        },
      },
    });

    console.log(`+ created ${account.email} (${account.orgRoles[0]})`);
    created.push({
      id: user.id,
      email: user.email,
      isSuperAdmin: account.isSuperAdmin,
    });
  }

  // 3. Shared TEAM workspace owned by the super admin
  const admin = created.find((u) => u.isSuperAdmin);
  if (!admin) throw new Error("Super admin account was not created");

  let org = await db.organization.findFirst({
    where: { name: WORKSPACE_NAME },
  });

  if (!org) {
    org = await db.organization.create({
      data: {
        name: WORKSPACE_NAME,
        type: "TEAM",
        currency: "SAR",
        userId: admin.id,
        hasSequentialIdsMigrated: true,
        /**
         * Barcodes are a paid add-on upstream, so `Organization.barcodesEnabled`
         * defaults to `false` and is normally flipped by the Stripe webhook. This
         * deployment runs with `ENABLE_PREMIUM_FEATURES=false` and no billing, so
         * nothing would ever flip it: the asset label panel would offer the QR
         * code only, and the "+" button would open the upgrade dialog instead of
         * the add-barcode form.
         */
        barcodesEnabled: true,
        barcodesEnabledAt: new Date(),
      },
    });
    console.log(`+ created workspace "${WORKSPACE_NAME}"`);
  }

  /** Idempotent repair for workspaces seeded before the flag above existed. */
  if (!org.barcodesEnabled) {
    org = await db.organization.update({
      where: { id: org.id },
      data: { barcodesEnabled: true, barcodesEnabledAt: new Date() },
    });
    console.log(`= enabled barcodes for "${WORKSPACE_NAME}"`);
  }

  // 4. Department desks. Created before the accounts below because a
  //    DEPARTMENT user's membership points at one of these rows.
  const departmentIdByName = new Map<string, string>();
  for (const name of DEPARTMENTS) {
    let desk = await db.teamMember.findFirst({
      where: { name, organizationId: org.id, isDepartment: true },
      select: { id: true },
    });
    if (!desk) {
      // `userId` stays null: a desk is not a person. `TeamMember.userId` has
      // always been optional precisely so non-user members can hold custody.
      desk = await db.teamMember.create({
        data: { name, organizationId: org.id, isDepartment: true },
        select: { id: true },
      });
      console.log(`+ created department "${name}"`);
    }
    departmentIdByName.set(name, desk.id);
  }

  // 5. Attach every account to the workspace (role + team member row)
  for (const account of ACCOUNTS) {
    const user = created.find((u) => u.email === account.email);
    if (!user) continue;

    const departmentTeamMemberId =
      "department" in account
        ? departmentIdByName.get(account.department) ?? null
        : null;

    await db.userOrganization.upsert({
      where: {
        userId_organizationId: { userId: user.id, organizationId: org.id },
      },
      // Re-running must repair a membership that predates the department
      // columns: without the roles here, an admin seeded before IT became a
      // receiving desk keeps `[OWNER]` and can never sign its محاضر. The seed
      // declares the intended state, so re-applying it is the point.
      update: { departmentTeamMemberId, roles: [...account.orgRoles] },
      create: {
        userId: user.id,
        organizationId: org.id,
        roles: [...account.orgRoles],
        departmentTeamMemberId,
      },
    });

    const teamMember = await db.teamMember.findFirst({
      where: { userId: user.id, organizationId: org.id },
    });
    if (!teamMember) {
      await db.teamMember.create({
        data: {
          name: `${account.firstName} ${account.lastName}`,
          userId: user.id,
          organizationId: org.id,
        },
      });
    }
  }

  console.log("\nSeed complete. Accounts:");
  for (const account of ACCOUNTS) {
    console.log(`  ${account.email}  /  ${account.password}`);
  }
  console.log("\n⚠ غيّر كلمات المرور بعد أول تسجيل دخول.");
}

main()
  .catch((cause) => {
    console.error(cause);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
