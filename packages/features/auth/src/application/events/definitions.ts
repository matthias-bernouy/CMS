import { defineEvent } from "@bernouy/ulvia-sdk";
import { accountCreatedPayload, emailVerifiedPayload } from "auth/accounts/events/schemas";
export const accountCreated = defineEvent({
    id: "account.created",
    description: "A new CMS member was durably created; logins of an existing member do not emit this fact.",
    sensitive: false,
    schema: accountCreatedPayload,
    filterKeys: ["provider"],
});
export const accountEmailVerified = defineEvent({
    id: "account.email-verified",
    description:
        "The first email-link or password-reset ownership proof for a CMS member was recorded. Administrative and delivery-disabled verification do not emit this fact.",
    sensitive: false,
    schema: emailVerifiedPayload,
    filterKeys: ["method"],
});
