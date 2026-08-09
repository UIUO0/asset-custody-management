/**
 * The three signature boxes at the foot of a receipt.
 *
 * Each box is either a captured signature (name, image, timestamp) or a pad the
 * next signatory can draw in. Which three boxes appear, and what they are
 * called, comes from the form's shape — نموذج 2 and نموذج 3 take the same
 * number of signatures under different titles.
 *
 * Reuses `SignaturePad` from the custody handover flow rather than growing a
 * second one. Two signature capture surfaces in one product would drift in
 * exactly the ways that matter: stroke handling, touch support, and what counts
 * as an empty pad.
 *
 * Each pad posts its own form, so a signatory signs and submits without the
 * other two boxes being part of their request — three people sign at three
 * different moments, and a single form holding all three would make the last
 * one overwrite the others' unsaved input.
 *
 * @see {@link file://./../custody/signature-pad.tsx} the shared pad
 * @see {@link file://./../../modules/goods-receipt/form-shape.ts} which boxes appear
 */

import type { GoodsReceiptParty } from "@prisma/client";
import SignaturePad from "~/components/custody/signature-pad";
import { Form } from "~/components/custom-form";
import { Button } from "~/components/shared/button";
import { DateS } from "~/components/shared/date";
import type { ReceiptFormShape } from "~/modules/goods-receipt/form-shape";

/** A signature already captured, as the loader ships it. */
type CapturedSignature = {
  id: string;
  party: GoodsReceiptParty;
  declaredName: string;
  signedAt: string | Date;
};

/**
 * The signature block.
 *
 * @param props.shape - Which form, and therefore which three boxes
 * @param props.signatures - Signatures captured so far
 * @param props.signatureUrls - Short-lived display URLs, keyed by party
 * @param props.disabled - True for a voided receipt: shows what was signed but
 *   accepts nothing further
 */
export function SignatureBoxes({
  shape,
  signatures,
  signatureUrls,
  disabled,
}: {
  shape: ReceiptFormShape;
  signatures: CapturedSignature[];
  signatureUrls: Partial<Record<GoodsReceiptParty, string>>;
  disabled?: boolean;
}) {
  const byParty = new Map(
    signatures.map((signature) => [signature.party, signature]),
  );
  const remaining = shape.parties.length - byParty.size;

  return (
    <section className="rounded-lg border border-gray-200 p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3>التواقيع</h3>
        {remaining > 0 ? (
          <span className="rounded border border-warning-300 bg-warning-50 px-2 py-0.5 text-xs text-warning-700">
            بانتظار {remaining} من {shape.parties.length}
          </span>
        ) : (
          <span className="rounded border border-success-300 bg-success-50 px-2 py-0.5 text-xs text-success-700">
            مكتملة
          </span>
        )}
      </div>

      {remaining > 0 ? (
        <p className="mb-6 text-sm text-gray-600">
          الأصناف دخلت النظام بحالة «قيد الانتظار». لا يمكن اعتمادها للتوزيع حتى
          تكتمل التواقيع الثلاثة.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        {shape.parties.map(({ party, label }) => {
          const signed = byParty.get(party);

          if (signed) {
            return (
              <div
                key={party}
                className="rounded border border-success-300 bg-success-50 p-4"
              >
                <div className="mb-2 text-sm font-medium">{label}</div>
                {signatureUrls[party] ? (
                  <img
                    src={signatureUrls[party]}
                    alt={`توقيع ${signed.declaredName}`}
                    className="mb-2 h-20 w-full bg-white object-contain"
                  />
                ) : (
                  // The image is only ever unavailable because the signed URL
                  // could not be minted; the signature itself still stands.
                  <div className="mb-2 flex h-20 items-center justify-center bg-white text-xs text-gray-400">
                    تعذّر عرض صورة التوقيع
                  </div>
                )}
                <div className="font-medium">{signed.declaredName}</div>
                <div className="text-xs text-gray-600">
                  <DateS date={signed.signedAt} includeTime />
                </div>
              </div>
            );
          }

          if (disabled) {
            return (
              <div
                key={party}
                className="rounded border border-gray-200 bg-gray-50 p-4"
              >
                <div className="mb-2 text-sm font-medium">{label}</div>
                <div className="text-sm text-gray-500">
                  لم يوقَّع — نموذج ملغى
                </div>
              </div>
            );
          }

          return (
            <Form
              key={party}
              method="post"
              className="rounded border border-gray-200 p-4"
            >
              <input type="hidden" name="party" value={party} />
              <SignaturePad
                imageFieldName="signatureImage"
                nameFieldName="declaredName"
                acknowledgementFieldName="acknowledged"
                title={label}
                acknowledgementLabel="أقرّ بصحة البيانات الواردة في هذا النموذج."
              />
              <Button type="submit" className="mt-3 w-full">
                توقيع
              </Button>
            </Form>
          );
        })}
      </div>
    </section>
  );
}
