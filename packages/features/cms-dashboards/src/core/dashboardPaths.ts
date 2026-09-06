import type { DashboardField, DashboardReorderableListItemField } from "../interfaces/Dashboard";

const PATH_SEGMENT = /^[A-Za-z_$][\w$]*$/;
const EXPRESSION = /^\$([A-Za-z]+)(?:\.(.+))?$/;
const UNSAFE_PATH_SEGMENTS = new Set(["__proto__", "constructor", "prototype"]);

export function dashboardPathSegments(value: string): string[] | null {
    const segments = value.split(".");
    if (
        !segments.length ||
        segments.some((segment) => !PATH_SEGMENT.test(segment) || UNSAFE_PATH_SEGMENTS.has(segment))
    ) {
        return null;
    }
    return segments;
}

export function isSafeDashboardPath(value: string): boolean {
    return dashboardPathSegments(value) !== null;
}

export function isSafeDashboardExpression(value: string, roots: readonly string[], pathRequired = false): boolean {
    const match = EXPRESSION.exec(value);
    if (!match || !roots.includes(match[1]!)) {
        return false;
    }
    const path = match[2];
    return path === undefined ? !pathRequired : isSafeDashboardPath(path);
}

/** Return only declared reference fields, using numeric segments for list rows. */
export function dashboardReferenceFieldPaths(
    fields: readonly DashboardField[],
    values: Record<string, unknown>,
    type: "secret-ref" | "page-link",
): Array<{
    path: string;
    field: Extract<DashboardField | DashboardReorderableListItemField, { type: "secret-ref" | "page-link" }>;
}> {
    const paths: Array<{
        path: string;
        field: Extract<DashboardField | DashboardReorderableListItemField, { type: "secret-ref" | "page-link" }>;
    }> = [];
    for (const field of fields) {
        if (!isSafeDashboardPath(field.path)) {
            continue;
        }
        if (field.type === type) {
            paths.push({ path: field.path, field });
        }
        if (field.type !== "reorderable-list") {
            continue;
        }
        const rows = ownValueAt(values, field.path);
        if (!Array.isArray(rows)) {
            continue;
        }
        for (const [index, row] of rows.entries()) {
            if (!row || typeof row !== "object" || Array.isArray(row)) {
                continue;
            }
            for (const nested of field.fields) {
                if (nested.type === type && isSafeDashboardPath(nested.path)) {
                    paths.push({ path: `${field.path}.${index}.${nested.path}`, field: nested });
                }
            }
        }
    }
    return paths;
}

function ownValueAt(value: unknown, path: string): unknown {
    for (const segment of path.split(".")) {
        if (!value || typeof value !== "object" || !Object.hasOwn(value, segment)) {
            return undefined;
        }
        value = (value as Record<string, unknown>)[segment];
    }
    return value;
}

export function dashboardSecretRefPaths(fields: readonly DashboardField[], values: Record<string, unknown>): string[] {
    return dashboardReferenceFieldPaths(fields, values, "secret-ref").map(({ path }) => path);
}
