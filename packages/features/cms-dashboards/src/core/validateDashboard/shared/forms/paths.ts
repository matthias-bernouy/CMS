import type { DashboardField, DashboardFormOperation } from "../../../../interfaces/Dashboard";

export function formNameSegments(value: unknown): string[] | null {
    if (typeof value !== "string" || !/^[A-Za-z_$][\w$]*(?:\[(?:[A-Za-z_$][\w$]*|0|[1-9]\d*)\])*$/.test(value)) {
        return null;
    }
    const parts = value.replaceAll("]", "").split("[");
    return parts.some((part) => ["__proto__", "constructor", "prototype"].includes(part)) ? null : parts;
}

export function validateFormNames(
    operation: DashboardFormOperation,
    fields: DashboardField[],
    path: string,
    errors: string[],
): void {
    const names: Array<{ name: unknown; path: string }> = (operation.hiddenFields ?? []).map((field, index) => ({
        name: field?.name,
        path: `${path}.hiddenFields.${index}.name`,
    }));
    const prefix = formNameSegments(operation.valuesPath ?? "values") ?? [];
    for (const field of fields) {
        if (field.type === "media" && field.staging) {
            names.push({ name: field.staging.sessionField, path: `${path}.fields.${field.id}.staging.sessionField` });
        }
        if (field.type === "readonly" || (field.type === "table" && field.editable !== true)) {
            continue;
        }
        const parts = field.name ? formNameSegments(field.name) : field.path?.split(".");
        const nested = [...(operation.valuesPath ? prefix : []), ...(parts ?? [])];
        names.push({
            name:
                nested[0] +
                nested
                    .slice(1)
                    .map((part) => `[${part}]`)
                    .join(""),
            path: `${path}.fields.${field.id}.name`,
        });
    }
    const seen: string[][] = [];
    for (const entry of names) {
        const segments = formNameSegments(entry.name);
        if (!segments) {
            errors.push(`${entry.path} must be a safe form name`);
            continue;
        }
        if (
            seen.some((other) =>
                other
                    .slice(0, Math.min(other.length, segments.length))
                    .every((part, index) => segments[index] === part),
            )
        ) {
            errors.push(`${entry.path} conflicts with another form control`);
        }
        seen.push(segments);
    }
}
