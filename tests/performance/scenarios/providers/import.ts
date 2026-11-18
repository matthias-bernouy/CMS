import { assertCondition, requireRecord } from "../queries/types";
import { assertApprovalStateUnchanged } from "./oracles";
import type { ProviderContext } from "./context";
import type { PreparedSample } from "../../harness/execution/samples";

/** Re-admission of a real immutable catalogue artifact; it must not approve a connection implicitly. */
export async function prepareManifestImport(context: ProviderContext, binding: string): Promise<PreparedSample> {
    const { peer } = context;
    const capability = "import-provider-manifest";
    const assert = (value: unknown) => {
        const row = requireRecord(value);
        assertCondition(
            row.id === peer.manifest.providerId && row.version === peer.manifest.version && row.digest === peer.digest,
        );
    };
    return {
        async send() {
            return (await context.call(capability, peer.pin, assert, binding)).observation;
        },
        async verify() {
            assert(await context.checked(capability, peer.pin));
            await context.foreign(capability, peer.pin);
            const invalid = await context.call(capability, { ...peer.pin, digest: `sha256:${"0".repeat(64)}` });
            assertCondition(
                !invalid.observation.validated && invalid.observation.status === 422,
                `provider-import-invalid-digest-http-status-${invalid.observation.status}`,
            );
            assertApprovalStateUnchanged(context.original, await context.snapshot());
        },
        close: context.close,
    };
}
