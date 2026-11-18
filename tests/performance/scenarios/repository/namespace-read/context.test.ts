import { expect, test } from "bun:test";
import { namespaceReadContext } from "./context";
import { inventoryFixture } from "../../../fixtures/inventory";
import { performanceCapabilityInventory } from "../../../capabilities/inventory";
import type { scenarioClient } from "../../../harness/clients/session";
import type { QueryEnvironment } from "../../queries/execute";
import type { NamespaceEvidence } from "./oracles";

test("namespace preparation obeys account quotas, builds real suspension history and restores after partial credential setup", async () => {
    const fixture = await inventoryFixture();
    const inventory = await performanceCapabilityInventory();
    const origin = "http://registry.localhost:5101";
    const environment: QueryEnvironment = {
        stack: {
            id: "unit",
            providerName: "unit",
            edgeName: "unit",
            instanceId: "unit",
            restartProvider: async () => {},
        },
        main: { origin, cookie: "main", subjectId: "main", token: "", tools: [] },
        registry: { origin, cookie: "registry-root", subjectId: "root", publicationToken: "original-test-token" },
    };
    for (const fail of [false, true]) {
        const rows = new Map<string, Map<string, NamespaceEvidence>>();
        const credentials: string[] = [];
        let rejected = false;
        const clients: typeof scenarioClient =
            (_inventory, session) =>
            async (_contract, capability, _binding, input, assert = () => {}) => {
                if (capability === "configure-connection") {
                    credentials.push(String(input.token));
                    if (fail && !rejected) {
                        rejected = true;
                        return {
                            observation: { ...fixture.measurement, validated: false, status: 503 },
                            output: undefined,
                        };
                    }
                    const output = { configured: true, repositoryUrl: origin, repositoryId: "owned-repository" };
                    await assert(output);
                    return { observation: fixture.measurement, output };
                }
                const owned = rows.get(session.cookie)!;
                const namespace = String(input.namespace);
                let output: NamespaceEvidence;
                if (capability === "namespace-claim") {
                    expect(owned.size).toBeLessThan(32);
                    output = { namespace, revision: 1, state: "active", updatedAt: new Date().toISOString() };
                    owned.set(namespace, output);
                } else {
                    expect(capability).toBe("namespace-suspend");
                    expect(input.namespaceRevision).toBe(owned.get(namespace)!.revision);
                    output = {
                        ...owned.get(namespace)!,
                        revision: Number(input.namespaceRevision) + 1,
                        state: "suspended",
                    };
                    owned.set(namespace, output);
                }
                await assert(output);
                return { observation: fixture.measurement, output };
            };
        const accounts = {
            signup: async (email: string) => {
                rows.set(email, new Map());
                return { cookie: email, accountId: email, administrator: false };
            },
            pat: async () => ({ token: "owned-test-token", id: "owned-pat" }),
        };
        const context = namespaceReadContext(inventory, environment, true, accounts, clients);
        if (fail) {
            await expect(context.initialize("history")).rejects.toThrow("namespace-read-configure-failed");
        } else {
            await context.initialize("history");
            expect(context.expected).toHaveLength(32);
            expect(context.expected.filter((row) => row.state === "suspended")).toHaveLength(31);
            expect(context.expected.at(-1)!.state).toBe("active");
            expect(context.repositoryId).toBe("owned-repository");
        }
        await context.close();
        expect(credentials).toEqual(["owned-test-token", "original-test-token"]);
        expect([...rows.values()].map((value) => value.size).sort((a, b) => a - b)).toEqual([1, 32]);
        await context.close();
        expect(credentials).toHaveLength(2);
    }
});
