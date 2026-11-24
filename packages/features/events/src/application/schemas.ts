import { z, contractString } from "@bernouy/ulvia-sdk";
export const id = contractString({ minLength: 1, maxLength: 128 });
export const hash = contractString({ minLength: 64, maxLength: 64 });
const digest = contractString({ minLength: 71, maxLength: 71 });
export const namespace = contractString({ minLength: 1, maxLength: 193 });
export const json = contractString({ maxLength: 1048576, sensitive: true });
export const cursor = contractString({ maxLength: 256 });
export const revision = z.int().min(1);
export const summary = z.strictObject({
    definitionId: hash,
    contractId: namespace,
    installationId: id,
    eventType: id,
    version: contractString({ minLength: 5, maxLength: 64 }),
    digest,
    sensitive: z.boolean(),
    filterKeys: z.array(id).max(8).readonly().optional(),
    retired: z.boolean(),
    createdAt: contractString({ format: "date-time", maxLength: 32 }),
});
export const configuration = z.strictObject({
    definitionId: hash,
    definitionDigest: digest,
    filterJson: json.optional(),
    enabled: z.boolean(),
    delivery: z.strictObject({ contractId: namespace, capabilityId: id }),
});
export const subscription = z.strictObject({
    subscriptionId: id,
    consumerContractId: namespace,
    revision,
    configuration,
    createdAt: contractString({ format: "date-time", maxLength: 32 }),
    updatedAt: contractString({ format: "date-time", maxLength: 32 }),
});
const codes = [
    "INVALID_INPUT",
    "FORBIDDEN",
    "NOT_FOUND",
    "DEFINITION_CONFLICT",
    "SCHEMA_VERSION_CONFLICT",
    "DEFINITION_RETIRED",
    "DEFINITION_IN_USE",
    "PUBLICATION_CONFLICT",
    "SUBSCRIPTION_CONFLICT",
    "REVISION_CONFLICT",
    "CAPACITY_EXCEEDED",
    "CORE_UNAVAILABLE",
] as const;
const errors = Object.fromEntries(
    codes.map((code) => [
        code,
        {
            retryable: code === "CORE_UNAVAILABLE",
            output: z.strictObject({ message: contractString({ maxLength: 512 }) }),
        },
    ]),
);
export const command = {
    access: "admin",
    behavior: { effect: "command", execution: "sync", idempotency: "natural", sensitive: true },
    docs: ["overview.md"],
    errors,
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
                FORBIDDEN: 403,
                NOT_FOUND: 404,
                DEFINITION_CONFLICT: 409,
                SCHEMA_VERSION_CONFLICT: 409,
                DEFINITION_RETIRED: 409,
                DEFINITION_IN_USE: 409,
                PUBLICATION_CONFLICT: 409,
                SUBSCRIPTION_CONFLICT: 409,
                REVISION_CONFLICT: 409,
                CAPACITY_EXCEEDED: 429,
                CORE_UNAVAILABLE: 503,
            },
        },
    } as const;
}
