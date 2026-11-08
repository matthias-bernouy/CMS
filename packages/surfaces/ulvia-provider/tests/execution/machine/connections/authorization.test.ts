import { expect, test } from "bun:test";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import { connectionInput, connectionTransport } from "./transport";

test("pairing requires its signed connection authority before any service mutation", async () => {
    const configured: unknown[] = [];
    const call = await connectionTransport({
        configure: async (input) => {
            configured.push(input);
            return { connectionId: input.connectionId, configured: true };
        },
    });
    const hostile: Partial<ProviderInvocationClaims>[] = [
        { connectionId: undefined },
        { connectionId: "other" },
        { connectionId: "connection-a", subjectId: "user" },
        { connectionId: "connection-a", sourceInstallationId: "caller" },
        { connectionId: "connection-a", systemServiceId: "cms-edge" },
    ];
    for (const claims of hostile) {
        const response = await call(connectionInput, claims);
        expect(response.status).toBe(403);
        const text = await response.text();
        expect(text).toContain("FORBIDDEN");
        expect(text).not.toContain(connectionInput.token);
    }
    const { connectionId: _ignored, ...inputWithoutConnection } = connectionInput;
    for (const input of [
        inputWithoutConnection,
        { ...connectionInput, generation: 0 },
        { ...connectionInput, generation: Number.MAX_SAFE_INTEGER + 1 },
        { ...connectionInput, token: "x".repeat(4097) },
        { ...connectionInput, extra: true },
    ]) {
        expect((await call(input)).status).toBe(400);
    }
    expect((await call(connectionInput, {}, { authenticated: false })).status).toBe(401);
    expect((await call(connectionInput, { instanceId: "instance-b" })).status).toBe(401);
    expect((await call(connectionInput, { contractVersion: "1.1.0" })).status).toBeGreaterThanOrEqual(400);
    expect(configured).toEqual([]);
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ connectionId: "connection-a", configured: true });
    expect(configured).toEqual([connectionInput]);
});

test("unsigned connection headers cannot override a different signed authority", async () => {
    let writes = 0;
    const call = await connectionTransport({
        configure: async (input) => {
            writes++;
            return { connectionId: input.connectionId, configured: true };
        },
    });
    const response = await call(
        connectionInput,
        { connectionId: "other" },
        { headers: { "x-ulvia-connection-id": "connection-a" } },
    );
    expect(response.status).toBe(403);
    expect(writes).toBe(0);
});
