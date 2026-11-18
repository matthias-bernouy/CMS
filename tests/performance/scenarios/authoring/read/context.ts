import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { randomUUID } from "node:crypto";
import { repositoryApi } from "../../../../integration/instance/repository/client";
import { scenarioClient } from "../../../harness/clients/session";
import { assertCondition, requireRecord } from "../../queries/types";
import { authoringCalls } from "../client";
import { registryCalls, registrySession } from "../../repository/client";
import { namespaceEvidence, assertAuthoringPage } from "../../repository/namespace-read/oracles";
import type { NamespaceEvidence } from "../../repository/namespace-read/oracles";
import type { CapabilityInventory } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";

async function publisher(environment: QueryEnvironment) {
    const suffix = randomUUID();
    const api = repositoryApi(environment.registry.origin);
    const actor = await api.signup(`performance-source-${suffix}@performance.test`, `Fixture-${randomUUID()}!`);
    return (await api.pat(actor.cookie)).token;
}

/** One publisher owns at most 26 scenario namespaces, below the unchanged 32-name account quota. */
export function authoringReadContexts(inventory: CapabilityInventory, create = publisher, clients = scenarioClient) {
    const publishers = new WeakMap<QueryEnvironment, { token: Promise<string>; namespaces: number }>();
    return (environment: QueryEnvironment) => {
        const main = authoringCalls(clients(inventory, environment.main));
        const registry = registryCalls(
            clients(inventory, registrySession(environment.registry.origin, environment.registry.cookie)),
        );
        const startedAt = Date.now();
        let claimed: NamespaceEvidence | undefined;
        let repositoryId: string | undefined;
        const namespace = `performance-source-${randomUUID().replaceAll("-", "")}`;
        let other: ReturnType<typeof authoringCalls> | undefined;
        let restoreMain = false;
        let restoreOther = false;
        const configure = async (calls: ReturnType<typeof authoringCalls>, token: string) => {
            const status = requireRecord(await calls.fixture("configure-connection", { token }));
            assertCondition(
                status.configured === true &&
                    status.repositoryUrl === environment.registry.origin &&
                    typeof status.repositoryId === "string",
                "source-publisher-configuration",
            );
            return status.repositoryId;
        };
        return {
            main,
            namespace,
            get other() {
                assertCondition(other, "source-other-site-not-initialized");
                return other;
            },
            async initialize() {
                const original = environment.registry.publicationToken;
                assertCondition(
                    typeof original === "string" && original.length > 0 && environment.isolationSite,
                    "source-publisher-fixture-authority",
                );
                other = authoringCalls(clients(inventory, await environment.isolationSite()));
                const before = requireRecord(await other.fixture("get-connection", {}));
                assertCondition(before.configured === false, "source-other-publisher-must-start-disconnected");
                let owner = publishers.get(environment);
                if (!owner) {
                    owner = { token: create(environment), namespaces: 0 };
                    publishers.set(environment, owner);
                }
                assertCondition(owner.namespaces < 26, "source-publisher-namespace-bound");
                owner.namespaces++;
                restoreMain = true;
                repositoryId = await configure(main, await owner.token);
                restoreOther = true;
                await configure(other, original);
                const owned = namespaceEvidence(await main.fixture("claim-namespace", { namespace }));
                claimed = owned;
                assertCondition(
                    owned.namespace === namespace && owned.state === "active",
                    "source-namespace-not-owned",
                );
            },
            async snapshot(): Promise<unknown> {
                assertCondition(claimed && repositoryId, "source-publisher-snapshot-before-initialization");
                const reservation = namespaceEvidence(await registry.fixture("namespace-get", { namespace }));
                assertCondition(
                    canonicalizeIJson(reservation) === canonicalizeIJson(claimed),
                    "source-publisher-reservation-mutated",
                );
                const page = assertAuthoringPage(
                    await main.fixture("list-namespaces", { namespace, limit: 1 }),
                    [claimed],
                    repositoryId,
                    startedAt,
                    undefined,
                    1,
                );
                assertCondition(Array.isArray(page.items), "source-publisher-inventory-items");
                const items = page.items.map((value) => {
                    const { checkedAt: _checkedAt, ...stable } = requireRecord(value);
                    return stable;
                });
                return {
                    connection: await main.fixture("get-connection", {}),
                    namespaces: { ...page, items },
                    reservation,
                };
            },
            async close() {
                const attempts = await Promise.allSettled([
                    ...(restoreMain ? [configure(main, environment.registry.publicationToken!)] : []),
                    ...(restoreOther
                        ? [
                              other!.fixture("disconnect-connection", {}).then((value) => {
                                  assertCondition(
                                      requireRecord(value).configured === false,
                                      "source-other-publisher-restore",
                                  );
                              }),
                          ]
                        : []),
                ]);
                assertCondition(
                    attempts.every((row) => row.status === "fulfilled"),
                    "source-publisher-restore-failed",
                );
                // Immutable owned releases and reservations survive only until this isolated stack is removed.
            },
        };
    };
}

export type AuthoringReadContext = ReturnType<ReturnType<typeof authoringReadContexts>>;
