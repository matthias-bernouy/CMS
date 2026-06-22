import type { DataField, DataScope } from "@bernouy/cms-content/editor";

export type DataOption = {
    label: string;
    path: string;
};

export function flattenDataOptions(scopes: DataScope[]): DataOption[] {
    const byPath = new Map<string, DataOption>();
    for (const scope of scopes) {
        const options = fieldOptions(scope.fields, scope.name, scope.label ?? scope.name);
        for (const option of options) {
            if (!byPath.has(option.path)) byPath.set(option.path, option);
        }
    }
    return [...byPath.values()];
}

function fieldOptions(fields: DataField[], scopeName: string, scopeLabel: string, prefix = ""): DataOption[] {
    return fields.flatMap(field => {
        const relativePath = prefix && field.path !== "." ? `${prefix}.${field.path}` : field.path === "." ? prefix : field.path;
        const path = relativePath ? `${scopeName}.${relativePath}` : scopeName;
        if (field.type === "array") return [];

        const children = fieldOptions(field.children ?? [], scopeName, scopeLabel, relativePath);
        if (field.type === "object" || field.children?.length) return children;

        const label = field.label ? `${scopeLabel} / ${field.label}` : `${scopeLabel} / ${relativePath}`;
        return [{ label, path }, ...children];
    });
}
