import { mcpCatalogueEntries } from "./catalogue";
import { inlineImage, supportsInlineImage } from "./images";
import { canonicalIJsonBytes, parseStrictJson, MAX_CAPABILITY_JSON_BYTES } from "@bernouy/ulvia-contracts/protocol";
import { GatewayError } from "cms-gateway/invocation/core/GatewayError";
import type { CapabilityMcpOptions, McpInvocationContext, McpToolResult } from "./interfaces";
import { capabilityTool } from "./tools";

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
                .map(({ contractId, capability, digest, binding, documentation }) =>
                    capabilityTool(
                        contractId,
                        capability,
                        digest,
                        binding,
                        documentation,
                        supportsInlineImage(capability, this.options.inlineImageBytes),
                    ),
                ),
            ...(offset + 64 < entries.length ? { nextCursor: String(offset + 64) } : {}),
        };
    }

    async call(name: string, args: unknown, context: McpInvocationContext): Promise<McpToolResult> {
        const entry = (await this.entries(context, name)).find(({ toolName }) => toolName === name);
        if (!entry) {
            throw new McpProtocolError(-32602, "Unknown capability tool");
        }
        let value: Record<string, unknown>;
        try {
            value = parseStrictJson(canonicalIJsonBytes(args), MAX_CAPABILITY_JSON_BYTES, 64) as Record<
                string,
                unknown
            >;
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
                if (supportsInlineImage(entry.capability, this.options.inlineImageBytes)) {
                    return await inlineImage(result, this.options.inlineImageBytes!);
                }
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
            if (result.kind === "not-modified") {
                throw new GatewayError(
                    "invalid_provider_response",
                    "MCP calls cannot return HTTP revalidation outcomes",
                );
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

    private async entries(context: McpInvocationContext, toolName?: string) {
        const targeted = toolName !== undefined && this.options.resolveToolContract;
        const selected = targeted ? await this.options.resolveToolContract!(toolName, context) : undefined;
        const contracts = targeted ? (selected ? [selected] : []) : await this.options.contracts(context);
        return mcpCatalogueEntries(
            contracts,
            Boolean(this.options.resolveBinary),
            Boolean(this.options.publishBinary),
            this.options.inlineImageBytes,
        );
    }
}
