/** Small helper that appends the EPDA name to the current route meta title */
export const appendToMetaTitle = (title: string | null | undefined) =>
  `${title ? title : "Not found"} | هيئة تطوير المنطقة الشرقية`;
