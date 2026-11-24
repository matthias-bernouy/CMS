import { defineWorkflow } from "@bernouy/ulvia-sdk";
import {
    emailParameters,
    emailRequirements,
    emptyInput,
    hasData,
    renderEmail,
    sendEmail,
    parameter,
    trigger,
} from "./email/steps";
export const accountCreatedEmail = defineWorkflow({
    kind: "workflow",
    format: "ulvia-workflow-manifest/v1",
    workflowId: "ulvia/account-created-email",
    publisherId: "ulvia",
    version: "1.0.0",
    name: "New account notification",
    description: "Notify a configured team recipient when a new CMS member is created.",
    documentation:
        "Install, configure recipient/templateId/templateVersion, publish and activate explicitly. Template text variables: accountRef, provider, createdAt. Receives no account email, credential, token or grant. Existing-member logins do not emit creation events. Security email remains owned by Access.",
    requirements: [
        { contractId: "ulvia/cms.access", versionRange: "^1.2.0", capabilityIds: [], eventIds: ["account.created"] },
        ...emailRequirements,
    ],
    definition: {
        format: "ulvia-workflow/v1",
        inputSchema: emptyInput,
        parametersSchema: {
            type: "object",
            properties: { ...emailParameters, recipient: { type: "string", format: "email", maxLength: 320 } },
            required: ["recipient", "templateId", "templateVersion"],
        },
        outputSchema: { type: "boolean" },
        trigger: { kind: "event", contractId: "ulvia/cms.access", eventType: "account.created" },
        entry: "has-data",
        steps: [
            hasData("render"),
            renderEmail({
                accountRef: trigger("accountRef"),
                provider: trigger("provider"),
                createdAt: trigger("createdAt"),
            }),
            sendEmail(parameter("recipient")),
        ],
        output: { kind: "literal", value: true },
    },
});
