import { redirect } from "react-router";

/**
 * `/settings` renders nothing of its own — it forwards to its only section.
 *
 * That section used to be `general` (workspace name, logo, SSO domain,
 * ownership transfer). It, along with الحقول المخصّصة، طُرز الأصناف and
 * إعدادات البريد, was removed: one fixed authority, one workspace, and both
 * taxonomies held **zero rows** and were never referenced by the intake flow.
 *
 * الفريق is what is left, and it is the load-bearing one — it owns the
 * department desks (`isDepartment` team members), the non-registered
 * custodians, and role changes. Nothing else in the app can create those.
 */
export function loader() {
  return redirect("team");
}

export const shouldRevalidate = () => false;
