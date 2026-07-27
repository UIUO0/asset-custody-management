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
 *
 * Accounts 4-6 exist so each operational role can be exercised end to end
 * without hand-editing `UserOrganization.roles` in the database.
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

/** Accounts to seed. Change passwords after first login! */
const ACCOUNTS = [
  {
    email: "admin@epda.local",
    password: "Epda@Admin#2026",
    username: "epda-admin",
    firstName: "مدير",
    lastName: "النظام",
    isSuperAdmin: true,
    orgRoles: [OrganizationRoles.OWNER],
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
      },
    });
    console.log(`+ created workspace "${WORKSPACE_NAME}"`);
  }

  // 4. Attach every account to the workspace (role + team member row)
  for (const account of ACCOUNTS) {
    const user = created.find((u) => u.email === account.email);
    if (!user) continue;

    await db.userOrganization.upsert({
      where: {
        userId_organizationId: { userId: user.id, organizationId: org.id },
      },
      update: {},
      create: {
        userId: user.id,
        organizationId: org.id,
        roles: [...account.orgRoles],
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
