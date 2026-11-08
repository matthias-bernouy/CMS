import { replaceResourceAssetExpressions, resourceAssetUrl } from "@bernouy/resources/delivery";
import type { ResourceAssetSource } from "@bernouy/resources/delivery";
import type { ResourceAssetReference } from "@bernouy/resources/storage";
import { resolveInstalledCollectionAssetSources } from "@bernouy/repository/collections/assets";
import type { InstalledCollectionAssetSource } from "@bernouy/repository/collections/assets";

/** Temporary composition while the previously published collection API awaits explicit retirement. */
export function publicAssetSources(resources: ResourceAssetSource, legacy: InstalledCollectionAssetSource) {
    return async (inputs: readonly string[]): Promise<ReadonlyMap<string, string>> => {
        if (inputs.length > 512 || inputs.reduce((size, value) => size + value.length, 0) > 1024 * 1024) {
            throw new RangeError("Public asset sources exceed their budget");
        }
        const captured = [...new Set(inputs)];
        const key = (ref: ResourceAssetReference) => JSON.stringify([ref.namespace, ref.id]);
        const refs = new Map<string, ResourceAssetReference>();
        for (const input of captured) {
            replaceResourceAssetExpressions(input, (ref) => {
                refs.set(key(ref), ref);
                if (refs.size > 512) {
                    throw new RangeError("Too many public asset references");
                }
                return undefined;
            });
        }
        const metadata = refs.size ? await resources.getMetadata([...refs.values()]) : [];
        const urls = new Map(metadata.map((asset) => [key(asset), resourceAssetUrl(asset)]));
        const replaced = captured.map((input) => replaceResourceAssetExpressions(input, (ref) => urls.get(key(ref))));
        const resolved = await resolveInstalledCollectionAssetSources(replaced, legacy, "");
        return new Map(captured.map((input, index) => [input, resolved.get(replaced[index]!)!]));
    };
}
