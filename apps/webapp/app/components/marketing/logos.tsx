import { ShelfTypography } from "~/components/icons/library";
import { config } from "~/config/shelf.config";
import { tw } from "~/utils/tw";
import When from "../when/when";

/**
 * Alt text for the workspace logo.
 *
 * Deliberately generic: these components render inside emails and PDFs as well
 * as the app shell, where the React i18n hook is unavailable — and the EPDA
 * deployment must not surface the upstream vendor's brand name anywhere.
 */
const ALT_TEXT = "SDA";

/**
 * Logo shown in the sidebar
 * If a custom logo is used, we dynamically show that or the symbol depending on {optimisticMinimizedSidebar}
 */
export const ShelfSidebarLogo = ({ minimized }: { minimized: boolean }) => {
  const { logoPath } = config;

  /** If a custom logo is used, we just use that instead of doing the dynamic shelf typograpy */
  if (logoPath) {
    return minimized ? (
      <img
        src={logoPath.symbol}
        alt={ALT_TEXT}
        className="mx-1.5 inline h-[32px] transition duration-150 ease-linear"
      />
    ) : (
      <img
        src={logoPath.fullLogo}
        alt={ALT_TEXT}
        className="mx-1.5 inline h-[32px] transition duration-150 ease-linear"
      />
    );
  }

  return (
    <>
      <img
        src="/static/images/shelf-symbol.png"
        alt={ALT_TEXT}
        className="mx-1.5 inline h-[32px]"
      />
      <When truthy={!minimized}>
        <span className="logo-text transition duration-150 ease-linear">
          <ShelfTypography />
        </span>
      </When>
    </>
  );
};

/**
 * Logo shown in the header for mobile screen sizes
 */
export const ShelfMobileLogo = () => {
  const { logoPath } = config;

  if (logoPath) {
    return <img src={logoPath.fullLogo} alt={ALT_TEXT} className="h-full" />;
  }

  return (
    <img
      src="/static/images/logo-full-color(x2).png"
      alt="logo"
      className="h-full"
    />
  );
};

/**
 * Lego symbol
 */
export const ShelfSymbolLogo = ({ className }: { className?: string }) => {
  const { logoPath } = config;
  const classes = tw("mx-auto mb-2 size-12", className);

  if (logoPath) {
    return <img src={logoPath.symbol} alt={ALT_TEXT} className={classes} />;
  }

  return (
    <img src="/static/images/shelf-symbol.png" alt="logo" className={classes} />
  );
};

/**
 * Full logo
 */
export const ShelfFullLogo = ({ className }: { className?: string }) => {
  const { logoPath } = config;
  const classes = tw(className);

  if (logoPath) {
    return <img src={logoPath.fullLogo} alt={ALT_TEXT} className={classes} />;
  }

  return (
    <img
      src="/static/images/logo-full-color(x2).png"
      alt="logo"
      className={classes}
    />
  );
};
