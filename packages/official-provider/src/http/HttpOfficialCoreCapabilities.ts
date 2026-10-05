import { parseStrictJson } from "@bernouy/cms-repository/contracts/protocol";
import type { OfficialCoreCapabilities } from "../core/coreCapabilities";

const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

export class HttpOfficialCoreCapabilities implements OfficialCoreCapabilities {
    readonly #url: string;
    readonly #token: string;
    readonly #fetch: typeof fetch;

    constructor(url: string, token: string, fetcher: typeof fetch = fetch) {
        const parsed = new URL(url);
        if (
            parsed.protocol !== "http:" ||
            !["127.0.0.1", "[::1]"].includes(parsed.hostname) ||
            parsed.username ||
            parsed.password ||
            parsed.search ||
            parsed.hash
        ) {
            throw new TypeError("The local Core capability URL must use loopback HTTP.");
        }
        if (token.length < 24 || token.length > 256) {
            throw new TypeError("The local Core capability token is invalid.");
        }
        this.#url = parsed.href;
        this.#token = token;
        this.#fetch = fetcher;
    }

    async invoke(contractId: string, capabilityId: string, input: Readonly<Record<string, unknown>>): Promise<unknown> {
        const response = await this.#fetch(this.#url, {
            method: "POST",
            redirect: "manual",
            signal: AbortSignal.timeout(5_000),
            headers: {
                Authorization: `Bearer ${this.#token}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ contractId, capabilityId, input }),
        });
        if (response.status !== 200 || response.headers.get("content-type")?.split(";", 1)[0] !== "application/json") {
            await response.body?.cancel();
            throw new Error("The selected local Core rejected the capability call.");
        }
        const bytes = await readBoundedResponse(response, MAX_RESPONSE_BYTES);
        return parseStrictJson(bytes, MAX_RESPONSE_BYTES, 32);
    }
}

async function readBoundedResponse(response: Response, limit: number): Promise<Uint8Array> {
    if (!response.body) {
        return new Uint8Array();
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const next = await reader.read();
            if (next.done) {
                break;
            }
            size += next.value.byteLength;
            if (size > limit) {
                await reader.cancel();
                throw new Error("The selected local Core returned an oversized capability response.");
            }
            chunks.push(next.value);
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
    return bytes;
}
