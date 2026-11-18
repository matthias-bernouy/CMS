import { parseCollectionReleaseJson } from "@bernouy/repository/collections";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import type { CollectionRelease } from "@bernouy/repository/collections";
import { randomUUID } from "node:crypto";
import { collectionPublicationFixture } from "../collection-fixture";
import { registryCalls, registryClient } from "../../client";
import { assertCondition } from "../../../queries/types";
import {
    assertPublicationSource,
    assertCollectionPreflight,
    assertPublicationState,
    assertPublicationBytes,
} from "./oracles";
import type { CapabilityInventory } from "../../../../capabilities/types";
import type { QueryEnvironment } from "../../../queries/execute";
import type { PreparedSample } from "../../../../harness/execution/samples";

export async function prepareCollectionRead(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    capability: string,
    binding: string,
): Promise<PreparedSample> {
    const preflight = capability === "publication-check-collection";
    const state = await collectionPublicationFixture(
        inventory,
        environment,
        preflight ? "publication-build" : "source-get",
    );
    const selected = preflight
        ? {
              namespace: state.source.namespace,
              namespaceRevision: state.source.namespaceRevision,
              canonicalJson: state.resource.canonicalJson,
          }
        : state.source;
    const reason = `Performance collection invalidation ${randomUUID()}`;
    let committed = !preflight;
    const assert = (output: unknown) =>
        preflight
            ? assertCollectionPreflight(output, state.resource.digest)
            : assertPublicationSource(output, state.resource.sourceJson, state.resource.digest);
    const read = () => state.call(capability, binding, selected, assert);
    try {
        assertCondition((await read()).observation.validated, "publication-collection-read-prime");
        if (preflight) {
            const result = await state.fixture("publication-commit", state.uploadScope);
            assertCondition(result.digest === state.resource.digest && result.added === true);
            committed = true;
        } else {
            assertPublicationState(
                await state.fixture("publication-yank", {
                    ...state.coordinate,
                    namespaceRevision: state.source.namespaceRevision,
                    expectedRevision: 0,
                    reason,
                }),
                1,
                reason,
            );
        }
        return {
            send: async () => (await read()).observation,
            async verify() {
                const foreign = registryCalls(registryClient(inventory, environment));
                const refused = await foreign.call(capability, "http", selected);
                assertCondition(
                    !refused.observation.validated && refused.observation.status === 409,
                    "publication-collection-read-foreign",
                );
                assertPublicationBytes(
                    await state.checked("release-download", state.coordinate),
                    new TextEncoder().encode(state.resource.canonicalJson),
                );
                if (preflight) {
                    const conflict = conflictingCollection(state.resource.release);
                    const rejected = await state.call(capability, "http", { ...selected, canonicalJson: conflict });
                    assertCondition(
                        !rejected.observation.validated && rejected.observation.status === 409,
                        "publication-preflight-cached-immutable-conflict",
                    );
                }
                if (!preflight) {
                    assertPublicationState(await state.fixture("publication-state", state.coordinate), 1, reason);
                }
                assertCondition((await read()).observation.validated, "publication-collection-read-state-changed");
            },
            async close() {
                if (!committed) {
                    await state.checked("publication-abort", state.uploadScope);
                }
            },
        };
    } catch (error) {
        if (!committed) {
            await state.checked("publication-abort", state.uploadScope);
        }
        throw error;
    }
}

export function conflictingCollection(release: CollectionRelease) {
    const candidate = canonicalizeIJson({
        ...release,
        configuration: {
            schema: { type: "object", properties: { performanceFlag: { type: "boolean" } }, required: [] },
            defaults: {},
        },
    });
    parseCollectionReleaseJson(candidate);
    return candidate;
}
