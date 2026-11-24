import { z, contractString } from "@bernouy/ulvia-sdk";
export const id = contractString({ minLength: 1, maxLength: 128 });
export const json = contractString({ maxLength: 1048576, sensitive: true });
export const revision = z.int().min(1);
export const draftOutput = z.strictObject({
    id,
    revision,
    definitionJson: json,
    parametersJson: json,
    publishedRevision: revision.nullable(),
    updatedAt: contractString({ format: "date-time", maxLength: 32 }),
});
export const issue = z.strictObject({
    code: contractString({ maxLength: 64 }),
    path: contractString({ maxLength: 16384 }),
});
export const pageSchema = z.strictObject({ cursor: id.optional(), limit: z.int().min(1).max(100) });
export const triggerOutput = z.strictObject({
    id,
    revision,
    workflowId: id,
    workflowRevision: revision,
    subscriptionId: id,
    subscriptionRevision: z.int().min(0),
    diagnostic: issue.optional(),
    state: contractString({
        enum: ["preparing", "active", "suspending", "suspended", "deleting", "deleted"],
        maxLength: 16,
    }),
});
export const runSummary = z.strictObject({
    failurePath: contractString({ maxLength: 16384 }).optional(),
    id,
    workflowId: id,
    workflowRevision: revision,
    revision,
    status: contractString({
        enum: ["queued", "running", "waiting", "succeeded", "failed", "outcomeUnknown", "suspended", "cancelled"],
        maxLength: 16,
    }),
    currentStep: id.nullable(),
    createdAt: contractString({ format: "date-time", maxLength: 32 }),
    updatedAt: contractString({ format: "date-time", maxLength: 32 }),
    failureCode: contractString({ maxLength: 128 }).optional(),
});
const stepOutput = z.strictObject({
    id,
    state: contractString({
        enum: ["pending", "running", "succeeded", "failed", "waiting", "outcomeUnknown"],
        maxLength: 16,
    }),
    attempts: z.int().min(0),
    errorCode: contractString({ maxLength: 128 }).optional(),
    operationId: id.optional(),
});
export const runOutput = runSummary.extend({
    steps: z.array(stepOutput).max(128).readonly(),
    resultJson: json.optional(),
});
const errors = Object.fromEntries(
    [
        "INVALID_INPUT",
        "INVALID_DEFINITION",
        "FORBIDDEN",
        "NOT_FOUND",
        "REVISION_CONFLICT",
        "DEFINITION_CONFLICT",
        "TRIGGER_CONFLICT",
        "RUN_CONFLICT",
        "DELIVERY_CONFLICT",
        "INVALID_STATE",
        "VALUE_TOO_LARGE",
        "CORE_UNAVAILABLE",
    ].map((code) => [
        code,
        {
            retryable: code === "CORE_UNAVAILABLE",
            output: z.strictObject({
                message: contractString({ maxLength: 512 }),
                path: contractString({ maxLength: 16384 }).optional(),
            }),
        },
    ]),
);
export const command = {
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
    errors,
    docs: ["overview.md"],
} as const;
export const query = { ...command, behavior: { effect: "query", execution: "sync", sensitive: true } } as const;
export function binding(method: "POST" | "QUERY", path: string) {
    return {
        id: "http",
        transport: "http",
        method,
        path,
        input: { body: true },
        response: {
            successStatuses: [200],
            contentTypes: ["application/json"],
            errorStatuses: {
                INVALID_INPUT: 422,
                INVALID_DEFINITION: 422,
                FORBIDDEN: 403,
                NOT_FOUND: 404,
                REVISION_CONFLICT: 409,
                DEFINITION_CONFLICT: 409,
                TRIGGER_CONFLICT: 409,
                RUN_CONFLICT: 409,
                DELIVERY_CONFLICT: 409,
                INVALID_STATE: 409,
                VALUE_TOO_LARGE: 413,
                CORE_UNAVAILABLE: 503,
            },
        },
    } as const;
}
