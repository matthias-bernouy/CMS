import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { PreparedResource } from "./resource";

/** Local modules execute trusted workspace code. Remote Repository authoring remains data-only. */
export async function prepareReleaseModule(directory: string): Promise<readonly PreparedResource[]> {
    const path = join(directory, "ulvia.release.ts");
    const entry = await lstat(path);
    if (!entry.isFile() || entry.isSymbolicLink() || entry.size > 1024 * 1024) {
        throw new Error("ulvia.release.ts must be a regular local source file of at most 1 MiB");
    }
    const source: unknown = (await import(pathToFileURL(path).href)).default;
    if (typeof source !== "function") {
        throw new TypeError("ulvia.release.ts must default-export a release preparation function");
    }
    const resources: unknown = await source();
    if (
        !Array.isArray(resources) ||
        !resources.length ||
        resources.length > 256 ||
        resources.some(
            (resource) => !resource || !["contract", "provider-manifest", "collection"].includes(resource.kind),
        )
    ) {
        throw new TypeError("Release module must prepare between 1 and 256 admitted resources");
    }
    return resources as readonly PreparedResource[];
}
