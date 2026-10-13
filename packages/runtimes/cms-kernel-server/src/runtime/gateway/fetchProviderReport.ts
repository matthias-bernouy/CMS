import { assertKernelProviderHandshake } from "@bernouy/ulvia-provider/kernel";
import { ProviderKernelTransport } from "../provider/ProviderKernelTransport";

/** A bounded probe over the operator-configured private Kernel-to-Provider transport. */
export async function fetchProviderHandshake(transport: ProviderKernelTransport) {
    const signal = AbortSignal.timeout(5_000);
    const response = await transport.request("/ulvia/kernel/v1/handshake", {
        method: "GET",
        headers: { accept: "application/json" },
        signal,
    });
    if (!response.ok || !response.body) {
        throw new Error(`Provider handshake request failed (${response.status})`);
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const part = await reader.read();
            if (part.done) {
                break;
            }
            size += part.value.byteLength;
            if (size > 256 * 1024) {
                await reader.cancel();
                throw new Error("Provider handshake is too large");
            }
            chunks.push(part.value);
        }
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    assertKernelProviderHandshake(value);
    return value;
}
