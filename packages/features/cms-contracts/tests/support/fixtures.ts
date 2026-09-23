import { parseContractRelease, type CapabilityDefinition, type ContractRelease } from "@bernouy/cms-contracts";

export function stringSchema(maxLength = 128): Record<string, unknown> {
    return { type: "string", maxLength };
}

export function objectSchema(
    properties: Record<string, unknown>,
    required: readonly string[] = [],
): Record<string, unknown> {
    return { type: "object", properties, required };
}

export function capabilityDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    const response = {
        successStatuses: [200],
        contentTypes: ["application/json"],
        errorStatuses: { INVALID_RECIPIENT: 422 },
    };
    const binding = {
        transport: "http",
        method: "POST",
        path: "/v1/messages",
        input: { body: true },
        response,
    };
    const overrideBinding = overrides.binding as Record<string, unknown> | undefined;
    const overrideResponse = overrideBinding?.response as Record<string, unknown> | undefined;
    return {
        id: "email.message.send",
        description: "Send a transactional message.",
        access: "admin",
        behavior: { effect: "command", idempotency: "keyed", execution: "sync" },
        input: objectSchema(
            {
                recipient: { type: "string", format: "email", maxLength: 320 },
                templateId: stringSchema(64),
            },
            ["recipient", "templateId"],
        ),
        output: objectSchema({ messageId: stringSchema(128) }, ["messageId"]),
        errors: [{ code: "INVALID_RECIPIENT", retryable: false }],
        binding,
        ...overrides,
        ...(overrideBinding ? { binding: { ...overrideBinding, response: { ...response, ...overrideResponse } } } : {}),
    };
}

export function contractDocument(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        kind: "contract",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        contractId: "communication.email",
        name: "Email",
        version: "0.1.0",
        publisherId: "ulvia.official",
        capabilities: [capabilityDocument()],
        ...overrides,
    };
}

export function parsedContract(capabilityOverrides: Record<string, unknown> = {}): ContractRelease {
    return parseContractRelease({
        ...contractDocument(),
        capabilities: [capabilityDocument(capabilityOverrides)],
    });
}

export function capability(overrides: Record<string, unknown> = {}): CapabilityDefinition {
    return parsedContract(overrides).capabilities[0]!;
}
