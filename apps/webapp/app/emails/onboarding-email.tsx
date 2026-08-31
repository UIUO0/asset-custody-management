import { config } from "~/config/shelf.config";

/**
 * Plain-text onboarding email sent once, after a user completes the welcome
 * flow. Gated behind `config.sendOnboardingEmail` (`SEND_ONBOARDING_EMAIL`).
 *
 * Rewritten for the ORG deployment. The upstream version was Shelf's own
 * marketing copy — signed by a co-founder of "Shelf Asset Management, Inc."
 * and asking the recipient which features they would like built. Sending that
 * to authority staff would have been both confusing and a breach of the ORG
 * identity rule.
 *
 * Kept plain-text and English for now: email bodies are not localized yet, and
 * translating this one alone would leave the outgoing mail half-Arabic. Arabic
 * email templates land with phase 6.
 *
 * @param firstName - The recipient's first name, for the greeting.
 * @returns The rendered plain-text email body.
 * @see {@link file://./../routes/_welcome+/onboarding.tsx} — the only caller
 */
export const onboardingEmailText = ({
  firstName,
}: {
  firstName: string;
}) => `Hi ${firstName},

Welcome to ${config.appName} — the asset management system of the Government Agency.

You can now:

- Browse the asset register and request the assets you need
- Track what is currently in your custody
- Return assets and follow the status of your requests

If you need access to something you cannot see, or a permission you believe you should have, contact the IT department.

${config.appName}
Government Agency
`;
