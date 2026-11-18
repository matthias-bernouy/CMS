import { expect, test } from "bun:test";
import { inventoryFixture } from "../../fixtures/inventory";
import { prepareConnection, prepareConnectionRead } from "./connection";
import type { ScenarioClient } from "../../harness/clients/session";
import type { QueryEnvironment } from "../queries/execute";

test("disconnect samples restore the original publication credential after their persisted-state checks", async () => {
    const fixture = await inventoryFixture();
    const token = "test-only-publication-token";
    const origin = "http://registry.localhost:5101";
    const emptySession = { origin, cookie: "test-cookie", token: "test-token", subjectId: "test-subject", tools: [] };
    const environment: QueryEnvironment = {
        stack: {
            id: "unit",
            providerName: "unit",
            edgeName: "unit",
            instanceId: "unit",
            restartProvider: async () => {},
        },
        main: emptySession,
        registry: { ...emptySession, publicationToken: token },
    };
    let configured = true;
    const writes: string[] = [];
    const client: ScenarioClient = async (contract, capability, binding, input, assert) => {
        expect(contract).toBe("ulvia/cms.authoring");
        expect(binding).toBe("http");
        if (capability === "configure-connection") {
            expect(input.token).toBe(token);
            configured = true;
            writes.push("restore-original");
        } else if (capability === "disconnect-connection") {
            expect(input).toEqual({});
            configured = false;
            writes.push("disconnect");
        }
        const output = { configured, repositoryUrl: origin, repositoryId: configured ? "fixture-repository" : null };
        await assert?.(output);
        return { output, observation: fixture.measurement };
    };
    const sample = await prepareConnection(client, environment, "disconnect-connection", "http");
    await sample.send();
    await sample.verify?.();
    expect(configured).toBe(false);
    await sample.close?.();
    expect(configured).toBe(true);
    expect(writes).toEqual(["restore-original", "disconnect", "restore-original"]);
});

test("connection reader invalidation requires a fresh disconnected DTO and restores the exact test credential on all exits", async () => {
    const fixture = await inventoryFixture();
    for (const binding of ["http", "mcp"]) {
        let configured = true;
        let restoreCount = 0;
        let primingFails = false;
        let leak = false;
        const origin = "http://registry.localhost:5101";
        const session = { origin, cookie: "owned-main", token: "owned-mcp", subjectId: "owned", tools: [] };
        const environment: QueryEnvironment = {
            stack: {
                id: "unit",
                providerName: "unit",
                edgeName: "unit",
                instanceId: "unit",
                restartProvider: async () => {},
            },
            main: session,
            registry: { ...session, cookie: "foreign-registry", publicationToken: "original-test-token" },
        };
        const events: string[] = [];
        const client: ScenarioClient = async (_contract, capability, selectedBinding, input, assert, options) => {
            events.push(`${capability}:${selectedBinding}`);
            if (options?.httpCredentials?.cookie === "foreign-registry") {
                return { observation: { ...fixture.measurement, validated: false, status: 401 }, output: undefined };
            }
            if (capability === "configure-connection") {
                expect(input.token).toBe("original-test-token");
                restoreCount++;
                configured = true;
            } else if (capability === "disconnect-connection") {
                configured = false;
            } else if (primingFails) {
                throw new Error("Owned fixture prime failed");
            }
            const output = {
                configured,
                repositoryUrl: origin,
                repositoryId: configured ? "fixture" : null,
                ...(leak ? { token: "private-test-token" } : {}),
            };
            await assert?.(output);
            return { observation: fixture.measurement, output };
        };
        const sample = await prepareConnectionRead(client, environment, binding);
        expect(events).toEqual(["configure-connection:http", "get-connection:http", "disconnect-connection:http"]);
        await sample.send();
        await sample.verify?.();
        expect(configured).toBe(false);
        leak = true;
        await expect(sample.send()).rejects.toThrow("authoring-connection-stale-or-sensitive-state");
        leak = false;
        await sample.close?.();
        expect(configured).toBe(true);
        expect(restoreCount).toBe(2);
        primingFails = true;
        await expect(prepareConnectionRead(client, environment, binding)).rejects.toThrow("Owned fixture prime failed");
        expect(configured).toBe(true);
        expect(restoreCount).toBe(4);
    }
});
