import type { WorkflowExpression, WorkflowStep, WorkflowManifest } from "@bernouy/ulvia-sdk";
export const parameter = (name: string): WorkflowExpression => ({ kind: "parameter", path: `/${name}` });
export const trigger = (name: string): WorkflowExpression => ({ kind: "trigger", path: `/data/${name}` });
export const member = (name: string): WorkflowExpression => ({ kind: "step", stepId: "read-member", path: `/${name}` });
export const emailParameters = {
    templateId: { type: "string", format: "uuid", maxLength: 36 },
    templateVersion: { type: "integer", minimum: 1, maximum: 9007199254740991 },
} as const;
export const emptyInput = { type: "object", properties: {}, required: [] } as const;
export const emailRequirements: WorkflowManifest["requirements"] = [
    {
        contractId: "ulvia/cms.email-templates",
        versionRange: "^1.0.0",
        capabilityIds: ["templates.render"],
        eventIds: [],
    },
    { contractId: "ulvia/cms.emailer", versionRange: "^1.0.0", capabilityIds: ["emailer.send"], eventIds: [] },
];
export const hasData = (next: string): WorkflowStep => ({
    id: "has-data",
    kind: "condition",
    test: { kind: "exists", value: { kind: "trigger", path: "/data" } },
    then: next,
    otherwise: null,
});
export function renderEmail(values: Readonly<Record<string, WorkflowExpression>>): WorkflowStep {
    return {
        id: "render",
        kind: "call",
        target: { contractId: "ulvia/cms.email-templates", capabilityId: "templates.render" },
        input: {
            kind: "object",
            fields: {
                id: parameter("templateId"),
                version: parameter("templateVersion"),
                values: {
                    kind: "array",
                    items: Object.entries(values).map(([name, value]) => ({
                        kind: "object",
                        fields: {
                            name: { kind: "literal", value: name },
                            value,
                        },
                    })),
                },
            },
        },
        next: "notify",
        onError: {},
    };
}
export const sendEmail = (recipient: WorkflowExpression): WorkflowStep => ({
    id: "notify",
    kind: "call",
    target: { contractId: "ulvia/cms.emailer", capabilityId: "emailer.send" },
    input: {
        kind: "object",
        fields: {
            toEmail: recipient,
            subject: { kind: "step", stepId: "render", path: "/subject" },
            text: { kind: "step", stepId: "render", path: "/text" },
        },
    },
    next: null,
    onError: {},
});
