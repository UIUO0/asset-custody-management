import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("lottie-react", () => ({
  default: () => null,
}));

import { BarcodeLabel, QrLabel } from "~/components/code-preview/code-preview";

// why: the "Powered by shelf.nu" footer was removed from every printed label
// for the EPDA deployment (branding must not reference shelf.nu — see
// CLAUDE.md). These tests now assert the footer is absent regardless of the
// `showShelfBranding` flag, which is retained only for API compatibility.

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
});
