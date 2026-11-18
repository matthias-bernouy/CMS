import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition } from "../../../../queries/types";
import { scenarioClient } from "../../../../../harness/clients/session";
import { assertInstalledRows } from "../read/installed";
import { appendKnownOperation } from "./mutate";
import type { KnownOperation } from "./oracle";
import type { OperationReadContext } from "./context";
import type { CapabilityInventory } from "../../../../../capabilities/types";
import type { QueryEnvironment } from "../../../../queries/execute";
import type { PreparedSample } from "../../../../../harness/execution/samples";

export function operationIdentityOracle(old: KnownOperation, result: Readonly<Record<string, unknown>>) {
    const expected = { ...old, result };
    return (output: unknown) =>
        assertCondition(
            canonicalizeIJson(output) === canonicalizeIJson(expected),
            "operation-identity-immutable-old-job",
        );
}

/** Seed an even pair so standalone execution preserves the original grants after each ten-sample case. */
export async function initializeIdentityJournal(
    known: ReadonlyMap<string, KnownOperation>,
    append: () => Promise<string>,
) {
    if (!known.size) {
        await append();
        await append();
    }
}

/** Completed records are immutable: journal growth must not replace an addressed cached job with the latest job. */
export async function prepareOperationIdentity(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    context: OperationReadContext,
    binding: string,
    index: number,
): Promise<PreparedSample> {
    const { state } = context;
    await state.tenant.prepare();
    await initializeIdentityJournal(context.known, () => appendKnownOperation(context));
    const old = [...context.known.values()].at(-1)!;
    const result = context.results.get(old.operationId);
    assertCondition(result, "operation-identity-known-writer-result");
    const oracle = operationIdentityOracle(old, result);
    const input = { operationId: old.operationId };
    const primed = await state.tenant.client("ulvia/cms.installations", "get-operation", binding, input, oracle);
    assertCondition(primed.observation.validated, "operation-identity-old-job-prime");
    const freshId = await appendKnownOperation(context);
    assertCondition(freshId !== old.operationId && context.results.has(freshId), "operation-identity-distinct-new-job");
    return {
        async send() {
            return (await state.tenant.client("ulvia/cms.installations", "get-operation", binding, input, oracle))
                .observation;
        },
        async verify() {
            const foreign = await state.tenant.client(
                "ulvia/cms.installations",
                "get-operation",
                "http",
                input,
                undefined,
                { httpCredentials: { cookie: environment.main.cookie } },
            );
            assertCondition(
                !foreign.observation.validated && [401, 403].includes(foreign.observation.status),
                "operation-identity-foreign-session",
            );
            const elsewhere = await scenarioClient(inventory, environment.main)(
                "ulvia/cms.installations",
                "get-operation",
                "http",
                input,
            );
            assertCondition(
                !elsewhere.observation.validated && elsewhere.observation.status === 404,
                "operation-identity-cross-instance",
            );
            const latest = await state.tenant.client(
                "ulvia/cms.installations",
                "get-operation",
                "http",
                { operationId: freshId },
                (output) =>
                    assertCondition(
                        canonicalizeIJson(output) ===
                            canonicalizeIJson({ ...context.known.get(freshId), result: context.results.get(freshId) }),
                        "operation-identity-new-job-writer-result",
                    ),
            );
            assertCondition(latest.observation.validated, "operation-identity-new-job-visible");
            assertInstalledRows(await state.tenant.fixture("list-collection-installations"), state);
            if (index === 9) {
                const review = await state.tenant.fixture("plan-contract-upgrade", { selections: context.selections });
                assertCondition(
                    canonicalizeIJson(review.grants) === canonicalizeIJson(context.originalGrants),
                    "operation-identity-even-toggles-restored-grants",
                );
            }
        },
    };
}
