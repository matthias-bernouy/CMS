import { randomUUID } from "node:crypto";
import { publicationFixture } from "../fixture";
import { registryCalls, registryClient } from "../../client";
import { assertCondition } from "../../../queries/types";
import {
    assertPublicationBytes,
    assertPublicationSource,
    assertPublicationState,
    assertUploadProgress,
} from "./oracles";
import type { CapabilityInventory } from "../../../../capabilities/types";
import type { QueryEnvironment } from "../../../queries/execute";
import type { PreparedSample } from "../../../../harness/execution/samples";

export const PUBLICATION_READERS = [
    "publication-status",
    "publication-state",
    "release-download",
    "asset-download",
    "artifact-source-get",
    "source-read",
] as const;

export async function preparePublicationRead(
    inventory: CapabilityInventory,
    environment: QueryEnvironment,
    capability: string,
    binding: string,
    create = publicationFixture,
): Promise<PreparedSample> {
    const upload = capability === "publication-status";
    const source = capability === "artifact-source-get" || capability === "source-read";
    const state = await create(
        inventory,
        environment,
        upload ? "publication-status" : source ? capability : "publication-yank",
    );
    const reason = `Performance invalidation ${randomUUID()}`;
    const input = upload
        ? state.uploadScope
        : source
          ? state.source
          : capability === "asset-download"
            ? { ...state.coordinate, assetId: state.resource.asset.id }
            : state.coordinate;
    const assert = (output: unknown, changed = true) => {
        if (upload) {
            assertUploadProgress(
                output,
                state.upload!.uploadId,
                state.upload!.expiresAt,
                changed ? [state.resource.asset.id] : [],
            );
        } else if (capability === "publication-state") {
            assertPublicationState(output, changed ? 1 : 0, changed ? reason : null);
        } else if (source) {
            assertPublicationSource(output, state.resource.sourceJson, state.resource.digest);
        } else {
            assertPublicationBytes(
                output,
                capability === "asset-download"
                    ? state.resource.bytes
                    : new TextEncoder().encode(state.resource.canonicalJson),
            );
        }
    };
    const read = async (assertion: (output: unknown) => void = assert, selectedBinding = binding) =>
        state.call(capability, selectedBinding, input, assertion);
    const close = async () => {
        if (upload) {
            await state.checked("publication-abort", state.uploadScope);
        }
        // Owned immutable releases, sources and namespace reservations survive only until stack removal.
    };
    try {
        const primed = await read((output) => assert(output, false), "http");
        assertCondition(primed.observation.validated, "publication-read-prime-failed");
        if (upload) {
            await state.checked("publication-asset", {
                ...state.uploadScope,
                assetId: state.resource.asset.id,
                bytes: state.resource.bytes,
                contentDigest: state.resource.asset.digest,
            });
        } else {
            const changed = await state.fixture("publication-yank", {
                ...state.coordinate,
                namespaceRevision: state.scope.namespaceRevision,
                expectedRevision: 0,
                reason,
            });
            assertPublicationState(changed, 1, reason);
        }
        return {
            send: async () => (await read()).observation,
            async verify() {
                const foreign = registryCalls(registryClient(inventory, environment));
                if (upload || source) {
                    const refused = await foreign.call(capability, "http", input);
                    assertCondition(
                        !refused.observation.validated && refused.observation.status === 409,
                        "publication-read-foreign-source",
                    );
                }
                if (!upload) {
                    const refusalInput = {
                        ...state.coordinate,
                        namespaceRevision: state.scope.namespaceRevision,
                        expectedRevision: 1,
                        reason: null,
                    };
                    const refused = await foreign.call("publication-yank", "http", refusalInput);
                    assertCondition(
                        !refused.observation.validated && refused.observation.status === 409,
                        "publication-read-foreign-yank",
                    );
                    const stale = await state.call("publication-yank", "http", {
                        ...refusalInput,
                        expectedRevision: 0,
                    });
                    assertCondition(
                        !stale.observation.validated && stale.observation.status === 409,
                        "publication-read-stale-yank",
                    );
                    assertPublicationState(await state.fixture("publication-state", state.coordinate), 1, reason);
                }
                assertCondition(
                    (await read(assert, "http")).observation.validated,
                    "publication-read-refusal-mutated-state",
                );
            },
            close,
        };
    } catch (error) {
        await close();
        throw error;
    }
}
