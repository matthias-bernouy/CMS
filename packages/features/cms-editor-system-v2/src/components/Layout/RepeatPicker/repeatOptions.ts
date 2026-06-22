import type { DataField, DataScope } from "@bernouy/cms-content/editor";

export type RepeatOption = {
    path: string;
    label: string;
    scopeLabel: string;
    fields: DataField[];
};

export function repeatArrayOptions(scopes: DataScope[]): RepeatOption[] {
    const byPath = new Map<string, RepeatOption>();
    for (const option of scopes.flatMap(scope => repeatArrayFields(scope.fields, scope.name, scope.label ?? scope.name))) {
        if (!byPath.has(option.path)) byPath.set(option.path, option);
    }
    return [...byPath.values()];
}

export function repeatArrayFields(fields: DataField[], scopeName: string, scopeLabel: string, prefix = ""): RepeatOption[] {
    return fields.flatMap(field => {
        const relativePath = prefix && field.path !== "." ? `${prefix}.${field.path}` : field.path === "." ? prefix : field.path;
        const fullPath = relativePath ? `${scopeName}.${relativePath}` : scopeName;
        if (field.type !== "array") return repeatArrayFields(field.children ?? [], scopeName, scopeLabel, relativePath);

        return [{
            path: fullPath,
            label: field.path,
            scopeLabel,
            fields: field.children ?? [],
        }];
    });
}

export function visibleRepeatOptions(options: RepeatOption[], query: string): RepeatOption[] {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;

    return options.filter(option => [
        option.path,
        option.label,
        option.scopeLabel,
    ].some(value => value.toLowerCase().includes(normalizedQuery)));
}

export function defaultRepeatAlias(path: string): string {
    const segment = path.split(".").filter(Boolean).at(-1) ?? "item";
    const singular = segment.endsWith("ies")
        ? `${segment.slice(0, -3)}y`
        : segment.endsWith("s") && segment.length > 1
        ? segment.slice(0, -1)
        : segment;
    return singular.replace(/[^A-Za-z0-9_$]/g, "") || "item";
}
