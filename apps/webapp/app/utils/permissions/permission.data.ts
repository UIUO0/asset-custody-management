import { OrganizationRoles } from "@prisma/client";

export enum PermissionAction {
  create = "create",
  read = "read",
  update = "update",
  delete = "delete",
  checkout = "checkout",
  checkin = "checkin",
  export = "export",
  import = "import",
  archive = "archive",
  cancel = "cancel",
  extend = "extend",
  manageAssets = "manage-assets",
  custody = "custody",
  manageKits = "manage-kits",
  changeRole = "change-role",
  /**
   * EPDA: approving a workflow transition (asset request, readiness sign-off).
   * Distinct from `update` — a role may edit an asset without being allowed to
   * move it forward in the lifecycle, and vice versa.
   */
  approve = "approve",
  /**
   * EPDA: freezing an item for review without deciding it.
   *
   * Deliberately NOT a weaker form of `approve`: one role flags something for a
   * second look, another decides it. Collapsing them would hand each role the
   * other's power.
   *
   * ⚠️ **Currently granted to nobody.** Its only subject was the booking-request
   * queue, which was removed with the booking system (2026-08-06). Kept rather
   * than deleted because the separation is a documented design decision and the
   * next review workflow will want it — see CLAUDE.md. If you add a `hold`
   * grant, make sure no role also holds `approve` on the same entity.
   */
  hold = "hold",
}
export enum PermissionEntity {
  asset = "asset",
  assetIndexSettings = "assetIndexSettings",
  qr = "qr",
  tag = "tag",
  category = "category",
  location = "location",
  locationNote = "locationNote",
  customField = "customField",
  workspace = "workspace",
  teamMember = "teamMember",
  teamMemberProfile = "teamMemberProfile",
  dashboard = "dashboard",
  generalSettings = "generalSettings",
  workingHours = "workingHours",
  subscription = "subscription",
  kit = "kit",
  note = "note",
  scan = "scan",
  custody = "custody",
  assetReminders = "assetReminders",
  audit = "audit",
  auditNote = "auditNote",
  teamMemberNote = "teamMemberNote",
  assetModel = "assetModel",
  emailSettings = "emailSettings",
  userData = "user-data", // This is for the user to load their own data.
  update = "update",
  commandPaletteSearch = "command-palette-search",
  /**
   * EPDA: the intake forms (مذكرة استلام / محضر استلام).
   *
   * Separate from `asset` on purpose. Filling in a receipt is the warehouse's
   * job and produces stock; editing an asset afterwards is a different act that
   * المالية also perform. Folding the receipt into `asset.create` would have
   * handed المالية the ability to book in a delivery.
   */
  goodsReceipt = "goodsReceipt",
}

/**
 * Static role → entity → allowed-actions map.
 *
 * `hasPermission` short-circuits to `true` for ADMIN and OWNER, so their entries
 * below are documentation rather than enforcement. Every other role is enforced
 * strictly from this map: an entity missing from a role's record denies access.
 *
 * ## EPDA roles
 *
 * WAREHOUSE / FINANCE / INVENTORY are derived from the approved permission
 * matrix (2026-07-26) recorded in the workflow spec. Where the matrix is silent
 * about an entity, the agreed fallback is: WAREHOUSE mirrors ADMIN, while
 * FINANCE and INVENTORY get read-only.
 *
 * Workspace administration (`workspace`, `generalSettings`, `subscription`,
 * `emailSettings`) is deliberately withheld from all three — it is not in the
 * matrix and belongs to تقنية المعلومات (OWNER).
 *
 * @see {@link file://./role-scope.ts} — separate, and equally required: which
 *   *rows* each role may see. A role listed here still needs registering there.
 * @see {@link file://./../../../../docs/epda-workflow-and-roles.md}
 */
//this will come from DB eventually
export const Role2PermissionMap: {
  [K in OrganizationRoles]?: Record<PermissionEntity, PermissionAction[]>;
} = {
  [OrganizationRoles.BASE]: {
    [PermissionEntity.asset]: [PermissionAction.read],
    [PermissionEntity.assetIndexSettings]: [PermissionAction.read],
    // Employees do not book in deliveries; the receipt forms are a
    // warehouse instrument.
    [PermissionEntity.goodsReceipt]: [],
    [PermissionEntity.auditNote]: [
      PermissionAction.read,
      PermissionAction.create,
    ],
    [PermissionEntity.audit]: [PermissionAction.read, PermissionAction.update],
    [PermissionEntity.qr]: [PermissionAction.read],
    [PermissionEntity.category]: [],
    [PermissionEntity.customField]: [],
    [PermissionEntity.location]: [],
    [PermissionEntity.locationNote]: [],
    [PermissionEntity.tag]: [],
    [PermissionEntity.teamMember]: [],
    [PermissionEntity.teamMemberProfile]: [],
    [PermissionEntity.workspace]: [],
    [PermissionEntity.dashboard]: [],
    [PermissionEntity.generalSettings]: [],
    [PermissionEntity.workingHours]: [PermissionAction.read],
    [PermissionEntity.subscription]: [],
    [PermissionEntity.kit]: [PermissionAction.read],
    [PermissionEntity.note]: [],
    [PermissionEntity.scan]: [],
    [PermissionEntity.custody]: [],
    [PermissionEntity.assetReminders]: [],
    [PermissionEntity.teamMemberNote]: [],
    [PermissionEntity.assetModel]: [PermissionAction.read],
    [PermissionEntity.emailSettings]: [],
    [PermissionEntity.userData]: [
      PermissionAction.read,
      PermissionAction.update,
    ],
    [PermissionEntity.update]: [PermissionAction.read],
    [PermissionEntity.commandPaletteSearch]: [PermissionAction.read],
  },
  [OrganizationRoles.SELF_SERVICE]: {
    [PermissionEntity.asset]: [PermissionAction.read, PermissionAction.custody],
    [PermissionEntity.assetIndexSettings]: [PermissionAction.read],
    [PermissionEntity.goodsReceipt]: [],
    [PermissionEntity.auditNote]: [
      PermissionAction.read,
      PermissionAction.create,
    ],
    [PermissionEntity.audit]: [PermissionAction.read, PermissionAction.update],
    [PermissionEntity.qr]: [PermissionAction.read],
    [PermissionEntity.category]: [],
    [PermissionEntity.customField]: [],
    [PermissionEntity.location]: [],
    [PermissionEntity.locationNote]: [],
    [PermissionEntity.tag]: [],
    [PermissionEntity.teamMember]: [],
    [PermissionEntity.teamMemberProfile]: [],
    [PermissionEntity.workspace]: [],
    [PermissionEntity.dashboard]: [],
    [PermissionEntity.generalSettings]: [],
    [PermissionEntity.workingHours]: [PermissionAction.read],
    [PermissionEntity.subscription]: [],
    [PermissionEntity.kit]: [PermissionAction.read, PermissionAction.custody],
    [PermissionEntity.note]: [],
    [PermissionEntity.scan]: [],
    [PermissionEntity.custody]: [],
    [PermissionEntity.assetReminders]: [],
    [PermissionEntity.teamMemberNote]: [],
    [PermissionEntity.assetModel]: [],
    [PermissionEntity.emailSettings]: [],
    [PermissionEntity.userData]: [
      PermissionAction.read,
      PermissionAction.update,
    ],
    [PermissionEntity.update]: [PermissionAction.read],
    [PermissionEntity.commandPaletteSearch]: [PermissionAction.read],
  },
  [OrganizationRoles.ADMIN]: {
    [PermissionEntity.asset]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
      PermissionAction.custody,
      PermissionAction.import,
      PermissionAction.export,
    ],
    [PermissionEntity.assetIndexSettings]: [
      PermissionAction.read,
      PermissionAction.update,
    ],
    [PermissionEntity.goodsReceipt]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    [PermissionEntity.auditNote]: [
      PermissionAction.read,
      PermissionAction.create,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    [PermissionEntity.qr]: [PermissionAction.read],
    [PermissionEntity.category]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    [PermissionEntity.customField]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    [PermissionEntity.location]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    [PermissionEntity.locationNote]: [
      PermissionAction.read,
      PermissionAction.create,
      PermissionAction.delete,
    ],
    [PermissionEntity.tag]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    [PermissionEntity.teamMember]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
      PermissionAction.changeRole,
    ],
    [PermissionEntity.teamMemberProfile]: [PermissionAction.read],
    [PermissionEntity.workspace]: [
      PermissionAction.read,
      PermissionAction.update,
    ],
    [PermissionEntity.dashboard]: [PermissionAction.read],
    [PermissionEntity.generalSettings]: [
      PermissionAction.read,
      PermissionAction.update,
    ],
    [PermissionEntity.workingHours]: [
      PermissionAction.read,
      PermissionAction.update,
    ],
    [PermissionEntity.subscription]: [
      PermissionAction.read,
      PermissionAction.update,
    ],
    [PermissionEntity.kit]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
      PermissionAction.custody,
    ],
    [PermissionEntity.note]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    [PermissionEntity.scan]: [PermissionAction.read],
    [PermissionEntity.custody]: [PermissionAction.read],
    [PermissionEntity.assetReminders]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    [PermissionEntity.audit]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
      PermissionAction.archive,
    ],
    [PermissionEntity.teamMemberNote]: [
      PermissionAction.read,
      PermissionAction.create,
      PermissionAction.delete,
    ],
    [PermissionEntity.assetModel]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    [PermissionEntity.emailSettings]: [
      PermissionAction.read,
      PermissionAction.update,
    ],
    [PermissionEntity.userData]: [
      PermissionAction.read,
      PermissionAction.update,
    ],
    [PermissionEntity.update]: [PermissionAction.read],
    [PermissionEntity.commandPaletteSearch]: [PermissionAction.read],
  },
  [OrganizationRoles.OWNER]: {
    [PermissionEntity.asset]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
      PermissionAction.custody,
      PermissionAction.import,
      PermissionAction.export,
    ],
    [PermissionEntity.assetIndexSettings]: [
      PermissionAction.read,
      PermissionAction.update,
    ],
    [PermissionEntity.goodsReceipt]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    [PermissionEntity.auditNote]: [
      PermissionAction.read,
      PermissionAction.create,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    [PermissionEntity.qr]: [PermissionAction.read],
    [PermissionEntity.category]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    [PermissionEntity.customField]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    [PermissionEntity.location]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    [PermissionEntity.locationNote]: [
      PermissionAction.read,
      PermissionAction.create,
      PermissionAction.delete,
    ],
    [PermissionEntity.tag]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    [PermissionEntity.teamMember]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
      PermissionAction.changeRole,
    ],
    [PermissionEntity.teamMemberProfile]: [PermissionAction.read],
    [PermissionEntity.workspace]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    [PermissionEntity.dashboard]: [PermissionAction.read],
    [PermissionEntity.generalSettings]: [
      PermissionAction.read,
      PermissionAction.update,
    ],
    [PermissionEntity.workingHours]: [
      PermissionAction.read,
      PermissionAction.update,
    ],
    [PermissionEntity.subscription]: [
      PermissionAction.read,
      PermissionAction.update,
    ],
    [PermissionEntity.kit]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
      PermissionAction.custody,
    ],
    [PermissionEntity.note]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    [PermissionEntity.scan]: [PermissionAction.read],
    [PermissionEntity.custody]: [PermissionAction.read],
    [PermissionEntity.assetReminders]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    [PermissionEntity.audit]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
      PermissionAction.archive,
    ],
    [PermissionEntity.teamMemberNote]: [
      PermissionAction.read,
      PermissionAction.create,
      PermissionAction.delete,
    ],
    [PermissionEntity.assetModel]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    [PermissionEntity.emailSettings]: [
      PermissionAction.read,
      PermissionAction.update,
    ],
    [PermissionEntity.userData]: [
      PermissionAction.read,
      PermissionAction.update,
    ],
    [PermissionEntity.update]: [PermissionAction.read],
    [PermissionEntity.commandPaletteSearch]: [PermissionAction.read],
  },
  /**
   * WAREHOUSE — المستودعات
   *
   * Owns the operational side of the asset lifecycle: registers assets (singly
   * or by Excel import), audits them, approves/rejects employee requests, and
   * hands assets over. Mirrors ADMIN on entities the matrix leaves unspecified.
   *
   * Deliberately withheld: `asset.delete` (the matrix assigns deletion to
   * INVENTORY alone) and all team-member mutation — WAREHOUSE reads the team
   * directory but never edits it or changes roles.
   */
  [OrganizationRoles.WAREHOUSE]: {
    [PermissionEntity.asset]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.custody,
      // why: the matrix's "إضافة" covers both single-asset entry and the bulk
      // Excel template path described in the workflow spec (section 2).
      PermissionAction.import,
      PermissionAction.export,
      // Moves an asset from قيد الانتظار to جاهز للتوزيع, and approves employee
      // requests. Wired to actual transitions in phase 2/3.
      PermissionAction.approve,
    ],
    [PermissionEntity.assetIndexSettings]: [
      PermissionAction.read,
      PermissionAction.update,
    ],
    /**
     * المستودعات own intake: they fill the form in, and stock now enters the
     * system no other way. `delete` is void-the-document, not delete-the-stock
     * (see `voidGoodsReceipt`).
     */
    [PermissionEntity.goodsReceipt]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    [PermissionEntity.auditNote]: [
      PermissionAction.read,
      PermissionAction.create,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    [PermissionEntity.qr]: [PermissionAction.read],
    [PermissionEntity.category]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    // Matrix: custom fields belong to المخزون only.
    [PermissionEntity.customField]: [],
    // Matrix grants إضافة + عرض on المواقع — no edit, no delete.
    [PermissionEntity.location]: [
      PermissionAction.create,
      PermissionAction.read,
    ],
    [PermissionEntity.locationNote]: [
      PermissionAction.read,
      PermissionAction.create,
      PermissionAction.delete,
    ],
    [PermissionEntity.tag]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    // Matrix: رؤية المستخدمين = عرض only. No create/update/delete/changeRole.
    [PermissionEntity.teamMember]: [PermissionAction.read],
    [PermissionEntity.teamMemberProfile]: [PermissionAction.read],
    [PermissionEntity.workspace]: [],
    [PermissionEntity.dashboard]: [PermissionAction.read],
    [PermissionEntity.generalSettings]: [],
    [PermissionEntity.workingHours]: [PermissionAction.read],
    [PermissionEntity.subscription]: [],
    [PermissionEntity.kit]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
      PermissionAction.custody,
    ],
    [PermissionEntity.note]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    [PermissionEntity.scan]: [PermissionAction.read],
    [PermissionEntity.custody]: [PermissionAction.read],
    [PermissionEntity.assetReminders]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    [PermissionEntity.audit]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
      PermissionAction.archive,
    ],
    [PermissionEntity.teamMemberNote]: [
      PermissionAction.read,
      PermissionAction.create,
      PermissionAction.delete,
    ],
    [PermissionEntity.assetModel]: [
      PermissionAction.create,
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.delete,
    ],
    [PermissionEntity.emailSettings]: [],
    [PermissionEntity.userData]: [
      PermissionAction.read,
      PermissionAction.update,
    ],
    [PermissionEntity.update]: [PermissionAction.read],
    [PermissionEntity.commandPaletteSearch]: [PermissionAction.read],
  },
  /**
   * FINANCE — المالية
   *
   * Adds financial coding and depreciation to assets the warehouse registered,
   * and reads financial analytics. Read-only everywhere the matrix is silent.
   *
   * Deliberately withheld: `asset.delete`, `asset.custody` (finance never takes
   * possession) and all location permissions — the matrix marks المواقع as "—".
   */
  [OrganizationRoles.FINANCE]: {
    /**
     * Read + update only. FINANCE annotates assets the warehouse already
     * registered (financial coding, depreciation); it never brings an asset
     * into existence.
     *
     * `import` is withheld deliberately even though the finance workflow needs
     * an Excel round trip (export → edit → import-update). Both
     * `assets.import` (bulk CREATE) and `assets.import-update` (bulk UPDATE)
     * currently gate on the same `asset.import` action, so granting it here
     * would hand FINANCE bulk asset creation through the back door — exactly
     * what withholding `create` is meant to prevent.
     *
     * Phase 2 restores the round trip properly by splitting the two routes onto
     * separate actions; until then finance edits through the UI.
     *
     * `export` stays: it is read-only and feeds the financial analytics.
     */
    [PermissionEntity.asset]: [
      PermissionAction.read,
      PermissionAction.update,
      PermissionAction.export,
    ],
    [PermissionEntity.assetIndexSettings]: [
      PermissionAction.read,
      PermissionAction.update,
    ],
    // المالية read receipts for their prices and supplier data; booking a
    // delivery in is not theirs, matching their lack of `asset.create`.
    [PermissionEntity.goodsReceipt]: [PermissionAction.read],
    [PermissionEntity.auditNote]: [PermissionAction.read],
    [PermissionEntity.qr]: [PermissionAction.read],
    [PermissionEntity.category]: [PermissionAction.read],
    [PermissionEntity.customField]: [],
    // Matrix marks المواقع as "—" for المالية.
    [PermissionEntity.location]: [],
    [PermissionEntity.locationNote]: [],
    [PermissionEntity.tag]: [PermissionAction.read],
    [PermissionEntity.teamMember]: [PermissionAction.read],
    [PermissionEntity.teamMemberProfile]: [PermissionAction.read],
    [PermissionEntity.workspace]: [],
    // Financial analytics dashboard (phase 5, item 16).
    [PermissionEntity.dashboard]: [PermissionAction.read],
    [PermissionEntity.generalSettings]: [],
    [PermissionEntity.workingHours]: [PermissionAction.read],
    [PermissionEntity.subscription]: [],
    [PermissionEntity.kit]: [PermissionAction.read],
    [PermissionEntity.note]: [PermissionAction.read],
    [PermissionEntity.scan]: [PermissionAction.read],
    [PermissionEntity.custody]: [PermissionAction.read],
    [PermissionEntity.assetReminders]: [PermissionAction.read],
    [PermissionEntity.audit]: [PermissionAction.read],
    [PermissionEntity.teamMemberNote]: [PermissionAction.read],
    [PermissionEntity.assetModel]: [PermissionAction.read],
    [PermissionEntity.emailSettings]: [],
    [PermissionEntity.userData]: [
      PermissionAction.read,
      PermissionAction.update,
    ],
    [PermissionEntity.update]: [PermissionAction.read],
    [PermissionEntity.commandPaletteSearch]: [PermissionAction.read],
  },
  /**
   * INVENTORY — المخزون
   *
   * Organization-wide oversight. Reads everything, and is the only non-owner
   * role the matrix grants asset deletion and custom-field creation.
   *
   * Note: the matrix also lets المخزون place a request "موقوف للتدقيق"
   * (workflow spec section 3). That is a lifecycle transition, not an entity
   * action, and lands in phase 3 with the asset state machine.
   */
  /**
   * إدارة (المرافق اليوم؛ تقنية المعلومات تعمل بـ OWNER).
   *
   * A receiving desk, not an administrator. It takes a whole purchase order
   * from the warehouse in one signed محضر, then hands single assets to its own
   * staff — so it needs `asset.custody` and the ability to name an employee,
   * and nothing else.
   *
   * Deliberately absent:
   * - `create` / `update` / `delete` on `asset` — stock enters through
   *   `/receipts` only, and a department that could edit the register could
   *   rewrite what it was handed.
   * - `approve` — releasing an asset into circulation is the warehouse's call.
   * - `goodsReceipt` — the department signs a محضر, it does not author receipts.
   *
   * Data scope is NOT set here: `DEPARTMENT` is absent from
   * `ROLES_WITH_ORG_WIDE_VISIBILITY`, and `visibleCustodianIds` widens it from
   * "own records" to "own + the department's" — see `role-scope.ts`. The two
   * questions stay separate on purpose.
   */
  [OrganizationRoles.DEPARTMENT]: {
    [PermissionEntity.asset]: [PermissionAction.read, PermissionAction.custody],
    [PermissionEntity.assetIndexSettings]: [PermissionAction.read],
    [PermissionEntity.goodsReceipt]: [],
    [PermissionEntity.auditNote]: [],
    [PermissionEntity.audit]: [],
    [PermissionEntity.qr]: [PermissionAction.read],
    [PermissionEntity.category]: [],
    [PermissionEntity.customField]: [],
    [PermissionEntity.location]: [],
    [PermissionEntity.locationNote]: [],
    [PermissionEntity.tag]: [],
    // Read-only, and only so the desk can name the employee it is handing an
    // asset to. No create/update — a department does not manage the roster.
    [PermissionEntity.teamMember]: [PermissionAction.read],
    [PermissionEntity.teamMemberProfile]: [PermissionAction.read],
    [PermissionEntity.workspace]: [],
    [PermissionEntity.dashboard]: [],
    [PermissionEntity.generalSettings]: [],
    [PermissionEntity.workingHours]: [],
    [PermissionEntity.subscription]: [],
    [PermissionEntity.kit]: [PermissionAction.read, PermissionAction.custody],
    [PermissionEntity.note]: [],
    [PermissionEntity.scan]: [],
    [PermissionEntity.custody]: [PermissionAction.read],
    [PermissionEntity.assetReminders]: [],
    [PermissionEntity.teamMemberNote]: [],
    [PermissionEntity.assetModel]: [],
    [PermissionEntity.emailSettings]: [],
    [PermissionEntity.userData]: [
      PermissionAction.read,
      PermissionAction.update,
    ],
    [PermissionEntity.update]: [PermissionAction.read],
    [PermissionEntity.commandPaletteSearch]: [PermissionAction.read],
  },
  [OrganizationRoles.INVENTORY]: {
    // Matrix: عرض + حذف. No create/update — المخزون observes and prunes,
    // it does not author asset data.
    [PermissionEntity.asset]: [PermissionAction.read, PermissionAction.delete],
    [PermissionEntity.assetIndexSettings]: [PermissionAction.read],
    /**
     * المخزون monitor intake without performing it — plus `delete`, which here
     * means *voiding the document*, not erasing stock (`voidGoodsReceipt` keeps
     * the record and never touches the items it created).
     *
     * Granted provisionally at the authority's request: المخزون are the ones
     * who notice a receipt entered against the wrong supplier or in duplicate,
     * and previously had to find a warehouse operator to cancel it. Revisit
     * once the review workflow gives them a `hold` on receipts the way they
     * have one on booking requests.
     */
    [PermissionEntity.goodsReceipt]: [
      PermissionAction.read,
      PermissionAction.delete,
    ],
    /**
     * المخزون review the request queue without deciding it: they may freeze a
     * request (and release their own freeze), but accept/reject stays with
     * المستودعات. `hold` without `approve` is exactly that separation.
     */
    [PermissionEntity.auditNote]: [PermissionAction.read],
    [PermissionEntity.qr]: [PermissionAction.read],
    [PermissionEntity.category]: [PermissionAction.read],
    // Matrix grants إضافة. `read` is added because the custom-fields settings
    // screen must list existing fields before the create action is reachable.
    [PermissionEntity.customField]: [
      PermissionAction.create,
      PermissionAction.read,
    ],
    [PermissionEntity.location]: [PermissionAction.read],
    [PermissionEntity.locationNote]: [PermissionAction.read],
    [PermissionEntity.tag]: [PermissionAction.read],
    [PermissionEntity.teamMember]: [PermissionAction.read],
    [PermissionEntity.teamMemberProfile]: [PermissionAction.read],
    [PermissionEntity.workspace]: [],
    [PermissionEntity.dashboard]: [PermissionAction.read],
    [PermissionEntity.generalSettings]: [],
    [PermissionEntity.workingHours]: [PermissionAction.read],
    [PermissionEntity.subscription]: [],
    [PermissionEntity.kit]: [PermissionAction.read],
    [PermissionEntity.note]: [PermissionAction.read],
    [PermissionEntity.scan]: [PermissionAction.read],
    [PermissionEntity.custody]: [PermissionAction.read],
    [PermissionEntity.assetReminders]: [PermissionAction.read],
    [PermissionEntity.audit]: [PermissionAction.read],
    [PermissionEntity.teamMemberNote]: [PermissionAction.read],
    [PermissionEntity.assetModel]: [PermissionAction.read],
    [PermissionEntity.emailSettings]: [],
    [PermissionEntity.userData]: [
      PermissionAction.read,
      PermissionAction.update,
    ],
    [PermissionEntity.update]: [PermissionAction.read],
    [PermissionEntity.commandPaletteSearch]: [PermissionAction.read],
  },
};
