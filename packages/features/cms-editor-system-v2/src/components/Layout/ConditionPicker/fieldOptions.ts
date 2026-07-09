import type { DataField, DataScope } from "@bernouy/cms-content/editor";
import type { ConditionFieldOption } from "./types";

export function conditionFieldOptions(scopes: DataScope[]): ConditionFieldOption[] {
    const byPath = new Map<string, ConditionFieldOption>();
    for (const scope of scopes) {
        for (const option of fieldOptions(scope.fields, scope.name, scope.label ?? scope.name)) {
            if (!byPath.has(option.path)) byPath.set(option.path, option);
        }
    }
    return [...byPath.values()];
}

function fieldOptions(
    fields: DataField[],
    scopeName: string,
    scopeLabel: string,
    prefix = "",
): ConditionFieldOption[] {
    const options: ConditionFieldOption[] = [];
    for (const field of fields) {
        const relative = relativePath(field.path, prefix);
        const path = relative ? `${scopeName}.${relative}` : scopeName;
        options.push({
            path,
            label: field.label ?? field.path,
            scopeLabel,
            type: field.type,
        });
        options.push(...fieldOptions(field.children ?? [], scopeName, scopeLabel, relative));
    }
    return options;
}

function relativePath(path: string, prefix: string): string {
    if (path === ".") return prefix;
    return prefix ? `${prefix}.${path}` : path;
}
