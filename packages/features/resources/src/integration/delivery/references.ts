import { parseCollectionAssetExpression } from "@bernouy/content/page-document";
import type { ResourceAssets } from "resources/storage/assets";
import type { ResourceAssetMetadata, ResourceAssetReference } from "resources/storage/records";

export const RESOURCE_ASSETS_ROUTE = "/_content/resources";
export type ResourceAssetSource = Pick<ResourceAssets, "getMetadata" | "representation">;
const key = (namespace: string, id: string) => JSON.stringify([namespace, id]);

/** Retains the existing static Content expression grammar, independent of its original distribution. */
export function replaceResourceAssetExpressions(
    input: string,
    resolve: (reference: ResourceAssetReference) => string | undefined,
): string {
    return input.replace(/\{\{([\s\S]*?)\}\}/gu, (original, expression: string) => {
        const value = expression.trim();
        if (!value.startsWith("cms.asset.")) {
            return original;
        }
        const reference = parseCollectionAssetExpression(value);
        if (!reference) {
            throw new TypeError("Invalid static resource asset expression");
        }
        return resolve({ namespace: reference.collectionId, id: reference.assetId }) ?? original;
    });
}
export function resourceAssetUrl(asset: ResourceAssetMetadata): string {
    return `${RESOURCE_ASSETS_ROUTE}/${encodeURIComponent(asset.namespace)}/${encodeURIComponent(asset.id)}?v=${asset.digest.slice(7)}`;
}

/** One scoped metadata query for up to 512 distinct references; no bytes or ZIPs are loaded. */
export async function resolveResourceAssetSources(
    inputs: readonly string[],
    source: Pick<ResourceAssetSource, "getMetadata">,
): Promise<ReadonlyMap<string, string>> {
    if (inputs.length > 512) {
        throw new RangeError("Too many resource asset inputs");
    }
    const captured = [...new Set(inputs)];
    if (captured.reduce((size, value) => size + value.length, 0) > 1024 * 1024) {
        throw new RangeError("Resource asset expressions exceed their character budget");
    }
    const refs = new Map<string, ResourceAssetReference>();
    for (const input of captured) {
        replaceResourceAssetExpressions(input, (reference) => {
            refs.set(key(reference.namespace, reference.id), reference);
            if (refs.size > 512) {
                throw new RangeError("Too many resource asset references");
            }
            return "";
        });
    }
    if (!refs.size) {
        return new Map(captured.map((input) => [input, input]));
    }
    const rows = await source.getMetadata([...refs.values()]);
    const urls = new Map(rows.map((asset) => [key(asset.namespace, asset.id), resourceAssetUrl(asset)]));
    return new Map(
        captured.map((input) => [
            input,
            replaceResourceAssetExpressions(input, (ref) => {
                const url = urls.get(key(ref.namespace, ref.id));
                if (!url) {
                    throw new Error(`Unknown resource asset: ${ref.namespace}.${ref.id}`);
                }
                return url;
            }),
        ]),
    );
}
export async function resolveResourceAssets(
    input: string,
    source: Pick<ResourceAssetSource, "getMetadata">,
): Promise<string> {
    return (await resolveResourceAssetSources([input], source)).get(input)!;
}
