import { capabilityBindings } from "@bernouy/cms-repository/contracts/bindings";
import { canonicalIJsonBytes, parseStrictJson } from "@bernouy/cms-repository/contracts/protocol";
import { GatewayError } from "cms-gateway/invocation/core/GatewayError";
import type { CapabilityMcpOptions, McpInvocationContext, McpToolResult } from "./interfaces";
import { capabilityTool, capabilityToolName } from "./tools";

export class McpProtocolError extends Error {
    constructor(
        readonly code: number,
        message: string,
    ) {
        super(message);
    }
}

/** MCP discovery and representation adapter. All execution passes through the supplied Gateway. */
export class CapabilityMcpBinding {
    constructor(private readonly options: CapabilityMcpOptions) {}

    async list(context: McpInvocationContext, cursor?: string) {
        const entries = await this.entries(context);
        if (cursor !== undefined && !/^[0-9]{1,4}$/u.test(cursor)) {
            throw new McpProtocolError(-32602, "Invalid tools cursor");
        }
        const offset = cursor === undefined ? 0 : Number(cursor);
        if (offset > entries.length) {
            throw new McpProtocolError(-32602, "Invalid tools cursor");
        }
        return {
            tools: entries
                .slice(offset, offset + 64)
                .map(({ contractId, capability, digest, binding }) =>
                    capabilityTool(contractId, capability, digest, binding),
                ),
            ...(offset + 64 < entries.length ? { nextCursor: String(offset + 64) } : {}),
        };
    }

    async call(name: string, args: unknown, context: McpInvocationContext): Promise<McpToolResult> {
        const entry = (await this.entries(context)).find(
            ({ contractId, capability, binding }) =>
                (binding.tool?.name ?? capabilityToolName(contractId, capability.id, binding.id)) === name,
        );
        if (!entry) {
            throw new McpProtocolError(-32602, "Unknown capability tool");
        }
        let value: Record<string, unknown>;
        try {
            value = parseStrictJson(canonicalIJsonBytes(args), 8 * 1024 * 1024, 64) as Record<string, unknown>;
        } catch {
            throw new McpProtocolError(-32602, "Tool arguments must be bounded interoperable JSON");
        }
        const keyed =
            entry.capability.behavior.effect === "command" && entry.capability.behavior.idempotency === "keyed";
        if (
            !value ||
            typeof value !== "object" ||
            Array.isArray(value) ||
            Object.keys(value).some((key) => key !== "input" && !(keyed && key === "idempotencyKey")) ||
            !value.input ||
            typeof value.input !== "object" ||
            Array.isArray(value.input) ||
            (keyed && (typeof value.idempotencyKey !== "string" || !value.idempotencyKey))
        ) {
            throw new McpProtocolError(-32602, "Invalid capability tool arguments");
        }
        const input = { ...value.input } as Record<string, unknown>;
        const binary = Object.entries(entry.capability.input.properties).find(([, schema]) => schema.type === "binary");
        let binaryBody;
        if (binary && Object.hasOwn(input, binary[0])) {
            if (
                typeof input[binary[0]] !== "string" ||
                (input[binary[0]] as string).length > 2_048 ||
                !this.options.resolveBinary
            ) {
                throw new McpProtocolError(-32602, "Binary input requires a host-authorized resource URI");
            }
            binaryBody = await this.options.resolveBinary(input[binary[0]] as string, entry.capability, context);
            delete input[binary[0]];
        }
        try {
            const result = await this.options.invoker.invoke({
                ...context,
                contractId: entry.contractId,
                capabilityId: entry.capability.id,
                bindingId: entry.binding.id,
                bindingTransport: "mcp",
                input,
                ...(keyed ? { idempotencyKey: value.idempotencyKey as string } : {}),
                ...(binaryBody ? { binaryBody } : {}),
            });
            if (result.responseEffect) {
                throw new GatewayError("unsupported_behavior", "MCP cannot apply browser session effects");
            }
            if (result.kind === "binary") {
                if (!this.options.publishBinary) {
                    await result.stream.cancel();
                    throw new GatewayError("unsupported_behavior", "Binary output requires a resource publisher");
                }
                const link = await this.options.publishBinary(result, entry.capability, context, input);
                return {
                    content: [link],
                    structuredContent: { output: { uri: link.uri, mimeType: result.contentType } },
                };
            }
            if (result.kind === "success" && entry.capability.behavior.effect === "command") {
                await this.options.onMutationSuccess?.({
                    contractId: entry.contractId,
                    capabilityId: entry.capability.id,
                });
            }
            const data =
                result.kind === "declared-error"
                    ? {
                          error: {
                              code: result.errorCode,
                              retryable: result.retryable,
                              ...(result.output === undefined ? {} : { output: result.output }),
                          },
                      }
                    : { output: result.output ?? null };
            return {
                content: [{ type: "text", text: JSON.stringify(data) }],
                structuredContent: data,
                ...(result.kind === "declared-error" ? { isError: true } : {}),
            };
        } catch (error) {
            if (!(error instanceof GatewayError)) {
                throw error;
            }
            return {
                isError: true,
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({
                            error: { code: error.code, ...(error.requestId ? { requestId: error.requestId } : {}) },
                        }),
                    },
                ],
            };
        }
    }

    private async entries(context: McpInvocationContext) {
        const contracts = await this.options.contracts(context);
        const entries = contracts.flatMap((contract) =>
            contract.release.capabilities.flatMap((capability) =>
                capabilityBindings(capability).flatMap((binding) =>
                    binding.transport === "mcp"
                        ? [
                              {
                                  contractId: contract.release.contractId,
                                  capability,
                                  binding,
                                  digest: contract.digest,
                              },
                          ]
                        : [],
                ),
            ),
        );
        if (
            entries.length > 1_024 ||
            new Set(
                entries.map(
                    ({ contractId, capability, binding }) =>
                        binding.tool?.name ?? capabilityToolName(contractId, capability.id, binding.id),
                ),
            ).size !== entries.length
        ) {
            throw new Error("MCP catalogue exceeds limits or contains duplicate tool identities");
        }
        // Session effects require an HTTP browser boundary and cannot be executed safely over MCP.
        return entries
            .filter(
                ({ capability }) =>
                    !capability.responseEffects?.length &&
                    (this.options.resolveBinary ||
                        !Object.values(capability.input.properties).some((schema) => schema.type === "binary")) &&
                    (this.options.publishBinary || capability.output.type !== "binary"),
            )
            .sort((a, b) => {
                const left = a.binding.tool?.name ?? capabilityToolName(a.contractId, a.capability.id, a.binding.id);
                const right = b.binding.tool?.name ?? capabilityToolName(b.contractId, b.capability.id, b.binding.id);
                return left < right ? -1 : left > right ? 1 : 0;
            });
    }
}
