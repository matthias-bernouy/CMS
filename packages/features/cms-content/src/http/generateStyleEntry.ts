import type { CacheEntry } from "@bernouy/http-runner";
import { compress } from "@bernouy/http-runner";
import type { ContentReader } from "cms-content/interfaces/ContentReader";

/**
 * Build the theme stylesheet entry served at `/.cms/style`.
 * The source of truth is the raw CSS stored in `TSystem.site.theme`.
 */
export async function generateStyleEntry(reader: ContentReader): Promise<CacheEntry> {
    const settings = await reader.getSystem();
    return compress(settings.site?.theme ?? "", "text/css");
}
