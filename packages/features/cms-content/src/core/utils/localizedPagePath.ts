import { ContentValidationError } from "cms-content/core/validation/errors";
import { isValidPathFormat } from "cms-content/core/validation/predicates";

export function languagePrefix(language: string): string {
    return `/${language.toLowerCase()}`;
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
