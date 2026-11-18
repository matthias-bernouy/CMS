import { assertCondition, requireRecord } from "../../queries/types";
import { collectionPublicationFixture } from "./collection-fixture";
import { registryCalls, registryClient } from "../client";
import type { CapabilityInventory } from "../../../capabilities/types";
import type { PreparedSample } from "../../../harness/execution/samples";
import type { QueryEnvironment } from "../../queries/execute";

export async function prepareCollectionPublication(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    capability: string,
    binding: string,
): Promise<PreparedSample> {
    const state = await collectionPublicationFixture(inventory, environment, capability);
    return {
        async send() {
            const result = await state.call(
                capability,
                binding,
                state.input,
                (output) => {
                    if (capability === "source-put") {
                        assertCondition(output === null);
                        return;
                    }
                    const out = requireRecord(output);
                    if (capability === "publication-check-collection") {
                        assertCondition(out.complete === true && out.digest === state.resource.digest);
                    } else if (capability === "publication-build") {
                        assertCondition(
                            out.kind === "collection" && out.added === true && out.digest === state.resource.digest,
                        );
                    } else if (capability === "publication-build-status") {
                        const completed = requireRecord(out.result);
                        assertCondition(out.status === "succeeded" && out.operationId === state.operationId);
                        assertCondition(
                            completed.kind === "collection" &&
                                completed.added === true &&
                                completed.digest === state.resource.digest,
                        );
                    } else {
                        assertCondition(
                            out.sourceJson === state.resource.sourceJson && out.releaseDigest === state.resource.digest,
                        );
                    }
                },
                capability === "publication-build" ? { complete: state.complete } : {},
            );
            return result.observation;
        },
        async verify() {
            // A different ordinary publisher must not read or mutate this owner's
            // sources, upload or operation. Refusal is outside timed execution.
            const foreign = registryCalls(registryClient(inventory, environment));
            const refused = await foreign.call(capability, "http", state.input);
            assertCondition(!refused.observation.validated && refused.observation.status === 409);
            const bytes = await state.checked("release-download", state.coordinate);
            assertCondition(
                bytes instanceof Uint8Array && Buffer.from(bytes).equals(Buffer.from(state.resource.canonicalJson)),
            );
            for (const asset of state.resource.assets) {
                const downloaded = await state.checked("asset-download", { ...state.coordinate, assetId: asset.id });
                assertCondition(
                    downloaded instanceof Uint8Array && Buffer.from(downloaded).equals(Buffer.from(asset.bytes)),
                );
            }
            if (capability !== "publication-check-collection") {
                const retained = await state.fixture("source-get", state.source);
                assertCondition(
                    retained.sourceJson === state.resource.sourceJson &&
                        retained.releaseDigest === state.resource.digest,
                );
            }
        },
        async close() {
            // Commit is idempotently retained; abort only removes an unfinished test upload.
            await state.checked("publication-abort", state.uploadScope);
        },
    };
}
