import { appendFileSync } from "node:fs";

export type OfflineRuntimeNetwork = Readonly<{
    ULVIA_TEST_HTTP_ORIGINS: string;
    ULVIA_TEST_DENIED_NETWORK: string;
}>;

const allowed = JSON.parse(process.env.ULVIA_TEST_HTTP_ORIGINS ?? "[]") as string[];
const denied = process.env.ULVIA_TEST_DENIED_NETWORK;
const original = globalThis.fetch;
globalThis.fetch = ((input, init) => {
    const origin = new URL(input instanceof Request ? input.url : input.toString()).origin;
    if (!allowed.includes(origin)) {
        if (denied) {
            appendFileSync(denied, `${origin}\n`);
        }
        throw new Error(`Runtime HTTP destination is unavailable in the offline journey: ${origin}`);
    }
    return original(input, init);
}) as typeof fetch;
