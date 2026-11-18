import { assertCondition, requireRecord } from "../../queries/types";
import { publicationFixture } from "./fixture";
import type { CapabilityInventory } from "../../../capabilities/types";
import type { PreparedSample } from "../../../harness/execution/samples";
import type { QueryEnvironment } from "../../queries/execute";
import { ClientFailure } from "../../../harness/clients/failure";

function sameBytes(actual: unknown, expected: Uint8Array) {
    assertCondition(actual instanceof Uint8Array && Buffer.from(actual).equals(Buffer.from(expected)));
}

export async function preparePublication(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    capability: string,
    binding: string,
): Promise<PreparedSample> {
    const state = await publicationFixture(inventory, environment, capability);
    let uploadId = state.upload?.uploadId;
    let terminal = state.committed;
    return {
        async send() {
            const result = await state.call(capability, binding, state.input, (output) => {
                if (["publication-asset", "publication-abort", "artifact-source-put"].includes(capability)) {
                    assertCondition(output === null);
                } else if (capability === "release-download") {
                    sameBytes(output, new TextEncoder().encode(state.resource.canonicalJson));
                } else if (capability === "asset-download") {
                    sameBytes(output, state.resource.bytes);
                } else {
                    const out = requireRecord(output);
                    if (capability === "publication-begin" || capability === "publication-status") {
                        assertCondition(typeof out.uploadId === "string" && Array.isArray(out.uploadedAssetIds));
                        assertCondition(out.uploadedAssetIds.length === 0);
                        if (capability === "publication-begin") {
                            uploadId = out.uploadId;
                        } else {
                            assertCondition(out.uploadId === uploadId);
                        }
                    } else if (capability === "publication-commit") {
                        assertCondition(
                            out.digest === state.resource.digest && out.kind === "contract" && out.added === true,
                        );
                    } else if (capability === "publication-yank") {
                        assertCondition(
                            out.revision === 1 && requireRecord(out.yank).reason === "Performance fixture yank",
                        );
                    } else {
                        assertCondition(
                            out.sourceJson === state.resource.sourceJson && out.releaseDigest === state.resource.digest,
                        );
                    }
                }
            });
            if (result.observation.validated && ["publication-commit", "publication-abort"].includes(capability)) {
                terminal = true;
            }
            return result.observation;
        },
        async verify() {
            const scope = { ...state.scope, uploadId };
            if (capability === "publication-abort") {
                const absent = await state.call("publication-status", "http", scope);
                if (absent.observation.validated || ![404, 409].includes(absent.observation.status)) {
                    throw new ClientFailure(`post-abort-upload-status-${absent.observation.status}`);
                }
                const unpublished = await state.call("release-download", "http", state.coordinate);
                assertCondition(unpublished.observation.status === 404);
            } else if (["publication-begin", "publication-status", "publication-asset"].includes(capability)) {
                const status = await state.fixture("publication-status", scope);
                assertCondition(status.uploadId === uploadId && Array.isArray(status.uploadedAssetIds));
                assertCondition(
                    capability === "publication-asset"
                        ? status.uploadedAssetIds.includes(state.resource.asset.id)
                        : status.uploadedAssetIds.length === 0,
                );
            } else if (
                capability === "artifact-source-put" ||
                capability === "artifact-source-get" ||
                capability === "source-read"
            ) {
                const retained = await state.fixture("artifact-source-get", state.source);
                assertCondition(
                    retained.sourceJson === state.resource.sourceJson &&
                        retained.releaseDigest === state.resource.digest,
                );
            } else {
                const release = await state.checked("release-download", state.coordinate);
                sameBytes(release, new TextEncoder().encode(state.resource.canonicalJson));
                if (capability === "publication-yank") {
                    const current = await state.fixture("publication-state", state.coordinate);
                    assertCondition(
                        current.revision === 1 && requireRecord(current.yank).reason === "Performance fixture yank",
                    );
                }
            }
        },
        async close() {
            if (uploadId && !terminal) {
                await state.checked("publication-abort", { ...state.scope, uploadId });
            }
            // Publisher accounts and immutable test releases remain bounded by
            // sample count and are removed with their isolated fixture stack.
        },
    };
}
