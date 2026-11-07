import { defineContract } from "@bernouy/ulvia-sdk";
import { sendEmail } from "@bernouy/email/operations";
import { overview as emailerOverview } from "@bernouy/email/docs";
import { getSmtpConfiguration, updateSmtpConfiguration } from "@bernouy/email-smtp/operations";
import { overview as smtpOverview } from "@bernouy/email-smtp/docs";

const emailerContract = defineContract({
    contractId: "ulvia/cms.emailer",
    name: "CMS Emailer",
    description: "Deliver provider-neutral outbound CMS email.",
    version: "1.0.0",
    publisherId: "ulvia",
    catalogue: { "icon": "mail", "categories": ["administration", "infrastructure"] },
    documents: { "overview.md": emailerOverview },
    capabilities: {
        "emailer.send": {
            operation: sendEmail,
            access: "admin",
            behavior: { "effect": "command", "idempotency": "keyed", "execution": "sync", "sensitive": true },
            bindings: [
                {
                    "id": "http",
                    "transport": "http",
                    "method": "POST",
                    "path": "/send",
                    "input": { "body": true },
                    "response": {
                        "successStatuses": [200],
                        "contentTypes": ["application/json"],
                        "errorStatuses": { "INVALID_INPUT": 422, "EMAIL_DISABLED": 409, "CORE_UNAVAILABLE": 503 },
                    },
                },
            ],
        },
    },
});

export const smtpEmailerContract = defineContract({
    contractId: "ulvia/cms.emailer.smtp",
    name: "CMS SMTP Emailer",
    description: "Configure and deliver outbound CMS email through SMTP without exposing credentials.",
    version: "1.0.0",
    publisherId: "ulvia",
    catalogue: { "icon": "mail", "categories": ["administration", "infrastructure"] },
    extends: emailerContract,
    documents: { "overview.md": smtpOverview },
    capabilities: {
        "smtp.configuration.update": {
            operation: updateSmtpConfiguration,
            access: "admin",
            behavior: { "effect": "command", "idempotency": "natural", "execution": "sync", "sensitive": true },
            bindings: [
                {
                    "id": "http",
                    "transport": "http",
                    "method": "POST",
                    "path": "/configuration",
                    "input": { "body": true },
                    "response": {
                        "successStatuses": [200],
                        "contentTypes": ["application/json"],
                        "errorStatuses": { "INVALID_INPUT": 422, "CORE_UNAVAILABLE": 503 },
                    },
                },
            ],
        },
        "smtp.configuration.get": {
            operation: getSmtpConfiguration,
            access: "admin",
            behavior: { "effect": "query", "execution": "sync", "sensitive": true },
            bindings: [
                {
                    "id": "http",
                    "transport": "http",
                    "method": "GET",
                    "path": "/configuration",
                    "response": {
                        "successStatuses": [200],
                        "contentTypes": ["application/json"],
                        "errorStatuses": { "CORE_UNAVAILABLE": 503 },
                    },
                },
            ],
        },
    },
});
