import { transporter } from "~/emails/transporter.server";
import { ShelfError } from "~/utils/error";
import { Logger } from "~/utils/logger";
import { QueueNames, scheduler } from "~/utils/scheduler.server";
import type { EmailPayloadType } from "./types";
import { SMTP_FROM, SUPPORT_EMAIL } from "../utils/env";

/**
 * Domain stamped onto a user's email address when their account is soft-deleted
 * (`deleted+{randomId}@deleted.example.local`). Nothing is ever delivered to it —
 * `sendEmail` below drops any message addressed to this domain.
 */
export const SOFT_DELETED_EMAIL_DOMAIN = "@deleted.example.local";

/**
 * The pre-ORG domain. Still matched on send so that accounts soft-deleted
 * before the rename stay suppressed — the marker is persisted in `User.email`,
 * so changing the constant alone would silently start delivering mail to rows
 * written under the old value.
 *
 * Safe to delete once no `User.email` ends with it.
 */
const LEGACY_SOFT_DELETED_EMAIL_DOMAIN = "@deleted.shelf.nu";

// every node will execute 5 jobs(teamSize) every 3 minutes(newJobCheckIntervalSeconds),
// increase teamSize if you need better concurrency
// but keep email provider rate limiting and a potential n/w throughput load on postgress in mind
// teamSize of 20-25 is a good limit if we need to scale email throughput in the future
export const registerEmailWorkers = async () => {
  await scheduler.work<EmailPayloadType>(
    QueueNames.emailQueue,
    { newJobCheckIntervalSeconds: 60 * 3, teamSize: 5, includeMetadata: true },
    async (job) => {
      try {
        await triggerEmail(job.data);
      } catch (cause) {
        const isLastRetry =
          job.retrycount != null &&
          job.retrylimit != null &&
          job.retrycount >= job.retrylimit - 1;

        if (isLastRetry) {
          Logger.error(
            new ShelfError({
              cause,
              message: "Email permanently failed after exhausting all retries",
              additionalData: {
                payload: job.data,
                retryCount: job.retrycount,
                retryLimit: job.retrylimit,
              },
              label: "Email",
            }),
          );
        }

        throw cause;
      }
    },
  );
};

export const triggerEmail = async ({
  to,
  subject,
  text,
  html,
  from,
  replyTo,
}: EmailPayloadType) => {
  if (
    to.endsWith(SOFT_DELETED_EMAIL_DOMAIN) ||
    to.endsWith(LEGACY_SOFT_DELETED_EMAIL_DOMAIN)
  ) {
    Logger.warn(
      `Skipping email to soft-deleted user: ${to} (subject: ${subject})`,
    );
    return;
  }

  try {
    // send mail with defined transport object
    await transporter.sendMail({
      // why: deliberately a literal rather than `config.appName`. Importing the
      // config here pulls the whole env module into the email worker, and this
      // module's tests mock `~/utils/env` with only the two vars they need —
      // the extra named imports then fail at collection time. This is a
      // last-resort default anyway: real deployments set SMTP_FROM.
      from: from || SMTP_FROM || `"Asset Custody" <hello@example.com>`, // sender address
      replyTo: replyTo || SUPPORT_EMAIL, // reply to
      to, // list of receivers
      subject, // Subject line
      text, // plain text body
      html: html || "", // html body
    });
  } catch (cause) {
    throw new ShelfError({
      cause,
      message: "Unable to send email",
      additionalData: { to, subject, from },
      label: "Email",
    });
  }

  // verify connection configuration
  // transporter.verify(function (error) {
  //   if (error) {
  //     // eslint-disable-next-line no-console
  //     console.log(error);
  //   } else {
  //     // eslint-disable-next-line no-console
  //     console.log("Server is ready to take our messages");
  //   }
  // });

  // Message sent: <b658f8ca-6296-ccf4-8306-87d57a0b4321@example.com>

  // Preview only available when sending through an Ethereal account
  // console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
};
