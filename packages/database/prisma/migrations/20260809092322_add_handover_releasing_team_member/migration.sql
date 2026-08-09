-- Who gave the units up, when a محضر is a transfer rather than an issue from
-- the shelf (إدارة المرافق passing 10 of its pens to an employee).
--
-- Stored rather than derived: the custody change fires at signature time,
-- possibly days after the record was opened, and by then the releasing side's
-- stock has already moved. It is also what the printed محضر needs in order to
-- say who handed over.
--
-- No foreign key on purpose — same posture as `operatorUserId`'s `SetNull`: the
-- محضر must outlive the team-member row it names. A signed document that loses
-- a party because somebody was removed from the roster is worse than a dangling
-- id, and the id is only ever read through an org-scoped lookup.
--
-- NOTE: Prisma's generated diff again carried `DROP CONSTRAINT` for
-- `BookingAsset_assetKitId_fkey` and `ConsumptionLog_bookingAssetId_fkey` —
-- deliberately un-declared relations it reads as drift. Removed here; see the
-- pitfall recorded in CLAUDE.md.
ALTER TABLE "CustodyHandover" ADD COLUMN "releasingTeamMemberId" TEXT;

CREATE INDEX "CustodyHandover_releasingTeamMemberId_idx" ON "CustodyHandover"("releasingTeamMemberId");
