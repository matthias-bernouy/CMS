import { resourceRuntimeNamespace, canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { operationCompletion } from "../../../harness/clients/operation";
import { expectBodyRefusal } from "../../../harness/clients/refusal";
import { collectionTarget } from "../resources";
import { assertCondition, requireRecord } from "../../queries/types";
import { completedCollectionUpgrade, collectionReview } from "./oracles";
import type { CapabilityInventory } from "../../../capabilities/types";
import type { ClientCall } from "../../../harness/clients/types";
import type { settingsTenants } from "../../content/settings/tenant";
import type { publicationCollection } from "../../repository/resources/collection";
import type { QueryEnvironment } from "../../queries/execute";

const CONTRACT = "ulvia/cms.installations";

export const COLLECTION_UPGRADE_SCHEMA_INVALID_ID = "x".repeat(72);
type Resource = Awaited<ReturnType<typeof publicationCollection>>;

export async function collectionUpgradeContext(
    inventory: CapabilityInventory,
    lease: Awaited<ReturnType<ReturnType<typeof settingsTenants>>>,
    environment: QueryEnvironment,
    binding: string,
    source: Resource,
    target: Resource,
) {
    const state = lease.value;
    try {
        await state.prepare(binding);
        assertCondition(
            source.id === target.id &&
                source.version === "1.0.0" &&
                target.version === "1.1.0" &&
                source.digest !== target.digest,
        );
        const read = (capability: string, input: Readonly<Record<string, unknown>> = {}) =>
            state.fixture(capability, input, CONTRACT);
        const installed = await read("list-collection-installations");
        const from = await collectionTarget(state, source);
        const to = await collectionTarget(state, target);
        await read("install-collection", { expectedRevision: installed.revision, targets: [from] });
        const marker = `Preserved ${crypto.randomUUID()}`;
        const current = await read("list-collection-installations");
        await read("configure-collection", {
            collectionId: source.id,
            expectedRevision: current.revision,
            configurationJson: JSON.stringify({ title: marker }),
        });
        const page = await state.fixture("pages.create", {
            path: `/performance-upgrade-${crypto.randomUUID()}`,
            title: marker,
            content: `<div cms-bloc="${resourceRuntimeNamespace(source.id)}--panel"><p slot="body">${marker}</p></div>`,
        });
        await state.fixture("pages.publish", { id: page.id, expectedRevision: page.revision, visible: true });
        const snapshot = async () => ({
            installed: await read("list-collection-installations"),
            detail: await read("get-collection-details", { collectionId: source.id }),
            page: await state.fixture("pages.get", { id: page.id }),
        });
        let before = await snapshot();
        const plan = async () =>
            collectionReview(await read("plan-collection-upgrade", { targets: [to] }), to, before.detail);
        const inputFor = (review: Readonly<Record<string, unknown>>) => ({
            targets: [to],
            planDigest: review.planDigest,
        });
        const apply = async (
            input: Readonly<Record<string, unknown>>,
            transport = "http",
            key = crypto.randomUUID(),
            assert?: (value: unknown) => void,
            capability = "apply-collection-upgrade",
        ) => {
            const complete: NonNullable<ClientCall["complete"]> = operationCompletion(
                state.client,
                CONTRACT,
                "get-operation",
                (operationId) => ({ operationId }),
            );
            return state.client(CONTRACT, capability, transport, input, assert, {
                complete,
                idempotencyKey: key,
            });
        };
        const verify = async (changed: boolean, upgrade?: Readonly<Record<string, unknown>>) => {
            const saved = await snapshot();
            assertCondition(canonicalizeIJson(saved.page) === canonicalizeIJson(before.page));
            assertCondition(saved.detail.version === (changed ? target.version : source.version));
            assertCondition(saved.detail.digest === (changed ? target.digest : source.digest));
            assertCondition(
                canonicalizeIJson(JSON.parse(String(saved.detail.configurationJson))) ===
                    canonicalizeIJson({ title: marker }),
            );
            assertCondition(saved.installed.revision === Number(before.installed.revision) + (changed ? 1 : 0));
            assertCondition(Array.isArray(saved.installed.items) && Array.isArray(before.installed.items));
            const unrelated = (items: unknown[]) =>
                items.map(requireRecord).filter((row) => row.collectionId !== source.id);
            assertCondition(
                canonicalizeIJson(unrelated(saved.installed.items)) ===
                    canonicalizeIJson(unrelated(before.installed.items)),
            );
            if (changed) {
                completedCollectionUpgrade(
                    await read("get-collection-upgrade", { upgradeId: upgrade!.upgradeId }),
                    Number(before.installed.revision) + 1,
                    upgrade!.upgradeId,
                );
            }
            return saved;
        };
        return {
            state,
            environment,
            source,
            target,
            to,
            marker,
            read,
            plan,
            inputFor,
            apply,
            snapshot,
            verify,
            get before() {
                return before;
            },
            async editPage() {
                await state.fixture("pages.update", {
                    id: page.id,
                    expectedRevision: before.page.revision,
                    title: `${marker} edited`,
                });
                before = await snapshot();
            },
            invalid: (
                capability: string,
                valid: Readonly<Record<string, unknown>>,
                invalid: Readonly<Record<string, unknown>>,
            ) => expectBodyRefusal(inventory, state.session, CONTRACT, capability, valid, invalid, 400),
            async close() {
                lease.release();
            },
        };
    } catch (error) {
        lease.release();
        throw error;
    }
}

export type CollectionUpgradeContext = Awaited<ReturnType<typeof collectionUpgradeContext>>;
