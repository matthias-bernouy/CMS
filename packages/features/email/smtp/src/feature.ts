import { defineContract } from "@bernouy/ulvia-sdk";
import { emailerContract } from "@bernouy/email/feature";
import { getSmtpConfiguration } from "email-smtp/operations/configuration/get";
import { updateSmtpConfiguration } from "email-smtp/operations/configuration/update";

export const smtpEmailerContract = defineContract({
    contractId: "ulvia/cms.emailer.smtp",
    name: "CMS SMTP Emailer",
    description: "Configure and deliver outbound CMS email through SMTP without exposing credentials.",
    version: "1.0.0",
    publisherId: "ulvia",
    catalogue: { icon: "mail", categories: ["administration", "infrastructure"] },
    extends: emailerContract,
    documents: new URL("../docs/", import.meta.url),
    operations: [getSmtpConfiguration, updateSmtpConfiguration],
});
