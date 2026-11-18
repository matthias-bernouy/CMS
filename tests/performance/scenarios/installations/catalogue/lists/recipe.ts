import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition } from "../../../queries/types";
import { availableProviderOracle, installedProviderOracle } from "./oracle";
import type { MetadataContext } from "../state/context";
import type { PreparedSample } from "../../../../harness/execution/samples";

export async function prepareMetadataList(
    state: MetadataContext,
    capability: string,
    profile: string,
): Promise<PreparedSample> {
    await state.tenant.prepare();
    const available = capability === "list-available-providers";
    const assert = () => (available ? availableProviderOracle(state) : installedProviderOracle(state));
    if (profile === "invalidation") {
        const primed = await state.tenant.client("ulvia/cms.installations", capability, "http", {}, assert());
        assertCondition(primed.observation.validated, "metadata-list-old-state-prime");
        if (available) {
            await state.mutateCatalogue();
        } else {
            await state.mutateStatus();
        }
    }
    const before = canonicalizeIJson(state.connections.selections);
    return {
        async send() {
            return (await state.tenant.client("ulvia/cms.installations", capability, "http", {}, assert())).observation;
        },
        async verify() {
            const foreign = await state.tenant.client("ulvia/cms.installations", capability, "http", {}, undefined, {
                httpCredentials: { cookie: state.environment.main.cookie },
            });
            assertCondition(
                !foreign.observation.validated && [401, 403].includes(foreign.observation.status),
                "metadata-list-foreign-session",
            );
            assertCondition(
                canonicalizeIJson(state.connections.selections) === before,
                "metadata-list-refusal-preserves-selection",
            );
            const current = await state.tenant.client("ulvia/cms.installations", capability, "http", {}, assert());
            assertCondition(current.observation.validated, "metadata-list-persisted-owned-state");
        },
    };
}
