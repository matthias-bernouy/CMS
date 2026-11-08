import { loadCompatibleImplementation } from "@bernouy/ulvia-sdk/provider";
import retained from "./generated/retained.json";
import { compileImplementations } from "@bernouy/ulvia-sdk/build";
import type { UlviaProviderFeatureServices } from "../../ports/index";
import { officialFeatureImplementations, officialFeatureTemplates } from "./inventory";

let compilation: ReturnType<typeof compileImplementations<UlviaProviderFeatureServices>> | undefined;

/** Build-only compilation emits release claims and the serializable runtime artifact. */
export function compileOfficialFeatures() {
    return (compilation ??= compileImplementations(officialFeatureImplementations, officialFeatureTemplates));
}

/** Historical metadata is retained only after checking every old capability against captured code. */
export async function compileRetainedFeatures() {
    const current = await compileOfficialFeatures();
    const builds = [];
    for (const metadata of retained) {
        const release = JSON.parse(metadata.canonicalJson);
        const source = current.implementations.find((pin) => pin.contractId === release.contractId);
        if (!source) {
            throw new Error(`Retained implementation has no executor: ${release.contractId}`);
        }
        builds.push(await loadCompatibleImplementation(current, source, metadata));
    }
    return builds;
}
