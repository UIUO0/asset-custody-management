/**
 * ORG seed script — جهة حكومية
 *
 * Creates the initial accounts for the internal deployment:
 *   1. Super admin  : admin@example.local      (app-wide ADMIN role + workspace OWNER)
 *   2. Test user 1  : user1@example.local      (workspace BASE member)
 *   3. Test user 2  : user2@example.local      (workspace BASE member)
 *   4. Warehouse    : warehouse@example.local  (WAREHOUSE — المستودعات)
 *   5. Finance      : finance@example.local    (FINANCE — المالية)
 *   6. Inventory    : inventory@example.local  (INVENTORY — المخزون)
 *   7. Facilities   : facilities@example.local (DEPARTMENT — إدارة المرافق)
 *
 * Accounts 4-7 exist so each operational role can be exercised end to end
 * without hand-editing `UserOrganization.roles` in the database.
 *
 * There is no IT account: تقنية المعلومات are the workspace's system
 * administrators and run on `admin@example.local`. Both department *desks*
 * (إدارة المرافق, إدارة تقنية المعلومات) are seeded as `TeamMember` rows so the
 * warehouse can hand a purchase order to either.
 *
 * All three share one TEAM workspace: "جهة حكومية".
 * Asset index settings are created lazily by the app on first visit, so they
 * are intentionally not seeded here.
 *
 * Usage (from the monorepo root, with .env configured):
 *   pnpm --filter @shelf/webapp seed:org
 *
 * Idempotent: re-running skips accounts/workspace that already exist.
 *
 * @see {@link file://./../app/modules/user/service.server.ts} for the
 *      app's runtime user-creation flow this script mirrors.
 */
/* eslint-disable no-console */
import { randomBytes } from "node:crypto";

import { OrganizationRoles, Roles } from "@prisma/client";
import { createDatabaseClient } from "@shelf/database";
import { createClient } from "@supabase/supabase-js";

// Env is injected by dotenv-cli (see the `seed:org` npm script)
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

const WORKSPACE_NAME = "جهة حكومية";

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

/**
 * Seed passwords are generated per run, never hardcoded.
 *
 * ⚠️ A literal here is a published credential the moment the repo is public —
 * and worse, a fixed pattern leaks the naming convention even after rotation.
 * Set `SEED_PASSWORD` to pin one (useful in CI); otherwise each run mints a
 * fresh random password and prints it once at the end.
 */
function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(20);
  const body = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  // Guarantee the symbol/digit classes most password policies demand.
  return `${body}#7`;
}

const SEED_PASSWORD = process.env.SEED_PASSWORD || generatePassword();

/** Accounts to seed. Passwords are generated — see `generatePassword`. */
const ACCOUNTS = [
  {
    email: "admin@example.local",
    username: "org-admin",
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
    email: "user1@example.local",
    username: "org-user1",
    firstName: "مستخدم",
    lastName: "تجريبي ١",
    isSuperAdmin: false,
    orgRoles: [OrganizationRoles.BASE],
  },
  {
    email: "user2@example.local",
    username: "org-user2",
    firstName: "مستخدم",
    lastName: "تجريبي ٢",
    isSuperAdmin: false,
    orgRoles: [OrganizationRoles.BASE],
  },
  {
    email: "warehouse@example.local",
    username: "org-warehouse",
    firstName: "موظف",
    lastName: "المستودعات",
    isSuperAdmin: false,
    orgRoles: [OrganizationRoles.WAREHOUSE],
  },
  {
    email: "finance@example.local",
    username: "org-finance",
    firstName: "موظف",
    lastName: "المالية",
    isSuperAdmin: false,
    orgRoles: [OrganizationRoles.FINANCE],
  },
  {
    email: "inventory@example.local",
    username: "org-inventory",
    firstName: "موظف",
    lastName: "المخزون",
    isSuperAdmin: false,
    orgRoles: [OrganizationRoles.INVENTORY],
  },
  {
    email: "facilities@example.local",
    username: "org-facilities",
    firstName: "موظف",
    lastName: "المرافق",
    isSuperAdmin: false,
    orgRoles: [OrganizationRoles.DEPARTMENT],
    // Links this user to the إدارة المرافق desk row created below. Without it
    // the account holds the role but points at no department, and sees nothing.
    department: FACILITIES_DEPARTMENT,
  },
  // No separate IT account: تقنية المعلومات are the workspace's system
  // administrators, so they run on `admin@example.local` — which is why that
  // account carries `DEPARTMENT` and points at the IT desk above.
] as const;

/**
 * Creates (or finds) the Supabase auth account and returns its id.
 *
 * ⚠️ The "already exists" fallback must look in `auth.users`, NOT in
 * `public.User`. The two live in different schemas and can fall out of sync:
 * resetting the public schema (`pnpm db:reset`, a manual `DROP SCHEMA`)
 * leaves `auth.users` untouched, so every account exists in auth and none
 * exists in public. That is exactly the state this fallback has to recover
 * from — and querying `db.user` there finds nothing and throws, so the seed
 * cannot repair the very situation it is for.
 *
 * Symptom when this is wrong: the app renders "User not found" on every
 * authenticated page (the session cookie is valid, the `public.User` row is
 * missing), and re-seeding fails with "Failed to create auth account".
 */
async function ensureAuthAccount(email: string, password: string) {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (!error) return data.user.id;

  // Already registered in `auth.users` → find its id so the script stays
  // idempotent. `listUsers` is paginated; the seed set is small, but page
  // through anyway so this keeps working as accounts are added.
  for (let page = 1; page <= 10; page++) {
    const { data: list, error: listError } =
      await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });

    if (listError) break;
    if (list.users.length === 0) break;

    const match = list.users.find((u) => u.email === email);
    if (match) {
      // Re-assert the seed password so a known-good credential always works,
      // even for an account created by an earlier run with a different one.
      await supabaseAdmin.auth.admin.updateUserById(match.id, { password });
      return match.id;
    }
  }

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

    const authId = await ensureAuthAccount(account.email, SEED_PASSWORD);

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
      },
    });
    console.log(`+ created workspace "${WORKSPACE_NAME}"`);
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

  console.log("\nSeed complete. Accounts (shared password below):");
  for (const account of ACCOUNTS) {
    console.log(`  ${account.email}`);
  }
  console.log(`\n  password: ${SEED_PASSWORD}`);
  console.log(
    "\n⚠ كلمة مرور تطويرية مولّدة لهذا التشغيل. غيّرها بعد أول دخول.",
  );
}

main()
  .catch((cause) => {
    console.error(cause);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
