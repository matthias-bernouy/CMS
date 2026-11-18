import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition } from "../../../../queries/types";
import { observeKnownOperation } from "./oracle";
import type { KnownOperation } from "./oracle";
import type { CollectionReadState } from "../context/types";
import type { collectionReadContexts } from "../context";
import type { QueryEnvironment } from "../../../../queries/execute";

export type OperationReadContext = Readonly<{
    state: CollectionReadState;
    known: Map<string, KnownOperation>;
    results: Map<string, Readonly<Record<string, unknown>>>;
    originalGrants: unknown;
    selections: unknown;
    failWrite(): void;
    assertWritable(): void;
    remember(operation: KnownOperation, result: Readonly<Record<string, unknown>>): void;
}>;

export function operationReadContexts(contexts: ReturnType<typeof collectionReadContexts>) {
    const values = new WeakMap<CollectionReadState, Promise<OperationReadContext>>();
    return async (environment: QueryEnvironment, profile: string) => {
        const state = await contexts(environment, profile);
        let pending = values.get(state);
        if (!pending) {
            pending = (async () => {
                const known = new Map<string, KnownOperation>();
                const results = new Map<string, Readonly<Record<string, unknown>>>();
                assertCondition(state.upgrades.length <= 64, "operation-read-initial-count-bound");
                const deadline = Date.now() + 60_000;
                for (const row of state.upgrades) {
                    assertCondition(Date.now() < deadline, "operation-read-initialization-deadline");
                    const operation = await observeKnownOperation(state, row.operationId, "apply-collection-upgrade", {
                        upgradeId: row.upgradeId,
                        status: "completed",
                        collectionRevision: row.revision,
                    });
                    assertCondition(!known.has(operation.operationId), "operation-read-duplicate-initial-identity");
                    known.set(operation.operationId, operation);
                    results.set(operation.operationId, {
                        upgradeId: row.upgradeId,
                        status: "completed",
                        collectionRevision: row.revision,
                    });
                }
                assertCondition(profile === "invalidation" || known.size >= 32, "operation-read-volume-precondition");
                const providers = await state.tenant.fixture("list-provider-installations");
                const original = await state.tenant.fixture("plan-contract-upgrade", {
                    selections: providers.selections,
                });
                assertCondition(
                    original.status === "applicable" &&
                        canonicalizeIJson(original.selections) === canonicalizeIJson(providers.selections),
                    "operation-read-original-selection",
                );
                let failed = false;
                return {
                    state,
                    known,
                    results,
                    originalGrants: original.grants,
                    selections: providers.selections,
                    failWrite: () => {
                        failed = true;
                    },
                    assertWritable: () =>
                        assertCondition(!failed && known.size < 96, "operation-read-unknown-write-or-count-bound"),
                    remember(operation: KnownOperation, result: Readonly<Record<string, unknown>>) {
                        assertCondition(
                            !known.has(operation.operationId) && known.size < 96,
                            "operation-read-owned-identity-bound",
                        );
                        known.set(operation.operationId, operation);
                        results.set(operation.operationId, result);
                    },
                };
            })();
            values.set(state, pending);
        }
        return pending;
    };
}
