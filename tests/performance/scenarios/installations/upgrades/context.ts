import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { operationCompletion } from "../../../harness/clients/operation";
import { expectBodyRefusal } from "../../../harness/clients/refusal";
import { assertCondition, requireRecord } from "../../queries/types";
import type { settingsTenants } from "../../content/settings/tenant";
import type { QueryEnvironment } from "../../queries/execute";
import type { ClientCall } from "../../../harness/clients/types";
import type { CapabilityInventory } from "../../../capabilities/types";

export const INSTALLATIONS = "ulvia/cms.installations";
// Grant-toggle fixtures must preserve mandatory Edge/Provider diagnostic consumers.
export const DENIED_READ = { contractId: "ulvia/cms.content", capabilityId: "site.get" };
export const grantKey = (value: unknown) => canonicalizeIJson(value);

export async function upgradeContext(
    inventory: CapabilityInventory,
    lease: Awaited<ReturnType<ReturnType<typeof settingsTenants>>>,
    environment: QueryEnvironment,
    binding: string,
    deniedCapability = DENIED_READ,
) {
    const state = lease.value;
    let original: Readonly<Record<string, unknown>> | undefined;
    let closed = false;
    const read = (capability: string, input: Readonly<Record<string, unknown>> = {}) =>
        state.fixture(capability, input, INSTALLATIONS);
    const apply = async (
        input: Readonly<Record<string, unknown>>,
        transport = "http",
        key = crypto.randomUUID(),
        assert?: (value: unknown) => void,
        capability = "apply-contract-upgrade",
    ) => {
        let operationId: string | undefined;
        const poll = operationCompletion(state.client, INSTALLATIONS, "get-operation", (id) => ({ operationId: id }));
        const complete: NonNullable<ClientCall["complete"]> = (id, signal, record) => {
            operationId = id;
            return poll(id, signal, record);
        };
        const result = await state.client(INSTALLATIONS, capability, transport, input, assert, {
            complete,
            idempotencyKey: key,
        });
        return { ...result, operationId };
    };
    const plan = (selections: unknown, grants?: unknown) =>
        read("plan-contract-upgrade", { selections, ...(grants === undefined ? {} : { grants }) });
    const inputFor = (review: Readonly<Record<string, unknown>>) => ({
        selections: review.selections,
        grants: review.grants,
        planDigest: review.planDigest,
    });
    const close = async () => {
        if (closed) {
            return;
        }
        closed = true;
        try {
            if (original) {
                const current = await read("list-provider-installations");
                const now = await plan(current.selections);
                assertCondition(grantKey(current.selections) === grantKey(original.selections));
                if (grantKey(now.grants) !== grantKey(original.grants)) {
                    const review = await plan(current.selections, original.grants);
                    assertCondition(review.status === "applicable");
                    const restored = await apply(inputFor(review));
                    assertCondition(restored.observation.validated);
                    assertCondition(grantKey((await plan(current.selections)).grants) === grantKey(original.grants));
                }
            }
        } finally {
            lease.release();
        }
    };
    try {
        await state.prepare(binding);
        const installed = await read("list-provider-installations");
        assertCondition(Array.isArray(installed.selections) && installed.selections.length > 0);
        original = await plan(installed.selections);
        assertCondition(original.status === "applicable", "contract-upgrade-original-plan-not-applicable");
        const grants = requireRecord(original.grants);
        assertCondition(Array.isArray(grants.denied));
        const denied = grants.denied.some((value) => grantKey(value) === grantKey(deniedCapability));
        const targetGrants = {
            default: "allow-selected",
            denied: denied
                ? grants.denied.filter((value) => grantKey(value) !== grantKey(deniedCapability))
                : [...grants.denied, deniedCapability],
        };
        const snapshot = async () => {
            const selected = await read("list-provider-installations");
            const pages = await state.fixture("pages.list", { limit: 100 }, "ulvia/cms.content");
            const collections = await read("list-collection-installations");
            return {
                selections: selected.selections,
                selectionRevision: selected.selectionRevision,
                pages,
                collections,
            };
        };
        const invalid = (
            capability: string,
            valid: Readonly<Record<string, unknown>>,
            refused: Readonly<Record<string, unknown>>,
        ) => expectBodyRefusal(inventory, state.session, INSTALLATIONS, capability, valid, refused, 400);
        return {
            state,
            environment,
            read,
            apply,
            plan,
            inputFor,
            original,
            targetGrants,
            denied,
            snapshot,
            invalid,
            close,
        };
    } catch (error) {
        await close();
        throw error;
    }
}

export type UpgradeContext = Awaited<ReturnType<typeof upgradeContext>>;
