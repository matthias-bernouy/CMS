import { createHash } from "node:crypto";
import type { CapabilityBinding } from "@bernouy/cms-repository/contracts/bindings";
import type { CapabilityDefinition, ContractDocumentationDefinition } from "@bernouy/cms-repository/contracts";
import { closedObject, mcpSchema } from "./schema";

export function capabilityToolName(contractId: string, capabilityId: string, bindingId = "mcp"): string {
    return `cap_${createHash("sha256")
        .update(`${contractId}\0${capabilityId}${bindingId === "mcp" ? "" : `\0${bindingId}`}`)
        .digest("hex")
        .slice(0, 32)}`;
}

export function capabilityTool(
    contractId: string,
    capability: CapabilityDefinition,
    digest: string,
    binding: Extract<CapabilityBinding, { transport: "mcp" }>,
    documentation: readonly ContractDocumentationDefinition[] = [],
) {
    const docs = (capability.docs ?? []).map((path) => ({
        reference: { contractId, releaseDigest: digest, path },
        title: documentation.find((doc) => doc.path === path)?.title ?? path,
    }));
    const description =
        binding.tool?.description ?? `${contractId}/${capability.id}: ${capability.description ?? capability.id}`;
    const help = docs.length
        ? `\n\nRelated documentation:\n${docs
              .slice(0, 3)
              .map((doc) => `- ${doc.title} (${doc.reference.path})`)
              .join("\n")}\nRead with documentation.get; search documentation before unfamiliar or multi-step work.`
        : "";
    const query = capability.behavior.effect === "query";
    const keyed = !query && capability.behavior.effect === "command" && capability.behavior.idempotency === "keyed";
    const output =
        capability.behavior.execution === "operation"
            ? closedObject({ operationId: { type: "string", format: "uuid" } })
            : capability.output.type === "binary"
              ? closedObject({ uri: { type: "string", format: "uri" }, mimeType: { type: "string" } })
              : mcpSchema(capability.output);
    const errors = capability.errors.map((error) =>
        closedObject({
            error: closedObject({
                code: { const: error.code },
                retryable: { const: error.retryable },
                ...(error.output ? { output: mcpSchema(error.output) } : {}),
            }),
        }),
    );
    return {
        name: binding.tool?.name ?? capabilityToolName(contractId, capability.id, binding.id),
        ...(binding.tool?.title ? { title: binding.tool.title } : {}),
        description: description + help,
        inputSchema: closedObject({
            input: mcpSchema(capability.input),
            ...(keyed ? { idempotencyKey: { type: "string", minLength: 1, maxLength: 512 } } : {}),
        }),
        outputSchema: { type: "object", anyOf: [closedObject({ output }), ...errors] },
        annotations: {
            readOnlyHint: query,
            destructiveHint: !query,
            idempotentHint:
                query || (capability.behavior.effect === "command" && capability.behavior.idempotency !== "none"),
            openWorldHint: true,
        },
        _meta: {
            "io.ulvia/contract": contractId,
            "io.ulvia/capability": capability.id,
            "io.ulvia/binding": binding.id,
            "io.ulvia/digest": digest,
            "io.ulvia/access": capability.access,
            ...(docs.length ? { "io.ulvia/docs": docs } : {}),
        },
    };
}
