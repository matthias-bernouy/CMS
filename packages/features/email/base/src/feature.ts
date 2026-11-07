import { defineContract } from "@bernouy/ulvia-sdk";
import { sendEmail } from "email/operations/send";

export const emailerContract = defineContract({
    contractId: "ulvia/cms.emailer",
    name: "CMS Emailer",
    description: "Deliver provider-neutral outbound CMS email.",
    version: "1.0.0",
    publisherId: "ulvia",
    catalogue: { icon: "mail", categories: ["administration", "infrastructure"] },
    documents: new URL("../docs/", import.meta.url),
    operations: [sendEmail],
});
