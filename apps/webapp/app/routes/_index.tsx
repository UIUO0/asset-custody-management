import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { appendToMetaTitle } from "~/utils/append-to-meta-title";
import { getLandingRouteForUser } from "~/utils/landing-route.server";

export const meta = () => [{ title: appendToMetaTitle("Home") }];

export const loader = async ({ context, request }: LoaderFunctionArgs) => {
  if (context.isAuthenticated) {
    // Role-dependent: an employee lands on their own custody, not on the
    // organisation-wide register the sidebar hides from them.
    const { userId } = context.getSession();

    return redirect(await getLandingRouteForUser({ userId, request }));
  }

  return redirect("/login");
};

export default function Route() {
  return null;
}
