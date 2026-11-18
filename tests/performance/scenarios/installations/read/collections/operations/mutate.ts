import { operationCompletion } from "../../../../../harness/clients/operation";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";

import { contractReview, completedUpgrade } from "../../../upgrades/oracles";
import { assertCondition, requireRecord } from "../../../../queries/types";
import { observeKnownOperation } from "./oracle";
import type { OperationReadContext } from "./context";

const DENIED_READ = { contractId: "ulvia/cms.content", capabilityId: "site.get" };

/** Journal growth changes an existing grant only; it does not publish more collections or alter selected pins. */
export async function appendKnownOperation(context: OperationReadContext) {
    context.assertWritable();
    const { state } = context;
    try {
        const current = await state.tenant.fixture("plan-contract-upgrade", { selections: context.selections });
        const grants = requireRecord(current.grants);
        assertCondition(Array.isArray(grants.denied), "operation-read-grants");
        const had = grants.denied.some((row) => canonicalizeIJson(row) === canonicalizeIJson(DENIED_READ));
        const target = {
            default: grants.default,
            denied: had
                ? grants.denied.filter((row) => canonicalizeIJson(row) !== canonicalizeIJson(DENIED_READ))
                : [...grants.denied, DENIED_READ],
        };
        const review = contractReview(
            await state.tenant.fixture("plan-contract-upgrade", { selections: context.selections, grants: target }),
            context.selections,
            target,
        );
        let operationId: string | undefined;
        const poll = operationCompletion(state.tenant.client, "ulvia/cms.installations", "get-operation", (id) => ({
            operationId: id,
        }));
        const applied = await state.tenant.client(
            "ulvia/cms.installations",
            "apply-contract-upgrade",
            "http",
            { selections: review.selections, grants: review.grants, planDigest: review.planDigest },
            (output) => {
                completedUpgrade(output, Number(review.expectedRevision) + 1);
            },
            {
                idempotencyKey: crypto.randomUUID(),
                complete: (id, signal, record) => {
                    operationId = id;
                    return poll(id, signal, record);
                },
            },
        );
        assertCondition(applied.observation.validated && operationId, "operation-read-append-completed");
        const result = completedUpgrade(applied.output, Number(review.expectedRevision) + 1);
        const known = await observeKnownOperation(state, operationId, "apply-contract-upgrade", result);
        const providers = await state.tenant.fixture("list-provider-installations");
        assertCondition(
            canonicalizeIJson(providers.selections) === canonicalizeIJson(context.selections) &&
                providers.selectionRevision === result.selectionRevision,
            "operation-read-preserved-selection",
        );
        context.remember(known, result);
        return known.operationId;
    } catch (error) {
        context.failWrite();
        throw error;
    }
}
