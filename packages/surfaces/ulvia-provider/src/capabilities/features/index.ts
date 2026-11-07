import { loadImplementations, registerProviderHandlers } from "@bernouy/ulvia-sdk/provider";
import type { ImplementationRelease, ProviderRegistrationOptions } from "@bernouy/ulvia-sdk/provider";
import type { ProviderCapabilityRegistry } from "../../dispatch/registry";
import type { UlviaProviderFeatureServices } from "../../ports/index";
import { officialFeatureImplementations } from "./inventory";
import artifact from "./generated/runtime.json";
import { formatOfficialCapabilityFailure } from "./errors";

let loaded: ReturnType<typeof loadImplementations<UlviaProviderFeatureServices>> | undefined;

/** Shipped metadata is verified once; no source compilation or authored-asset IO occurs here. */
export function loadOfficialFeatures() {
    return (loaded ??= loadImplementations(officialFeatureImplementations, artifact));
}

/** Mount only exact host-approved releases from the same inventory used to build the manifest. */
export async function registerOfficialFeatures(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: UlviaProviderFeatureServices,
    releases: readonly ImplementationRelease[],
    options?: ProviderRegistrationOptions,
): Promise<void> {
    const ids = new Set(officialFeatureImplementations.map(({ feature }) => feature.contractId));
    const implementations = releases
        .filter(({ contractId }) => ids.has(contractId))
        .map(({ contractId, version, digest }) => ({ contractId, version, digest }));
    if (!implementations.length) {
        return;
    }
    if (!options) {
        throw new TypeError("Feature registration requires exact scope and durable execution options");
    }
    const registration = {
        ...options,
        scope: { ...options.scope },
        implementations,
        formatCapabilityFailure: options.formatCapabilityFailure ?? formatOfficialCapabilityFailure,
    };
    registerProviderHandlers(await loadOfficialFeatures(), dispatcher, dependencies, registration);
}
