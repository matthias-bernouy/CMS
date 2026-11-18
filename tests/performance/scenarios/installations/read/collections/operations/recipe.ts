import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { scenarioClient } from "../../../../../harness/clients/session";
import { expectBodyRefusal } from "../../../../../harness/clients/refusal";
import { assertCondition, requireRecord } from "../../../../queries/types";
import { assertInstalledRows } from "../read/installed";
import { operationPageOracle } from "./oracle";
import { appendKnownOperation } from "./mutate";
import type { OperationReadContext } from "./context";
import type { CapabilityInventory } from "../../../../../capabilities/types";
import type { QueryEnvironment } from "../../../../queries/execute";
import type { PreparedSample } from "../../../../../harness/execution/samples";

type OperationPageContext = Pick<OperationReadContext, "known"> &
    Readonly<{ state: Readonly<{ tenant: Pick<OperationReadContext["state"]["tenant"], "client"> }> }>;

export async function verifyOperationPages(context: OperationPageContext) {
    const seen = new Set<string>();
    const cursors = new Set<string>();
    let cursor: string | undefined;
    for (let page = 0; page < 8; page++) {
        const result = await context.state.tenant.client(
            "ulvia/cms.installations",
            "list-operations",
            "http",
            { limit: 16, ...(cursor ? { cursor } : {}) },
            operationPageOracle(context.known, 16),
        );
        assertCondition(result.observation.validated, "operation-read-complete-pagination");
        const row = requireRecord(result.output);
        for (const raw of row.items as readonly unknown[]) {
            const operation = requireRecord(raw);
            const id = String(operation.operationId);
            assertCondition(!seen.has(id), "operation-read-cross-page-duplicate");
            seen.add(id);
        }
        cursor = typeof row.nextCursor === "string" ? row.nextCursor : undefined;
        if (!cursor) {
            assertCondition(seen.size === context.known.size, "operation-read-premature-exhaustion");
            return;
        }
        assertCondition(!cursors.has(cursor), "operation-read-repeated-cursor");
        cursors.add(cursor);
    }
    assertCondition(false, "operation-read-page-count-bound");
}

export async function prepareOperationRead(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    context: OperationReadContext,
    binding: string,
    profile: string,
    index: number,
): Promise<PreparedSample> {
    const { state, known } = context;
    await state.tenant.prepare();
    const invalidating = profile === "invalidation";
    const limit = invalidating ? 100 : 16;
    let request: Readonly<Record<string, unknown>> = { limit };
    if (invalidating) {
        assertCondition(known.size < 96, "operation-read-invalidation-page-bound");
        const prime = await state.tenant.client(
            "ulvia/cms.installations",
            "list-operations",
            binding,
            request,
            operationPageOracle(known, limit, true),
        );
        assertCondition(prime.observation.validated, "operation-read-prime");
        await appendKnownOperation(context);
    } else if (index % 2) {
        const first = await state.tenant.client(
            "ulvia/cms.installations",
            "list-operations",
            "http",
            request,
            operationPageOracle(known, limit, false, true),
        );
        assertCondition(
            first.observation.validated && typeof requireRecord(first.output).nextCursor === "string",
            "operation-read-nonempty-navigation",
        );
        request = { limit, cursor: requireRecord(first.output).nextCursor };
    }
    return {
        async send() {
            return (
                await state.tenant.client(
                    "ulvia/cms.installations",
                    "list-operations",
                    binding,
                    request,
                    operationPageOracle(known, limit, invalidating, true),
                )
            ).observation;
        },
        async verify() {
            const foreign = await state.tenant.client(
                "ulvia/cms.installations",
                "list-operations",
                "http",
                request,
                undefined,
                { httpCredentials: { cookie: environment.main.cookie } },
            );
            assertCondition(
                !foreign.observation.validated && [401, 403].includes(foreign.observation.status),
                "operation-read-foreign-session",
            );
            await expectBodyRefusal(
                inventory,
                state.tenant.session,
                "ulvia/cms.installations",
                "list-operations",
                request,
                { ...request, unexpectedPerformanceField: true },
                400,
            );
            const id = known.keys().next().value;
            assertCondition(id, "operation-read-nominal-identity");
            const elsewhere = await scenarioClient(inventory, environment.main)(
                "ulvia/cms.installations",
                "get-operation",
                "http",
                { operationId: id },
            );
            assertCondition(
                !elsewhere.observation.validated && elsewhere.observation.status === 404,
                `operation-read-cross-instance-http-${elsewhere.observation.status}`,
            );
            assertInstalledRows(await state.tenant.fixture("list-collection-installations"), state);
            if (index === 0 || index === 9 || invalidating) {
                await verifyOperationPages(context);
            }
            if (invalidating && index === 9) {
                const current = await state.tenant.fixture("plan-contract-upgrade", { selections: context.selections });
                assertCondition(
                    canonicalizeIJson(current.grants) === canonicalizeIJson(context.originalGrants),
                    "operation-read-grants-restored-after-even-toggles",
                );
            }
        },
    };
}
