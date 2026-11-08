import {
    loadImplementations,
    loadCompatibleImplementation,
    selectImplementationBuilds,
    registerProviderHandlers,
} from "@bernouy/ulvia-sdk/provider";
import type { ImplementationRelease, ProviderRegistrationOptions } from "@bernouy/ulvia-sdk/provider";
import type { ProviderCapabilityRegistry } from "../../dispatch/registry";
import type { UlviaProviderFeatureServices } from "../../ports/index";
import { officialFeatureImplementations } from "./inventory";
import artifact from "./generated/runtime.json";
import retained from "./generated/retained.json";
import { formatOfficialCapabilityFailure } from "./errors";

let loaded: ReturnType<typeof loadImplementations<UlviaProviderFeatureServices>> | undefined;

/** Shipped metadata is verified once; no source compilation or authored-asset IO occurs here. */
export function loadOfficialFeatures() {
    return (loaded ??= loadImplementations(officialFeatureImplementations, artifact));
}

// Only the fixed, shipped retention list may populate this bounded metadata cache.
const compatible = new Map<string, ReturnType<typeof loadCompatibleImplementation<UlviaProviderFeatureServices>>>();

/** Mount only exact host-approved releases from the same inventory used to build the manifest. */
export async function registerOfficialFeatures(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: UlviaProviderFeatureServices,
    releases: readonly ImplementationRelease[],
    options?: ProviderRegistrationOptions,
): Promise<void> {
    const implementations = releases.map(({ contractId, version, digest }) => ({ contractId, version, digest }));
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
    const current = await loadOfficialFeatures();
    const builds = [current];
    for (const release of implementations) {
        if (
            current.implementations.some(
                (pin) =>
                    pin.contractId === release.contractId &&
                    pin.version === release.version &&
                    pin.digest === release.digest,
            )
        ) {
            continue;
        }
        const metadata = retained.find(({ digest }) => digest === release.digest);
        const source = current.implementations.find((pin) => pin.contractId === release.contractId);
        if (!metadata || !source) {
            throw new TypeError(`Unsupported exact implementation: ${release.contractId}@${release.version}`);
        }
        let pending = compatible.get(metadata.digest);
        if (!pending) {
            pending = loadCompatibleImplementation(current, source, metadata);
            compatible.set(metadata.digest, pending);
            const loading = pending;
            void loading.catch(() => {
                if (compatible.get(metadata.digest) === loading) {
                    compatible.delete(metadata.digest);
                }
            });
        }
        builds.push(await pending);
    }
    registerProviderHandlers(
        selectImplementationBuilds(builds, implementations),
        dispatcher,
        dependencies,
        registration,
    );
}
