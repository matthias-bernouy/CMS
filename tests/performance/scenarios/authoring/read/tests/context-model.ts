import { expect } from "bun:test";
import { inventoryFixture } from "../../../../fixtures/inventory";
import { authoringReadContexts } from "../context";
import type { QueryEnvironment } from "../../../queries/execute";
import type { scenarioClient, ScenarioClient } from "../../../../harness/clients/session";

export async function publisherModel() {
    const fixture = await inventoryFixture();
    const main = {
        origin: "http://main.localhost:5101",
        cookie: "main-admin",
        token: "unit-mcp",
        tools: [],
        subjectId: "unit-admin",
    };
    const other = { ...main, origin: "http://other.localhost:5101", cookie: "other-admin" };
    const registry = { ...main, origin: "http://registry.localhost:5101", publicationToken: "unit-original" };
    const environment: QueryEnvironment = {
        main,
        registry,
        isolationSite: async () => other,
        stack: {
            id: "unit",
            providerName: "unit",
            edgeName: "unit",
            instanceId: "unit",
            restartProvider: async () => {},
        },
    };
    const configured = new Map<string, unknown>([[main.origin, registry.publicationToken]]);
    const writes: string[] = [];
    const reservations = new Map<string, Readonly<Record<string, unknown>>>();
    const checks: string[] = [];
    let staleCheck = false;
    let creates = 0;
    let failRestore = false;
    const clients: typeof scenarioClient = (_inventory, session) => {
        const call: ScenarioClient = async (contract, capability, binding, input, assert) => {
            expect(["ulvia/cms.authoring", "ulvia/repository"]).toContain(contract);
            expect(binding).toBe("http");
            if (capability === "configure-connection") {
                writes.push(`${session.origin}:configure`);
                if (failRestore && session.origin === main.origin && input.token === registry.publicationToken) {
                    return {
                        output: undefined,
                        observation: { ...fixture.measurement, validated: false, status: 503 },
                    };
                }
                configured.set(session.origin, input.token);
            } else if (capability === "disconnect-connection") {
                writes.push(`${session.origin}:disconnect`);
                configured.delete(session.origin);
            }
            if (capability === "claim-namespace") {
                reservations.set(String(input.namespace), {
                    namespace: input.namespace,
                    state: "active",
                    revision: 1,
                    updatedAt: new Date().toISOString(),
                });
            }
            let output: unknown;
            if (capability === "namespace-get" || capability === "claim-namespace") {
                output = reservations.get(String(input.namespace));
            } else if (capability === "list-namespaces") {
                const owned = reservations.get(String(input.namespace))!;
                const checkedAt = staleCheck ? "2000-01-01T00:00:00.000Z" : new Date().toISOString();
                checks.push(checkedAt);
                output = {
                    items: [
                        {
                            namespace: input.namespace,
                            access: owned.state === "active" ? "owned" : "suspended",
                            revision: owned.revision,
                            repositoryId: "unit-repository",
                            checkedAt,
                        },
                    ],
                    nextCursor: null,
                };
            } else {
                output = {
                    configured: configured.has(session.origin),
                    repositoryUrl: registry.origin,
                    repositoryId: configured.has(session.origin) ? "unit-repository" : null,
                };
            }
            const copy = structuredClone(output);
            await assert?.(copy);
            return { output: copy, observation: fixture.measurement };
        };
        return call;
    };
    const create = async () => {
        creates++;
        return "unit-owner";
    };
    const contexts = authoringReadContexts(fixture.inventory, create, clients);
    return {
        contexts,
        environment,
        configured,
        main,
        other,
        registry,
        writes,
        reservations,
        checks,
        staleCheck() {
            staleCheck = true;
        },
        creates: () => creates,
        failRestore() {
            failRestore = true;
        },
    };
}
