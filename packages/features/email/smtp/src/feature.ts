import { defineFeature } from "@bernouy/ulvia-sdk";
import { emailerFeature } from "@bernouy/email/feature";
import { getSmtpConfiguration } from "email-smtp/capabilities/configuration/get";
import { updateSmtpConfiguration } from "email-smtp/capabilities/configuration/update";

export const smtpEmailerFeature = defineFeature({
    contractId: "ulvia/cms.emailer.smtp",
    name: "CMS SMTP Emailer",
    description: "Configure and deliver outbound CMS email through SMTP without exposing credentials.",
    version: "1.0.0",
    publisherId: "ulvia",
    catalogue: { icon: "mail", categories: ["administration", "infrastructure"] },
    extends: emailerFeature,
    documents: new URL("../docs/", import.meta.url),
    capabilities: [getSmtpConfiguration, updateSmtpConfiguration],
});

export type { SmtpEmailerServices } from "email-smtp/interfaces/SmtpEmailerServices";
