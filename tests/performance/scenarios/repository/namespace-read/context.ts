import { randomUUID } from "node:crypto";
import { repositoryApi } from "../../../../integration/instance/repository/client";
import { scenarioClient } from "../../../harness/clients/session";
import { registryCalls, registrySession } from "../client";
import { assertCondition, requireRecord } from "../../queries/types";
import { namespaceEvidence } from "./oracles";
import type { NamespaceEvidence } from "./oracles";
import type { CapabilityInventory, Variant } from "../../../capabilities/types";
import type { QueryEnvironment } from "../../queries/execute";

type Accounts = Pick<ReturnType<typeof repositoryApi>, "signup" | "pat">;
export function namespaceReadContext(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    authoring: boolean,
    accounts: Accounts = repositoryApi(environment.registry.origin),
    clients = scenarioClient,
) {
    const main = clients(inventory, environment.main);
    const suffix = randomUUID().replaceAll("-", "");
    const prefix = `perf-nsr-${suffix}`;
    const expected: NamespaceEvidence[] = [];
    let owner: ReturnType<typeof registryCalls>;
    let foreign: ReturnType<typeof registryCalls>;
    let foreignNamespace: NamespaceEvidence;
    let repositoryId: string;
    let restore = false;
    let closed = false;
    const startedAt = Date.now();
    const configure = async (token: string) => {
        const result = await main("ulvia/cms.authoring", "configure-connection", "http", { token });
        assertCondition(result.observation.validated, "namespace-read-configure-failed");
        const row = requireRecord(result.output);
        assertCondition(
            row.configured === true &&
                row.repositoryUrl === environment.registry.origin &&
                typeof row.repositoryId === "string",
        );
        return row.repositoryId;
    };
    const create = async (label: string) => {
        const actor = await accounts.signup(`${prefix}-${label}@performance.test`, `Fixture-${randomUUID()}!`);
        return {
            actor,
            calls: registryCalls(clients(inventory, registrySession(environment.registry.origin, actor.cookie))),
        };
    };
    const suspend = async (index: number) => {
        const before = expected[index]!;
        const row = namespaceEvidence(
            await owner.fixture("namespace-suspend", {
                namespace: before.namespace,
                namespaceRevision: before.revision,
            }),
        );
        assertCondition(
            row.namespace === before.namespace && row.state === "suspended" && row.revision === before.revision + 1,
        );
        expected[index] = row;
    };
    return {
        main,
        expected,
        startedAt,
        get owner() {
            return owner;
        },
        get foreign() {
            return foreign;
        },
        get foreignNamespace() {
            return foreignNamespace;
        },
        get repositoryId() {
            return repositoryId;
        },
        suspend,
        async initialize(variant: Variant) {
            assertCondition(!closed && !expected.length);
            const owned = await create("owner");
            owner = owned.calls;
            const other = await create("foreign");
            foreign = other.calls;
            foreignNamespace = namespaceEvidence(
                await foreign.fixture("namespace-claim", { namespace: `${prefix}-foreign` }),
            );
            const count = variant === "invalidation" ? 1 : 32;
            for (let index = 0; index < count; index++) {
                expected.push(
                    namespaceEvidence(
                        await owner.fixture("namespace-claim", {
                            namespace: `${prefix}-${String(index).padStart(2, "0")}`,
                        }),
                    ),
                );
                if (variant === "history" && index < count - 1) {
                    await suspend(index);
                }
            }
            if (authoring) {
                const original = environment.registry.publicationToken;
                assertCondition(typeof original === "string" && original.length > 0);
                const pat = await accounts.pat(owned.actor.cookie);
                restore = true;
                repositoryId = await configure(pat.token);
            }
        },
        async close() {
            if (closed) {
                return;
            }
            closed = true;
            if (restore) {
                await configure(environment.registry.publicationToken!);
            }
            // Owned namespace reservations and their accounts survive only until this isolated stack is removed.
        },
    };
}
export type NamespaceReadContext = ReturnType<typeof namespaceReadContext>;
