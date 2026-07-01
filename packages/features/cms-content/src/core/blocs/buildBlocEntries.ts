import type { ContentReader } from "cms-content/interfaces/ContentReader";
import type { CacheEntry } from "@bernouy/http-runner";
import { compress } from "@bernouy/http-runner";

export async function generateBlocEntry(tag: string, repository: ContentReader): Promise<CacheEntry> {
    const js = await repository.getBlocViewJS(tag);
    if (!js) throw new Error(`Bloc not found: ${tag}`);
    return compress(js, "text/javascript");
}

export async function generateBlocSetEntry(tags: string[], repository: ContentReader): Promise<CacheEntry> {
    const sorted = [...new Set(tags)].sort();
    if (sorted.length === 0) throw new Error("generateBlocSetEntry: empty tag set");

    const chunks = await Promise.all(sorted.map(async tag => {
        const js = await repository.getBlocViewJS(tag);
        return js ? `;/* ${tag} */\n${js}\n` : null;
    }));
    const sources = chunks.filter((c): c is string => c !== null);

    return compress(sources.join(""), "text/javascript");
}
