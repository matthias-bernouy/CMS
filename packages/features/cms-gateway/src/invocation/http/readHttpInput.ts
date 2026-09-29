import { parseStrictJson } from "@bernouy/cms-repository/contracts/protocol";
import { GatewayError } from "cms-gateway/invocation/core/GatewayError";

const MAX_INPUT_BYTES = 1024 * 1024;

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
            if (length > MAX_INPUT_BYTES) {
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
        return parseStrictJson(bytes, MAX_INPUT_BYTES, 64);
    } catch {
        throw new GatewayError("invalid_input", "capability input is not bounded interoperable JSON");
    }
}
