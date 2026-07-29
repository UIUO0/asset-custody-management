/**
 * Backwards-compatible re-export — see the neutral module for why the `.client`
 * suffix was a bug rather than a hint.
 *
 * @see {@link file://./custody-and-bookings-permissions.validator.ts}
 */

export {
  userHasCustodyViewPermission,
  userCanViewSpecificCustody,
  type OrganizationPermissionSettings,
} from "./custody-and-bookings-permissions.validator";
