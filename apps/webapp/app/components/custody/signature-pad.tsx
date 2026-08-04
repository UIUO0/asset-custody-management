/**
 * Signature Pad (لوحة التوقيع)
 *
 * Captures a hand-drawn signature plus the signatory's typed name and an
 * explicit acknowledgement. Used by both sides of a custody handover; the
 * component knows nothing about which side it is serving.
 *
 * ## Why a canvas *and* a typed name
 *
 * A drawn mark is what people expect a signature to look like, but it is not
 * reachable by keyboard or screen reader, and it carries no machine-readable
 * identity. The typed name is the accessible, indexable half: it is what the
 * PDF prints under the mark and what the audit trail stores. Requiring both
 * means the record is legible whichever way it is read.
 *
 * ## Coordinate handling
 *
 * The canvas is sized from its own `getBoundingClientRect()` multiplied by
 * `devicePixelRatio`, and pointer coordinates are converted through the same
 * rect. Reading `offsetX`/`offsetY` directly breaks the moment the canvas is
 * scaled by CSS or the page is zoomed — the stroke lands offset from the finger.
 *
 * `direction` is deliberately NOT applied to the canvas: a signature is a
 * drawing, not text, and mirroring it in RTL would flip the person's own mark.
 * The surrounding layout uses logical properties as usual.
 *
 * @see {@link file://./../../modules/custody/handover.server.ts} — consumes the emitted data URL
 * @see {@link file://./../../../../docs/epda-custody-signatures.md}
 */

import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Input from "~/components/forms/input";
import { Button } from "~/components/shared/button";
import { tw } from "~/utils/tw";

/** Props for {@link SignaturePad} */
export type SignaturePadProps = {
  /**
   * Form field name for the emitted PNG data URL. The value is written to a
   * hidden input so the pad works inside a plain `<Form method="post">` with no
   * client-side submit handler.
   */
  imageFieldName: string;
  /** Form field name for the typed name. */
  nameFieldName: string;
  /** Form field name for the acknowledgement checkbox. */
  acknowledgementFieldName: string;
  /** Heading shown above the pad, e.g. «توقيع المستودعات». */
  title: string;
  /** The sentence the signatory is acknowledging. */
  acknowledgementLabel: string;
  /** Pre-fills the name field from the signed-in account, when known. */
  defaultName?: string;
  /** Disables the whole pad while the form is submitting. */
  disabled?: boolean;
  /** Server-side validation error for this party, if any. */
  error?: string;
  /** Extra classes for the wrapper. */
  className?: string;
};

/** Stroke width in CSS pixels, before device-pixel scaling. */
const STROKE_WIDTH = 2.5;

/**
 * A signature capture surface with a name field and acknowledgement checkbox.
 *
 * Emits nothing until the user draws: the hidden image input stays empty, so a
 * server-side "signature required" check catches an untouched pad without the
 * component needing to validate anything itself.
 *
 * @param props - See {@link SignaturePadProps}
 * @returns The rendered pad
 */
export function SignaturePad({
  imageFieldName,
  nameFieldName,
  acknowledgementFieldName,
  title,
  acknowledgementLabel,
  defaultName,
  disabled = false,
  error,
  className,
}: SignaturePadProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const drawingRef = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  /**
   * Sizes the backing store to the element's real pixel dimensions.
   *
   * Re-run on resize because the modal this lives in reflows on orientation
   * change; without it the stroke scale drifts from the pointer after a rotate.
   */
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;

    // Resizing a canvas clears it. Preserve whatever has been drawn so a
    // resize mid-signature does not silently wipe the user's work.
    const previous = hasDrawn ? canvas.toDataURL("image/png") : null;

    canvas.width = Math.max(1, Math.floor(rect.width * ratio));
    canvas.height = Math.max(1, Math.floor(rect.height * ratio));

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.scale(ratio, ratio);
    ctx.lineWidth = STROKE_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // Ink colour is fixed rather than themed: the PNG is printed on a white
    // محضر, so a light stroke picked up from dark mode would come out invisible.
    ctx.strokeStyle = "#101828";

    if (previous) {
      const image = new Image();
      image.onload = () => ctx.drawImage(image, 0, 0, rect.width, rect.height);
      image.src = previous;
    }
  }, [hasDrawn]);

  useEffect(() => {
    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, [resizeCanvas]);

  /** Converts a pointer event to canvas-local CSS pixels. */
  function pointFrom(event: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    // Capture the pointer so a stroke that leaves the canvas still tracks the
    // finger and resumes cleanly on re-entry, instead of breaking into segments.
    event.currentTarget.setPointerCapture(event.pointerId);
    drawingRef.current = true;

    const { x, y } = pointFrom(event);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const { x, y } = pointFrom(event);
    ctx.lineTo(x, y);
    ctx.stroke();

    if (!hasDrawn) setHasDrawn(true);
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
    commit();
  }

  /** Writes the current canvas to the hidden input as a PNG data URL. */
  function commit() {
    const canvas = canvasRef.current;
    const hidden = hiddenInputRef.current;
    if (!canvas || !hidden) return;
    hidden.value = canvas.toDataURL("image/png");
  }

  /** Wipes the pad and the hidden input together, so neither can go stale. */
  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (hiddenInputRef.current) hiddenInputRef.current.value = "";
    setHasDrawn(false);
  }

  return (
    <fieldset
      className={tw(
        "rounded-lg border border-gray-200 p-4 dark:border-gray-700",
        className,
      )}
      disabled={disabled}
    >
      <legend className="px-1 text-sm font-semibold text-gray-700 dark:text-gray-200">
        {title}
      </legend>

      <div className="mb-3">
        <Input
          name={nameFieldName}
          label={t("custodySignature.fullName")}
          defaultValue={defaultName}
          required
          autoComplete="name"
          placeholder={t("custodySignature.fullNamePlaceholder")}
        />
      </div>

      <div className="mb-2">
        <span
          id={`${imageFieldName}-label`}
          className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-200"
        >
          {t("custodySignature.drawHere")}
        </span>
        <canvas
          ref={canvasRef}
          // `touch-none` is required, not cosmetic: without it the browser
          // treats a drag on the canvas as a scroll gesture and the stroke
          // never reaches us on touch devices.
          className={tw(
            "h-40 w-full touch-none rounded-md border border-dashed bg-white",
            error ? "border-error-400" : "border-gray-300 dark:border-gray-600",
            disabled && "opacity-60",
          )}
          role="img"
          aria-labelledby={`${imageFieldName}-label`}
          aria-describedby={`${imageFieldName}-hint`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        />
        <p
          id={`${imageFieldName}-hint`}
          className="mt-1 text-xs text-gray-500 dark:text-gray-400"
        >
          {t("custodySignature.drawHint")}
        </p>
      </div>

      <div className="mb-3 flex justify-end">
        <Button
          type="button"
          variant="link"
          size="sm"
          onClick={clear}
          disabled={disabled || !hasDrawn}
        >
          {t("custodySignature.clear")}
        </Button>
      </div>

      <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-200">
        <input
          type="checkbox"
          name={acknowledgementFieldName}
          value="yes"
          required
          className="mt-1 size-4 shrink-0 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
        <span>{acknowledgementLabel}</span>
      </label>

      {/* The pad's output. Empty until the user draws, which is what lets the
          server reject an untouched pad without any client-side validation. */}
      <input ref={hiddenInputRef} type="hidden" name={imageFieldName} />

      {error ? (
        <p className="mt-2 text-sm text-error-500" role="alert">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}

export default SignaturePad;
