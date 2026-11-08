import type { CollectionRelease } from "../../../interfaces/CollectionRelease";
import { invalid } from "../../errors";
import { collectionLifecycleResources } from "./resources";

export function validateCollectionLifecycles(release: CollectionRelease): void {
    const resources = collectionLifecycleResources(release);
    const byKey = new Map(resources.map((resource) => [`${resource.kind}:${resource.id}`, resource]));
    for (const resource of resources) {
        if (!resource.deprecation) {
            continue;
        }
        const path = `$.${resource.kind}[${resource.id}].deprecation`;
        if (!Object.hasOwn(release.translations[release.locale]!, resource.deprecation.reason)) {
            invalid("reason must reference a default-locale translation", path);
        }
        const seen = new Set<string>();
        let current: typeof resource | undefined = resource;
        while (current?.deprecation?.replacedBy !== undefined) {
            const key = `${current.kind}:${current.id}`;
            if (seen.has(key)) {
                invalid("cyclic resource replacement", path);
            }
            seen.add(key);
            const replacement = `${current.kind}:${current.deprecation.replacedBy}`;
            current = byKey.get(replacement);
            if (!current) {
                invalid("replacement must name an existing resource of the same kind", path);
            }
        }
    }
}
