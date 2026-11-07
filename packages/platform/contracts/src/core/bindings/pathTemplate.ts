import { ReleaseValidationError } from "../protocol/errors";

const EMBEDDED_PLACEHOLDER_PATTERN =
    /^(?<prefix>[a-z0-9._~-]*)\{(?<name>[A-Za-z][A-Za-z0-9_]*)\}(?<suffix>[a-z0-9._~-]*)$/;
const LITERAL_SEGMENT_PATTERN = /^[a-z0-9][a-z0-9._~-]*$/;

export interface ParsedPathTemplate {
    readonly placeholders: readonly string[];
    readonly segments: readonly string[];
}

export function parsePathTemplate(path: string, errorPath: string): ParsedPathTemplate {
    if (!path.startsWith("/") || path.includes("?") || path.includes("#")) {
        throw new ReleaseValidationError(
            "invalid_binding",
            "must be an origin-relative path without query or fragment",
            errorPath,
        );
    }
    if (path !== "/" && path.endsWith("/")) {
        throw new ReleaseValidationError("invalid_binding", "must not have a trailing slash", errorPath);
    }
    const segments = path === "/" ? [] : path.slice(1).split("/");
    const placeholders: string[] = [];
    for (const segment of segments) {
        const placeholder = segment.match(EMBEDDED_PLACEHOLDER_PATTERN)?.groups?.name;
        if (placeholder) {
            placeholders.push(placeholder);
            continue;
        }
        if (!LITERAL_SEGMENT_PATTERN.test(segment)) {
            throw new ReleaseValidationError(
                "invalid_binding",
                `invalid path segment ${JSON.stringify(segment)}`,
                errorPath,
            );
        }
    }
    if (new Set(placeholders).size !== placeholders.length) {
        throw new ReleaseValidationError("invalid_binding", "must not repeat a path placeholder", errorPath);
    }
    return { placeholders, segments };
}

export function pathTemplatesOverlap(left: string, right: string): boolean {
    const leftSegments = left === "/" ? [] : left.slice(1).split("/");
    const rightSegments = right === "/" ? [] : right.slice(1).split("/");
    if (leftSegments.length !== rightSegments.length) {
        return false;
    }
    return leftSegments.every((segment, index) => {
        const other = rightSegments[index]!;
        return (
            EMBEDDED_PLACEHOLDER_PATTERN.test(segment) || EMBEDDED_PLACEHOLDER_PATTERN.test(other) || segment === other
        );
    });
}

export function routeKey(method: string, path: string): string {
    const shape = path.replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g, "{}");
    return `${method} ${shape}`;
}

/** Matches an origin-relative request path and returns raw, still percent-encoded placeholders. */
export function matchPathTemplate(template: string, pathname: string): Readonly<Record<string, string>> | null {
    if (!pathname.startsWith("/") || pathname.includes("?") || pathname.includes("#")) {
        return null;
    }
    const expected = template === "/" ? [] : template.slice(1).split("/");
    const actual = pathname === "/" ? [] : pathname.slice(1).split("/");
    if (expected.length !== actual.length) {
        return null;
    }
    const values: Record<string, string> = {};
    for (let index = 0; index < expected.length; index += 1) {
        const segment = expected[index]!;
        const value = actual[index]!;
        const templateMatch = segment.match(EMBEDDED_PLACEHOLDER_PATTERN);
        const placeholder = templateMatch?.groups?.name;
        if (placeholder && templateMatch?.groups) {
            const prefix = templateMatch.groups.prefix ?? "";
            const suffix = templateMatch.groups.suffix ?? "";
            if (!value.startsWith(prefix) || !value.endsWith(suffix)) {
                return null;
            }
            const captured = value.slice(prefix.length, value.length - suffix.length || undefined);
            if (!captured || captured.includes("/")) {
                return null;
            }
            values[placeholder] = captured;
        } else if (segment !== value) {
            return null;
        }
    }
    return values;
}
