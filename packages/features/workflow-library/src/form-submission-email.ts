import { defineWorkflow } from "@bernouy/ulvia-sdk";

/** Generic metadata notification. Administrators explicitly map permitted answer fields in custom variants. */
export const formSubmissionEmail = defineWorkflow({
    kind: "workflow",
    format: "ulvia-workflow-manifest/v1",
    workflowId: "ulvia/form-submission-email",
    publisherId: "ulvia",
    version: "1.0.0",
    name: "Form submission email",
    description: "Render a configured email template and notify one recipient when the selected form is submitted.",
    documentation:
        "Install and configure formId, recipient, templateId and templateVersion; then publish and activate explicitly. The published Email Template accepts submissionId, formId and receivedAt variables. This generic workflow passes metadata only. Map approved, non-sensitive answer fields in a custom variant. Retiring a publication stops future runs without undoing delivered email.",
    requirements: [
        { contractId: "ulvia/cms.forms", versionRange: "^2.0.0", capabilityIds: [], eventIds: ["submission.created"] },
        {
            contractId: "ulvia/cms.email-templates",
            versionRange: "^1.0.0",
            capabilityIds: ["templates.render"],
            eventIds: [],
        },
        { contractId: "ulvia/cms.emailer", versionRange: "^1.0.0", capabilityIds: ["emailer.send"], eventIds: [] },
    ],
    definition: {
        format: "ulvia-workflow/v1",
        inputSchema: { type: "object", properties: {}, required: [] },
        parametersSchema: {
            type: "object",
            properties: {
                formId: { type: "string", format: "uuid", maxLength: 36 },
                recipient: { type: "string", format: "email", maxLength: 320 },
                templateId: { type: "string", format: "uuid", maxLength: 36 },
                templateVersion: { type: "integer", minimum: 1, maximum: 9007199254740991 },
            },
            required: ["formId", "recipient", "templateId", "templateVersion"],
        },
        outputSchema: { type: "boolean" },
        trigger: {
            kind: "event",
            contractId: "ulvia/cms.forms",
            eventType: "submission.created",
            filter: { kind: "object", fields: { formId: { kind: "parameter", path: "/formId" } } },
        },
        entry: "has-data",
        steps: [
            {
                id: "has-data",
                kind: "condition",
                test: { kind: "exists", value: { kind: "trigger", path: "/data" } },
                then: "render",
                otherwise: null,
            },
            {
                id: "render",
                kind: "call",
                target: { contractId: "ulvia/cms.email-templates", capabilityId: "templates.render" },
                input: {
                    kind: "object",
                    fields: {
                        id: { kind: "parameter", path: "/templateId" },
                        version: { kind: "parameter", path: "/templateVersion" },
                        values: {
                            kind: "array",
                            items: [
                                {
                                    kind: "object",
                                    fields: {
                                        name: { kind: "literal", value: "submissionId" },
                                        value: { kind: "trigger", path: "/data/submissionId" },
                                    },
                                },
                                {
                                    kind: "object",
                                    fields: {
                                        name: { kind: "literal", value: "formId" },
                                        value: { kind: "trigger", path: "/data/formId" },
                                    },
                                },
                                {
                                    kind: "object",
                                    fields: {
                                        name: { kind: "literal", value: "receivedAt" },
                                        value: { kind: "trigger", path: "/data/receivedAt" },
                                    },
                                },
                            ],
                        },
                    },
                },
                next: "notify",
                onError: {},
            },
            {
                id: "notify",
                kind: "call",
                target: { contractId: "ulvia/cms.emailer", capabilityId: "emailer.send" },
                input: {
                    kind: "object",
                    fields: {
                        toEmail: { kind: "parameter", path: "/recipient" },
                        subject: { kind: "step", stepId: "render", path: "/subject" },
                        text: { kind: "step", stepId: "render", path: "/text" },
                    },
                },
                next: null,
                onError: {},
            },
        ],
        output: { kind: "literal", value: true },
    },
});
