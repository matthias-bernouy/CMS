import { randomUUID } from "node:crypto";
import { repositoryApi } from "../../../integration/instance/repository/client";
import { scenarioClient } from "../../harness/clients/session";
import { assertCondition } from "../queries/types";
import { registryCalls, registryClient, registrySession } from "./client";
import type { CapabilityInventory } from "../../capabilities/types";
import type { PreparedSample } from "../../harness/execution/samples";
import type { QueryEnvironment } from "../queries/execute";

export const NAMESPACE_MUTATIONS = ["namespace-claim", "namespace-suspend", "namespace-transfer"] as const;

export async function prepareNamespace(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    capability: string,
    binding: string,
): Promise<PreparedSample> {
    const publicCalls = registryCalls(registryClient(inventory, environment));
    const name = `performance-${randomUUID().replaceAll("-", "")}`;
    const owner = await repositoryApi(environment.registry.origin).signup(
        `${name}-owner@performance.test`,
        `Fixture-${randomUUID()}!`,
    );
    // Namespace quotas belong to each account. An unrelated family's samples
    // must not consume this fixture's quota before measurement begins.
    const client = scenarioClient(inventory, registrySession(environment.registry.origin, owner.cookie));
    const calls = registryCalls(client);
    const claimed =
        capability === "namespace-claim" ? null : await calls.fixture("namespace-claim", { namespace: name });
    const receiver =
        capability === "namespace-transfer"
            ? await repositoryApi(environment.registry.origin).signup(
                  `${name}@performance.test`,
                  `Fixture-${randomUUID()}!`,
              )
            : null;
    const receiving = receiver
        ? registryCalls(scenarioClient(inventory, registrySession(environment.registry.origin, receiver.cookie)))
        : null;
    const owns = async (account: ReturnType<typeof registryCalls>) => {
        const result = await account.fixture("namespace-list", {});
        assertCondition(Array.isArray(result.namespaces));
        return result.namespaces.some((item) => item.namespace === name);
    };
    const input = {
        namespace: name,
        ...(claimed ? { namespaceRevision: claimed.revision } : {}),
        ...(receiver ? { targetAccountId: receiver.accountId } : {}),
    };
    return {
        async send() {
            return (
                await calls.call(capability, binding, input, (output) => {
                    assertCondition(output && typeof output === "object" && "namespace" in output);
                    assertCondition(output.namespace === name && "revision" in output);
                    assertCondition(output.revision === (claimed ? Number(claimed.revision) + 1 : 1));
                    assertCondition(
                        "state" in output &&
                            output.state === (capability === "namespace-suspend" ? "suspended" : "active"),
                    );
                })
            ).observation;
        },
        async verify() {
            const current = await publicCalls.fixture("namespace-get", { namespace: name });
            assertCondition(current.state === (capability === "namespace-suspend" ? "suspended" : "active"));
            if (receiving) {
                assertCondition(await owns(receiving));
                assertCondition(!(await owns(calls)));
                const refused = await calls.call("namespace-suspend", "http", {
                    namespace: name,
                    namespaceRevision: current.revision,
                });
                assertCondition(!refused.observation.validated && refused.observation.status === 409);
                const unchanged = await calls.fixture("namespace-get", { namespace: name });
                assertCondition(unchanged.revision === current.revision && unchanged.state === current.state);
            } else {
                assertCondition(await owns(calls));
            }
        },
        async close() {
            if (receiver && receiving) {
                if (await owns(receiving)) {
                    const current = await receiving.fixture("namespace-get", { namespace: name });
                    await receiving.fixture("namespace-transfer", {
                        namespace: name,
                        namespaceRevision: current.revision,
                        targetAccountId: owner.accountId,
                    });
                }
            }
            // Owned reservations prevent account deletion. Retain these bounded
            // test actors until the owning isolated stack is removed.
        },
    };
}
