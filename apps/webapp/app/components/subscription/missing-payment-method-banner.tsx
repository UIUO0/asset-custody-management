import { CustomerPortalForm } from "./customer-portal-form";

export function MissingPaymentMethodBanner() {
  return (
    <div
      role="alert"
      className="-mx-4 bg-warning-600 px-4 py-3 text-center text-sm text-static-white"
    >
      Your subscription has no payment method. Please{" "}
      <CustomerPortalForm
        buttonText="add a payment method"
        className="inline"
        buttonProps={{
          variant: "link",
          className:
            "font-semibold text-static-white underline hover:text-static-white/80",
        }}
      />{" "}
      before your next billing date to avoid service interruption.
    </div>
  );
}
