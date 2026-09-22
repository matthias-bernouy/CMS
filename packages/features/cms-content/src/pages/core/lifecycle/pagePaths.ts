import type { TSystem } from "cms-content/settings/interfaces/settings";
import type { TPage } from "cms-content/pages/interfaces/pages";
import { ContentValidationError, DuplicatePagePathError } from "cms-content/application/core/validation/errors";
import { publicPagePath } from "cms-content/pages/core/paths/localizedPagePath";

export type PlannedPagePaths = {
    paths: Record<string, string>;
    current: Array<{ path: string; language: string }>;
    primaryPath: string;
};

export function planPagePaths(paths: Record<string, string>, system: TSystem): PlannedPagePaths {
    const defaultLanguage = system.site.language;
    if (!defaultLanguage) {
        throw new ContentValidationError("paths", "configure the default site language first");
    }
    const available = new Map(
        [defaultLanguage, ...(system.site.additionalLanguages ?? [])].map((language) => [
            language.toLowerCase(),
            language,
        ]),
    );
    const normalized: Record<string, string> = {};
    const current: PlannedPagePaths["current"] = [];
    const used = new Set<string>();
    const seenLanguages = new Set<string>();
    for (const [rawLanguage, localPath] of Object.entries(paths)) {
        const language = available.get(rawLanguage.toLowerCase());
        if (!language) {
            throw new ContentValidationError("paths", `language ${rawLanguage} is not configured`);
        }
        if (seenLanguages.has(language)) {
            throw new ContentValidationError("paths", `language ${language} appears more than once`);
        }
        seenLanguages.add(language);
        if (!localPath) {
            continue;
        }
        const path = publicPagePath(language, localPath, defaultLanguage);
        if (used.has(path)) {
            throw new DuplicatePagePathError(path);
        }
        used.add(path);
        normalized[language] = localPath;
        current.push({ path, language });
    }
    const primary = normalized[defaultLanguage];
    if (!primary) {
        throw new ContentValidationError("paths", "the default language needs a path");
    }
    return { paths: normalized, current, primaryPath: publicPagePath(defaultLanguage, primary, defaultLanguage) };
}

/** Preserve configured variants when the default language or language list changes. */
export function pagePathsForSystem(
    page: TPage,
    system: TSystem,
    previousDefaultLanguage?: string,
): Record<string, string> {
    const defaultLanguage = system.site.language;
    if (!page.paths) {
        return defaultLanguage ? { [defaultLanguage]: page.path } : {};
    }
    const configured = new Set([defaultLanguage, ...(system.site.additionalLanguages ?? [])]);
    const paths = Object.fromEntries(Object.entries(page.paths).filter(([language]) => configured.has(language)));
    if (defaultLanguage && !paths[defaultLanguage]) {
        const formerPrimary = Object.entries(page.paths).find(
            ([language, local]) =>
                publicPagePath(language, local, defaultLanguage) === page.path ||
                publicPagePath(language, local, "") === page.path,
        )?.[1];
        paths[defaultLanguage] =
            (previousDefaultLanguage && page.paths[previousDefaultLanguage]) || formerPrimary || page.path;
    }
    return paths;
}

/** Active languages affect visibility, while these settings change stored routes. */
export function languageRoutesChanged(before: TSystem, after: TSystem): boolean {
    if (before.site.language !== after.site.language) {
        return true;
    }
    const previous = new Set(before.site.additionalLanguages ?? []);
    const next = new Set(after.site.additionalLanguages ?? []);
    return previous.size !== next.size || [...previous].some((language) => !next.has(language));
}
