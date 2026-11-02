import { expect } from "bun:test";
import type { connectBrowser } from "../../oauth";

export type Connection = Awaited<ReturnType<typeof connectBrowser>>;

export function invoke(
    connection: Connection,
    contract: string,
    capability: string,
    input: Record<string, unknown>,
    idempotencyKey?: string,
) {
    const tool = connection.tools.find(
        (entry) => entry._meta["io.ulvia/contract"] === contract && entry._meta["io.ulvia/capability"] === capability,
    );
    expect(tool).toBeDefined();
    return connection.rpc("tools/call", {
        name: tool!.name,
        arguments: { input, ...(idempotencyKey ? { idempotencyKey } : {}) },
    });
}

export async function operation(connection: Connection, operationId: string) {
    for (let attempt = 0; attempt < 50; attempt++) {
        const result = await connection.call("ulvia.cms.installations", "get-operation", { operationId });
        if (["succeeded", "failed"].includes(result.status)) {
            return result;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Operation ${operationId} did not finish within the bounded polling budget`);
}

export function refusal(
    result: { isError?: boolean; structuredContent: { error: { code: string; output: { message: string } } } },
    code: string,
) {
    expect(result.isError).toBe(true);
    expect(result.structuredContent.error.code).toBe(code);
    expect(result.structuredContent.error.output.message.length).toBeGreaterThan(0);
}

export async function stage<T>(name: string, work: () => Promise<T>) {
    const started = performance.now();
    try {
        const result = await work();
        console.log(`PASS ${name}: ${(performance.now() - started).toFixed(1)} ms`);
        return result;
    } catch (error) {
        throw new Error(`${name}: ${String(error)}`, { cause: error });
    }
}
