import type { CacheEntry } from "@bernouy/http-runner";
import { compress } from "@bernouy/http-runner";
import type { ContentReader } from "cms-content/interfaces/ContentReader";
import { generateThemeCss } from "cms-content/core/theme";

/**
 * Build the theme stylesheet entry served at `/.cms/style`.
 * Free-form CSS is emitted first. Structured active-theme tokens follow and
 * are authoritative for custom properties managed by the theme editor.
 */
export async function generateStyleEntry(reader: ContentReader): Promise<CacheEntry> {
    const settings = await reader.getSystem();
    const css = [settings.site?.theme ?? "", generateThemeCss(settings.theme)].filter(Boolean).join("\n\n");
    return compress(css, "text/css");
}
