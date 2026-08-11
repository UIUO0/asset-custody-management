import Markdoc from "@markdoc/markdoc";
import type { Config, Node } from "@markdoc/markdoc";

function collectRawContent(node: Node | undefined): string {
  if (!node) {
    return "";
  }
  if (node.type === "text") {
    return (node.attributes?.content as string) ?? "";
  }
  return (node.children ?? [])
    .map((child) => collectRawContent(child))
    .join("");
}

/**
 * Markdoc configuration
 *
 * This configuration defines custom tags and components for enhanced markdown rendering.
 * Currently includes:
 * - date tag: Renders dates with proper localization and timezone support
 * - assets_list tag: Renders interactive asset count with popover showing asset details
 * - kits_list tag: LEGACY. Kits were removed from the product, but notes
 *   written before that still carry `{% kits_list … /%}` in the database and
 *   are immutable history. The tag is kept so those notes keep reading as
 *   "3 kits" instead of dropping the fragment mid-sentence — it transforms to
 *   plain text, with no component and no link to a route that no longer
 *   exists. Do not add a renderer back.
 * - link tag: Renders consistent links that open in new tabs
 * - booking_status tag: Renders booking status badges with consistent styling
 * - description tag: Renders truncated descriptions with popover for full text
 */

export const markdocConfig: Config = {
  tags: {
    raw: {
      render: "RawBlock",
      transform(node) {
        return new Markdoc.Tag("RawBlock", {
          raw: collectRawContent(node),
        });
      },
    },
    date: {
      render: "DateComponent",
      description:
        "Renders a date with proper localization and timezone support",
      attributes: {
        value: {
          type: String,
          required: true,
          description: "ISO date string to be formatted",
        },
        includeTime: {
          type: Boolean,
          default: true,
          description: "Whether to include time in the formatted output",
        },
      },
      selfClosing: true,
    },
    assets_list: {
      render: "AssetsListComponent",
      description:
        "Renders an interactive asset count with popover showing asset names",
      attributes: {
        count: {
          type: Number,
          required: true,
          description: "Number of assets in the list",
        },
        ids: {
          type: String,
          required: true,
          description: "Comma-separated list of asset IDs",
        },
        action: {
          type: String,
          required: true,
          description: "Action performed (added, removed, etc.)",
        },
      },
      selfClosing: true,
    },
    // LEGACY — see the file header. Text-only, no `render`.
    kits_list: {
      description:
        "Legacy kit count from notes written before kits were removed",
      transform(node) {
        const count = Number(node.attributes?.count ?? 0);
        if (!Number.isFinite(count) || count <= 0) {
          return "kits";
        }
        return `${count} ${count === 1 ? "kit" : "kits"}`;
      },
      attributes: {
        count: {
          type: Number,
          required: true,
          description: "Number of kits in the list",
        },
        ids: {
          type: String,
          required: false,
          description: "Comma-separated list of kit IDs (unused)",
        },
        action: {
          type: String,
          required: false,
          description: "Action performed (added, removed, etc.)",
        },
      },
      selfClosing: true,
    },
    link: {
      render: "LinkComponent",
      description:
        "Renders a link that opens in a new tab with consistent styling",
      attributes: {
        to: {
          type: String,
          required: true,
          description: "URL path for the link",
        },
        text: {
          type: String,
          required: true,
          description: "Display text for the link",
        },
      },
      selfClosing: true,
    },
    booking_status: {
      render: "BookingStatusComponent",
      description:
        "Renders a booking status badge with consistent styling and colors",
      attributes: {
        status: {
          type: String,
          required: true,
          description: "The booking status (DRAFT, RESERVED, ONGOING, etc.)",
        },
        custodianUserId: {
          type: String,
          required: false,
          description: "Optional custodian user ID for extra tooltip info",
        },
      },
      selfClosing: true,
    },
    description: {
      render: "DescriptionComponent",
      description:
        "Renders truncated descriptions with popover showing full text on click",
      attributes: {
        oldText: {
          type: String,
          required: false,
          description: "The previous description text",
        },
        newText: {
          type: String,
          required: false,
          description: "The new description text",
        },
      },
      selfClosing: true,
    },
    tag: {
      render: "TagComponent",
      description: "Renders an asset tag badge",
      attributes: {
        id: {
          type: String,
          required: false,
          description: "Tag identifier",
        },
        name: {
          type: String,
          required: true,
          description: "Tag display name",
        },
      },
      selfClosing: true,
    },
    category_badge: {
      render: "CategoryBadgeComponent",
      description: "Renders an asset category badge",
      attributes: {
        name: {
          type: String,
          required: false,
          description: "Category display name",
        },
        color: {
          type: String,
          required: false,
          description: "Hex color for the badge",
        },
      },
      selfClosing: true,
    },
    audit_images: {
      render: "AuditImagesComponent",
      description:
        "Renders audit completion images as thumbnails with preview capability",
      attributes: {
        count: {
          type: Number,
          required: true,
          description: "Number of images attached to audit completion",
        },
        ids: {
          type: String,
          required: true,
          description: "Comma-separated list of audit image IDs",
        },
      },
      selfClosing: true,
    },
  },
};
