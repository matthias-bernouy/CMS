import { ContentValidationError } from "cms-content/core/validation/errors";
import { isValidPathFormat } from "cms-content/core/validation/predicates";

export function languagePrefix(language: string): string {
    return `/${language.toLowerCase()}`;
}

/** Extensionless Delivery routes must not be claimed by authored pages. */
export const PUBLIC_SITEMAP_CHUNKS_ROUTE = "/sitemaps";

export function isReservedPublicPagePath(path: string, languages: readonly string[] = []): boolean {
    if (path === PUBLIC_SITEMAP_CHUNKS_ROUTE || path.startsWith(`${PUBLIC_SITEMAP_CHUNKS_ROUTE}/`)) {
        return true;
    }
    return languages.some((language) => {
        const prefix = `${languagePrefix(language)}${PUBLIC_SITEMAP_CHUNKS_ROUTE}`;
        return path === prefix || path.startsWith(`${prefix}/`);
    });
}

export function assertPagePathNotReserved(path: string, languages: readonly string[] = []): void {
    if (isReservedPublicPagePath(path, languages)) {
        throw new ContentValidationError("path", "reserved for CMS sitemaps");
    }
}

export function publicPagePath(language: string, localPath: string, defaultLanguage: string): string {
    const local = validLocalPath(localPath);
    if (!language || language.toLowerCase() === defaultLanguage.toLowerCase()) {
        return local;
    }
    return `${languagePrefix(language)}${local === "/" ? "" : local}`;
}

export function localPagePath(language: string, publicPath: string): string | null {
    const path = validLocalPath(publicPath);
    if (!language) {
        return path;
    }
    const prefix = languagePrefix(language);
    if (path === prefix) {
        return "/";
    }
    return path.startsWith(`${prefix}/`) ? path.slice(prefix.length) : null;
}

function validLocalPath(path: string): string {
    if (!isValidPathFormat(path)) {
        throw new ContentValidationError("path", "must start with '/' and contain only [a-zA-Z0-9-/]");
    }
    return path;
}
