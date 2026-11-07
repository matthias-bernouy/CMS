import { defineFeature } from "@bernouy/ulvia-sdk";
import { sendEmail } from "email/capabilities/send";

export const emailerFeature = defineFeature({
    contractId: "ulvia/cms.emailer",
    name: "CMS Emailer",
    description: "Deliver provider-neutral outbound CMS email.",
    version: "1.0.0",
    publisherId: "ulvia",
    catalogue: { icon: "mail", categories: ["administration", "infrastructure"] },
    documents: new URL("../docs/", import.meta.url),
    capabilities: [sendEmail],
});

export type { EmailerServices } from "email/interfaces/EmailerServices";
