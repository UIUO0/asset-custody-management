/**
 * Custody Handover — pure logic (منطق المحاضر المحايد)
 *
 * The party-mapping and signing-eligibility rules, in a module with **no**
 * `.server` suffix so both the server and the browser bundle can import them.
 *
 * ## Why this file exists at all
 *
 * These functions started life inside `handover.server.ts`. React Router strips
 * server code from `loader`, `action`, `middleware` and `headers` only — any
 * *other* route export that reaches into a `.server` module fails the
 * `vite:import-analysis` check with "Server-only module referenced by client",
 * and the dev server refuses to serve the route.
 *
 * This is the same class of mistake as the `.client.ts` incident recorded in
 * `CLAUDE.md`: the fix is to move the pure logic to a neutral module, not to
 * work around the boundary. Anything here must stay free of Prisma, Supabase,
 * `Buffer`, `process` and every other Node-only global.
 *
 * @see {@link file://./handover.server.ts} — the database and storage side
 * @see {@link file://./../../../../docs/org-custody-signatures.md}
 */

import {
  CustodyHandoverKind,
  CustodyHandoverParty,
  CustodyHandoverState,
} from "@prisma/client";

/**
 * Resolves which party slot a given actor signs in.
 *
 * Centralised because the mapping inverts between the two directions, and every
 * caller that re-derives it is a chance to get it backwards: on تسليم the
 * warehouse releases and the employee receives; on استرجاع they swap.
 *
 * @param kind - Direction of the handover
 * @param actor - `"warehouse"` for the operator, `"counterparty"` for the employee
 * @returns The `CustodyHandoverParty` that actor occupies on this record
 */
export function partyFor(
  kind: CustodyHandoverKind,
  actor: "warehouse" | "counterparty",
): CustodyHandoverParty {
  return kind === CustodyHandoverKind.HANDOVER
    ? actor === "warehouse"
      ? CustodyHandoverParty.RELEASING
      : CustodyHandoverParty.RECEIVING
    : actor === "warehouse"
    ? CustodyHandoverParty.RECEIVING
    : CustodyHandoverParty.RELEASING;
}

/**
 * Resolves which party slot — if any — a signed-in user is entitled to sign.
 *
 * This is the whole security model of remote signing, and it closes both ways
 * one account could end up on both halves of a record:
 *
 * - The employee's slot is bound to *their own* team-member row, so an operator
 *   cannot open a record naming someone else and sign the employee's half.
 * - A viewer who **is** the named counterparty gets that slot and only that
 *   slot, so an operator cannot name themselves and then also sign as the desk.
 *
 * Those are the failure modes remote signing invites and the ones this function
 * exists to prevent.
 *
 * Returns `null` rather than throwing, so callers can distinguish "may not
 * sign" (hide the pad, still show the record) from "record not found".
 *
 * Pure and side-effect free — it is also what the route *renders* from, which
 * is precisely why it lives in this module and not the `.server` one.
 *
 * @param handover - Record being signed, with its existing signatures
 * @param canOperate - Whether the viewer holds `asset.custody` at organization
 *   scope, i.e. may act as the warehouse side
 * @param ownTeamMemberId - The viewer's team-member row in this workspace
 * @param ownDepartmentTeamMemberId - The department desk this viewer speaks
 *   for, when they hold `DEPARTMENT`. See the note on desks below.
 * @returns The party they may sign, or `null`
 */
export function resolveSignableParty({
  handover,
  canOperate,
  ownTeamMemberId,
  ownDepartmentTeamMemberId = null,
}: {
  handover: {
    kind: CustodyHandoverKind;
    state: CustodyHandoverState;
    counterpartyTeamMemberId: string;
    signatures: { party: CustodyHandoverParty }[];
  };
  canOperate: boolean;
  ownTeamMemberId: string | null;
  /**
   * Set only for a `DEPARTMENT` holder, and only from their own membership —
   * never from anything the client sends. Resolved by `resolveOwnDepartmentId`.
   */
  ownDepartmentTeamMemberId?: string | null;
}): CustodyHandoverParty | null {
  if (handover.state !== CustodyHandoverState.AWAITING_SIGNATURES) return null;

  const signed = new Set(handover.signatures.map((s) => s.party));
  const counterpartySlot = partyFor(handover.kind, "counterparty");
  const warehouseSlot = partyFor(handover.kind, "warehouse");

  /**
   * A counterparty is either the named person, or — when the record names a
   * **department desk** — someone who speaks for that desk.
   *
   * Batch handovers name `إدارة المرافق`, a `TeamMember` row with no user
   * account, so nobody's *personal* row ever equals it. Without the second
   * clause the receiving department could never sign, and every batch محضر
   * would sit unsignable forever.
   *
   * This widens **who counts as the counterparty**. It does not widen how many
   * slots anyone gets: a department officer recognised here takes the
   * counterparty slot and returns below, exactly like a named individual, so
   * they still cannot also sign the warehouse half.
   */
  const isCounterparty =
    (Boolean(ownTeamMemberId) &&
      ownTeamMemberId === handover.counterpartyTeamMemberId) ||
    (Boolean(ownDepartmentTeamMemberId) &&
      ownDepartmentTeamMemberId === handover.counterpartyTeamMemberId);

  /**
   * A named counterparty signs their own slot and **nothing else** — even when
   * they also hold `asset.custody`.
   *
   * A warehouse officer taking an asset out for themselves is the employee on
   * that record, not the desk. Letting them fall through to the warehouse slot
   * would mean one person signing both halves, which is exactly the control the
   * two signatures exist to impose: the second signature is what actually moves
   * custody, and a signature against oneself witnesses nothing. Someone else
   * with `asset.custody` countersigns.
   *
   * The early return is the whole guard. Returning `null` here (rather than
   * falling through) is deliberate and load-bearing — see the test that pins it.
   */
  if (isCounterparty) {
    return signed.has(counterpartySlot) ? null : counterpartySlot;
  }

  if (canOperate && !signed.has(warehouseSlot)) {
    return warehouseSlot;
  }

  return null;
}
