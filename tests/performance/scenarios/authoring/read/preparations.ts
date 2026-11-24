import { authoringFixture } from "../fixture";
import { assertCondition, requireRecord } from "../../queries/types";
import type { ScenarioClient } from "../../../harness/clients/session";
import type { ContractParentReference } from "@bernouy/ulvia-contracts";
import type { Variant } from "../../../capabilities/types";
import type { PreparedSample } from "../../../harness/execution/samples";

/** Use the real 64-workspace budget; history churn and invalidation retain explicit owned IDs. */
export async function preparePreparationRead(
    client: ScenarioClient,
    binding: string,
    implementation: ContractParentReference,
    variant: Variant,
): Promise<PreparedSample> {
    const state = await authoringFixture(client, "list-preparations", implementation);
    const retained = new Set([String(state.prepared!.preparationId)]);
    const discard = async (id: string) => {
        await state.fixture("discard-preparation", { preparationId: id });
        retained.delete(id);
    };
    const close = async () => {
        for (const id of [...retained]) {
            await discard(id);
        }
    };
    try {
        const count = variant === "large" ? 63 : variant === "history" ? 64 : 1;
        for (let i = 0; i < count; i++) {
            const prepared = requireRecord(
                await state.fixture("prepare-collection", { sourceJson: state.source.sourceJson }),
            );
            assertCondition(prepared.valid === true && typeof prepared.preparationId === "string");
            retained.add(prepared.preparationId);
            if (variant === "history" && retained.size > 8) {
                await discard(retained.values().next().value!);
            }
        }
        if (variant === "invalidation") {
            const primed = requireRecord(await state.fixture("list-preparations", { limit: 8 }));
            assertCondition(Array.isArray(primed.items) && primed.items.length === retained.size);
            await discard(retained.values().next().value!);
        }
    } catch (error) {
        await close();
        throw error;
    }
    return {
        send: async () =>
            (
                await state.call("list-preparations", binding, { limit: 8 }, (value) => {
                    const page = requireRecord(value);
                    assertCondition(Array.isArray(page.items) && page.items.length === Math.min(8, retained.size));
                    assertCondition(requireRecord(page.quota).count === retained.size);
                    for (const item of page.items) {
                        const record = requireRecord(item);
                        assertCondition(
                            retained.has(String(record.preparationId)) && record.resourceId === state.source.id,
                        );
                    }
                })
            ).observation,
        verify: async () => {
            const found = new Set<string>();
            let cursor: string | null = null;
            do {
                const page = requireRecord(
                    await state.fixture("list-preparations", { limit: 8, ...(cursor ? { cursor } : {}) }),
                );
                assertCondition(Array.isArray(page.items) && page.items.length <= 8);
                for (const item of page.items) {
                    const id = String(requireRecord(item).preparationId);
                    assertCondition(retained.has(id) && !found.has(id));
                    found.add(id);
                }
                assertCondition(page.nextCursor === null || typeof page.nextCursor === "string");
                cursor = page.nextCursor;
            } while (cursor);
            assertCondition(found.size === retained.size);
        },
        close,
    };
}
