import { defineWorkflow } from "@bernouy/ulvia-sdk";
import {
    emailParameters,
    emailRequirements,
    emptyInput,
    hasData,
    renderEmail,
    sendEmail,
    member,
    trigger,
} from "./email/steps";
export const accountWelcomeEmail = defineWorkflow({
    kind: "workflow",
    format: "ulvia-workflow-manifest/v1",
    workflowId: "ulvia/account-welcome-email",
    publisherId: "ulvia",
    version: "1.0.0",
    name: "Verified account welcome email",
    description: "Welcome a member after a real email ownership proof, using an administrator-authorized profile read.",
    documentation:
        "Install, configure templateId/templateVersion, publish and activate explicitly. Text variables: accountRef, recipientEmail, verifiedAt, method. Access security emails remain unchanged. Administrative or delivery-disabled verification emits no ownership-proof event. The workflow reads the current member through get-event-account, requires an email and the original membership creation time, and skips a deleted or replaced membership. In-progress mail may still finish after deletion.",
    requirements: [
        {
            contractId: "ulvia/cms.access",
            versionRange: "^1.2.0",
            capabilityIds: ["get-event-account"],
            eventIds: ["account.email-verified"],
        },
        ...emailRequirements,
    ],
    definition: {
        format: "ulvia-workflow/v1",
        inputSchema: emptyInput,
        parametersSchema: { type: "object", properties: emailParameters, required: ["templateId", "templateVersion"] },
        outputSchema: { type: "boolean" },
        trigger: { kind: "event", contractId: "ulvia/cms.access", eventType: "account.email-verified" },
        entry: "has-data",
        steps: [
            hasData("read-member"),
            {
                id: "read-member",
                kind: "call",
                target: { contractId: "ulvia/cms.access", capabilityId: "get-event-account" },
                input: { kind: "object", fields: { accountRef: trigger("accountRef") } },
                next: "has-email",
                onError: { NOT_FOUND: "skip" },
            },
            {
                id: "has-email",
                kind: "condition",
                test: { kind: "exists", value: member("email") },
                then: "same-member",
                otherwise: null,
            },
            {
                id: "same-member",
                kind: "condition",
                test: {
                    kind: "compare",
                    operator: "eq",
                    left: member("createdAt"),
                    right: trigger("accountCreatedAt"),
                },
                then: "render",
                otherwise: null,
            },
            renderEmail({
                accountRef: trigger("accountRef"),
                recipientEmail: member("email"),
                verifiedAt: trigger("verifiedAt"),
                method: trigger("method"),
            }),
            sendEmail(member("email")),
            { id: "skip", kind: "condition", test: { kind: "literal", value: true }, then: null, otherwise: null },
        ],
        output: { kind: "literal", value: true },
    },
});
