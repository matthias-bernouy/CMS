import type { TPage } from "cms-content/pages/interfaces/pages";

/** Resolve canonical SEO language keys from the selected BCP-47 tag. */
export function pageSeoForLanguage(page: TPage, language: string): NonNullable<TPage["seo"]>[string] | undefined {
    if (!page.seo) {
        return undefined;
    }
    try {
        const canonical = Intl.getCanonicalLocales(language)[0];
        return canonical ? page.seo[canonical] : undefined;
    } catch {
        return undefined;
    }
}
