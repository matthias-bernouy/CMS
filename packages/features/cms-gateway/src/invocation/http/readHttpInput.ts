import { MAX_CAPABILITY_JSON_DEPTH, parseStrictJson } from "@bernouy/cms-repository/contracts/protocol";
import { GatewayError } from "cms-gateway/invocation/core/GatewayError";
import { MAX_GATEWAY_JSON_BYTES } from "cms-gateway/invocation/core/snapshotInvocation";

/** Reads the caller's input envelope without trusting content length or JSON.parse defaults. */
export async function readGatewayHttpInput(request: Request): Promise<unknown> {
    const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (contentType !== "application/json") {
        throw new GatewayError("invalid_input", "capability input must be JSON");
    }
    const reader = request.body?.getReader();
    if (!reader) {
        throw new GatewayError("invalid_input", "capability input is required");
    }
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) {
                break;
            }
            length += value.byteLength;
            if (length > MAX_GATEWAY_JSON_BYTES) {
                await reader.cancel().catch(() => undefined);
                throw new TypeError("input exceeds gateway limit");
            }
            chunks.push(value);
        }
        const bytes = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return parseStrictJson(bytes, MAX_GATEWAY_JSON_BYTES, MAX_CAPABILITY_JSON_DEPTH);
    } catch {
        throw new GatewayError("invalid_input", "capability input is not bounded interoperable JSON");
    }
}
