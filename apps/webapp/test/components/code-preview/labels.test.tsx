import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("lottie-react", () => ({
  default: () => null,
}));

import { BarcodeLabel, QrLabel } from "~/components/code-preview/code-preview";
import { config } from "~/config/shelf.config";

/**
 * why: upstream printed a "Powered by shelf.nu" footer on every label, gated on
 * the workspace `showShelfBranding` toggle. The EPDA deployment must not
 * reference the vendor anywhere a user can see (CLAUDE.md), so that footer was
 * removed — but the toggle, its database column and its plumbing all stayed,
 * leaving a workspace setting that persisted a value and changed nothing.
 *
 * The strip now prints the authority's own mark, so the toggle means something
 * again. Two properties are asserted below and they are not the same one:
 *
 *   1. The vendor's name never appears, whatever the flag says.
 *   2. The flag actually decides whether the authority mark is printed.
 *
 * (1) alone is what held while the feature was quietly dead.
 */

describe("QrLabel", () => {
  const baseProps = {
    title: "Camera",
    data: {
      qr: {
        id: "qr-123",
        src: "data:image/png;base64,AAA",
        size: "small",
      },
    },
  } as const;

  it("never renders shelf.nu branding", () => {
    render(<QrLabel {...(baseProps as any)} />);

    expect(screen.queryByText(/Powered by/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/shelf\.nu/i)).not.toBeInTheDocument();
  });

  it("renders the QR title and id", () => {
    render(<QrLabel {...(baseProps as any)} />);

    expect(screen.getByText("Camera")).toBeInTheDocument();
    expect(screen.getByText("qr-123")).toBeInTheDocument();
  });

  it("prints the authority mark when the workspace enables branding", () => {
    render(<QrLabel {...(baseProps as any)} showShelfBranding />);

    expect(screen.getByAltText(config.appName)).toHaveAttribute(
      "src",
      config.logoPath?.fullLogo,
    );
  });

  it("prints no mark when the workspace disables branding", () => {
    render(<QrLabel {...(baseProps as any)} showShelfBranding={false} />);

    expect(screen.queryByAltText(config.appName)).not.toBeInTheDocument();
  });

  it("describes the QR image by what it is, not by a filename", () => {
    // The alt text was a `.png` filename carrying the vendor name: meaningless
    // to a screen-reader user, and a branding leak besides.
    render(<QrLabel {...(baseProps as any)} />);

    expect(screen.getByAltText("QR code for Camera")).toBeInTheDocument();
  });
});

describe("BarcodeLabel", () => {
  const baseProps = {
    title: "Camera",
    data: {
      type: "EAN13",
      value: "1234567890123",
    },
  } as const;

  it("never renders shelf.nu branding", () => {
    render(<BarcodeLabel {...(baseProps as any)} />);

    expect(screen.queryByText(/Powered by/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/shelf\.nu/i)).not.toBeInTheDocument();
  });

  it("renders the barcode value", () => {
    render(<BarcodeLabel {...(baseProps as any)} />);

    expect(screen.getByText("1234567890123")).toBeInTheDocument();
  });

  it("prints the authority mark when the workspace enables branding", () => {
    render(<BarcodeLabel {...(baseProps as any)} showShelfBranding />);

    expect(screen.getByAltText(config.appName)).toHaveAttribute(
      "src",
      config.logoPath?.fullLogo,
    );
  });

  it("prints no mark when the workspace disables branding", () => {
    render(<BarcodeLabel {...(baseProps as any)} showShelfBranding={false} />);

    expect(screen.queryByAltText(config.appName)).not.toBeInTheDocument();
  });
});
