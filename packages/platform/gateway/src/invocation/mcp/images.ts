import { capabilityBindings } from "@bernouy/ulvia-contracts/bindings";
import { GatewayError } from "cms-gateway/invocation/core/GatewayError";
import type { CapabilityDefinition } from "@bernouy/ulvia-contracts";
import type { GatewayResult } from "cms-gateway/invocation/interfaces/Invocation";
import type { McpToolResult } from "./interfaces";

export function supportsInlineImage(capability: CapabilityDefinition, maximum?: number): boolean {
    return (
        maximum !== undefined &&
        maximum > 0 &&
        maximum <= 4 * 1024 * 1024 &&
        capability.output.type === "binary" &&
        capability.output.maxBytes <= maximum &&
        capabilityBindings(capability).some(
            (binding) =>
                binding.transport === "http" &&
                binding.response.contentTypes.length === 1 &&
                binding.response.contentTypes[0] === "image/png",
        )
    );
}
export async function inlineImage(
    result: Extract<GatewayResult, { kind: "binary" }>,
    maximum: number,
): Promise<McpToolResult> {
    const reader = result.stream.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const item = await reader.read();
            if (item.done) {
                break;
            }
            size += item.value.byteLength;
            if (size > maximum) {
                throw new GatewayError("invalid_provider_response", "Inline image exceeds its byte limit");
            }
            chunks.push(item.value);
        }
        const bytes = Buffer.concat(chunks);
        if (
            result.contentType !== "image/png" ||
            bytes.byteLength < 24 ||
            !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ) {
            throw new GatewayError("invalid_provider_response", "Invalid inline image representation");
        }
        const output = { mimeType: "image/png" };
        return {
            content: [
                { type: "text", text: JSON.stringify({ output }) },
                { type: "image", mimeType: "image/png", data: bytes.toString("base64") },
            ],
            structuredContent: { output },
        };
    } finally {
        await reader.cancel().catch(() => undefined);
        reader.releaseLock();
    }
}
