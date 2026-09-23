import { ReleaseValidationError } from "../protocol/errors";

const PLACEHOLDER_PATTERN = /^\{([A-Za-z][A-Za-z0-9_]*)\}$/;
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
        const placeholder = segment.match(PLACEHOLDER_PATTERN)?.[1];
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
        return PLACEHOLDER_PATTERN.test(segment) || PLACEHOLDER_PATTERN.test(other) || segment === other;
    });
}

export function routeKey(method: string, path: string): string {
    const shape = path.replace(/\{[A-Za-z][A-Za-z0-9_]*\}/g, "{}");
    return `${method} ${shape}`;
}
