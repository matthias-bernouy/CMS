import type { TSystem } from "src/socle/interfaces/models";

/**
 * HTML basics every page needs: `<html lang>` when a language is configured,
 * `<meta charset>`, and the responsive `<meta viewport>`. Distinct from
 * `defineMetaTags` (SEO-adjacent) because these are document-level defaults
 * the browser relies on to parse and lay out the page at all.
 */
export function buildHtmlBasics(
    document: Document,
    head: HTMLElement,
    settings: TSystem,
): void {
    const language = settings.site?.language?.trim() ?? "";
    if (language) document.documentElement.setAttribute("lang", language);

    const charset = document.createElement("meta");
    charset.setAttribute("charset", "UTF-8");
    head.appendChild(charset);

    const viewport = document.createElement("meta");
    viewport.setAttribute("name",    "viewport");
    viewport.setAttribute("content", "width=device-width, initial-scale=1.0");
    head.appendChild(viewport);
}
