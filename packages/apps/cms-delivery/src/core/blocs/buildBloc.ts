import type { DeliveryRepository } from "cms-delivery/interfaces/DeliveryRepository";
import type { CacheEntry } from "@bernouy/cms-shared";
import { compress } from "@bernouy/cms-shared";

/**
 * Build the view bundle entry for a bloc. The repository returns the raw
 * JS string (already compiled by the import pipeline); we compress it into
 * a CacheEntry so every consumer — the endpoint, `resolveAssets`, the
 * build pipeline — hits the same cached bytes.
 *
 * Throws on unknown tag so the caller can surface a 404/5xx; the endpoint
 * swallows that into `Response.error()` and `renderPage`'s `Promise.all`
 * propagates it to the page's renderer fallback.
 */
export async function generateBlocEntry(tag: string, repository: DeliveryRepository): Promise<CacheEntry> {
    const js = await repository.getBlocViewJS(tag);
    if (!js) throw new Error(`Bloc not found: ${tag}`);
    return compress(js, "text/javascript");
}

/**
 * Build ONE bundle entry from several blocs' viewJS — the unit of the
 * signature-grouped delivery path. The tags are deduped + sorted so the
 * produced bytes (and therefore the content hash / cache key / `?v` URL) are
 * identical for any page that references the same set. That stability is what
 * lets the bundle be immutable-cached and shared across pages and visitors.
 *
 * Each bloc's viewJS is already a self-registering IIFE (the shared `Component`
 * base is externalised to `window.p9r.Component`, shipped once via
 * component.js), so the blocs are simply concatenated — no re-bundling. Each
 * chunk is prefixed with `;` so a bloc whose IIFE has no trailing semicolon
 * can't ASI-merge with the next chunk's leading `(` — a hazard that doesn't
 * exist when each bloc is its own <script>, but appears once they share a file.
 *
 * Throws on any unknown tag (same contract as `generateBlocEntry`); the
 * endpoint swallows that into `Response.error()`.
 */
export async function generateBlocSetEntry(tags: string[], repository: DeliveryRepository): Promise<CacheEntry> {
    const sorted = [...new Set(tags)].sort();
    if (sorted.length === 0) throw new Error("generateBlocSetEntry: empty tag set");

    const sources = await Promise.all(sorted.map(async tag => {
        const js = await repository.getBlocViewJS(tag);
        if (!js) throw new Error(`Bloc not found: ${tag}`);
        return `;/* ${tag} */\n${js}\n`;
    }));

    return compress(sources.join(""), "text/javascript");
}
