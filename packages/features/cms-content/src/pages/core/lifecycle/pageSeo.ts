import type { TPage } from "cms-content/pages/interfaces/pages";

/** SEO keys are canonical tags, while older site settings may keep their original casing. */
export function pageSeoForLanguage(page: TPage, language: string): NonNullable<TPage["seo"]>[string] | undefined {
    if (!page.seo) {
        return undefined;
    }
    let canonical = language;
    try {
        canonical = Intl.getCanonicalLocales(language)[0] ?? language;
    } catch {
        // Preserve reads of older records with a noncanonical language key.
    }
    return page.seo[canonical] ?? page.seo[language];
}
