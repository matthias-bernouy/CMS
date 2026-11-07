import { registerProviderHandlers } from "@bernouy/ulvia-sdk/provider";
import type { ImplementationRelease, ProviderRegistrationOptions } from "@bernouy/ulvia-sdk/provider";
import type { ProviderCapabilityRegistry } from "../../dispatch/registry";
import type { UlviaProviderFeatureServices } from "../../ports/index";
import { compileOfficialFeatures, officialFeatureImplementations } from "./build";
import { formatOfficialCapabilityFailure } from "./errors";

/** Mount only exact host-approved releases from the same inventory used to build the manifest. */
export async function registerOfficialFeatures(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: UlviaProviderFeatureServices,
    releases: readonly ImplementationRelease[],
    options?: ProviderRegistrationOptions,
): Promise<void> {
    const ids = new Set(officialFeatureImplementations.map(({ feature }) => feature.contractId));
    const implementations = releases.filter(({ contractId }) => ids.has(contractId));
    if (!implementations.length) {
        return;
    }
    if (!options) {
        throw new TypeError("Feature registration requires exact scope and durable execution options");
    }
    registerProviderHandlers(await compileOfficialFeatures(), dispatcher, dependencies, {
        ...options,
        implementations,
        formatCapabilityFailure: options.formatCapabilityFailure ?? formatOfficialCapabilityFailure,
    });
}
