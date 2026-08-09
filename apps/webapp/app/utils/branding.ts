/**
 * Resolves whether the authority mark is printed on downloadable labels.
 *
 * The stored field is still named `showShelfBranding` because renaming a
 * database column is a migration, not a rename — but what it now controls is
 * the EPDA mark from `config.logoPath`, not the upstream vendor's footer, which
 * this deployment never prints.
 *
 * @param override - Explicit preference coming from the current render context.
 * @param organizationDefault - The stored organization preference, if available.
 * @returns `true` when branding should be shown, defaulting to `true` when no
 * preference is provided.
 */
export const resolveShowShelfBranding = (
  override?: boolean,
  organizationDefault?: boolean,
): boolean => {
  if (typeof override === "boolean") {
    return override;
  }

  if (typeof organizationDefault === "boolean") {
    return organizationDefault;
  }

  return true;
};
