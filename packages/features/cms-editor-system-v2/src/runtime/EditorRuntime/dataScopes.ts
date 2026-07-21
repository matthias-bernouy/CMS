import {
    CMS_BINDING_ATTRIBUTES,
    type DataField,
    type DataScope,
    type Editor,
    parseRepeat,
    parseSource,
} from "@bernouy/cms-content/editor";
import type { EditorRegistry } from "../EditorRegistry/EditorRegistry";
import type { EditorDataSource } from "../dataSources";

export function declareBindingDataScopes(
    editor: Editor,
    registry: EditorRegistry,
    dataSources: readonly EditorDataSource[],
): void {
    declareSourceDataScope(editor, dataSources);
    declareRepeatDataScope(editor, registry);
}

function declareSourceDataScope(editor: Editor, dataSources: readonly EditorDataSource[]): void {
    const source = parseSourceBinding(editor.target.getAttribute(CMS_BINDING_ATTRIBUTES.source) ?? "");
    if (!source) {
        return;
    }

    const schemaUrl = source.url.split("?")[0] ?? source.url;
    const dataSource = dataSources.find((candidate) => candidate.url === schemaUrl);
    editor.declareDataScope({
        name: source.alias ?? "data",
        label: dataSource?.label ?? source.url,
        source: source.url,
        fields: dataSource?.fields ?? [],
    });
}

function parseSourceBinding(value: string): { url: string; alias?: string } | null {
    const parsed = parseSource(value) as string | { url: string; alias?: string } | null;
    if (!parsed) {
        return null;
    }
    return typeof parsed === "string" ? { url: parsed } : parsed;
}

function declareRepeatDataScope(editor: Editor, registry: EditorRegistry): void {
    const repeat = parseRepeat(editor.target.getAttribute(CMS_BINDING_ATTRIBUTES.repeat) ?? "");
    if (!repeat?.alias) {
        return;
    }

    const field = findDataField(registry.collectDataScopes(editor.target), repeat.path);
    editor.declareDataScope({
        name: repeat.alias,
        label: repeat.alias,
        fields: field?.children ?? [],
    });
}

function findDataField(scopes: DataScope[], path: string): DataField | undefined {
    for (const scope of scopes) {
        const field = path === scope.name ? findDataFieldInList(scope.fields, ".") : undefined;
        const match =
            field ??
            findDataFieldInList(scope.fields, path) ??
            findDataFieldInList(scope.fields, stripScopeName(scope.name, path));
        if (match) {
            return match;
        }
    }

    return undefined;
}

function findDataFieldInList(fields: DataField[], path: string): DataField | undefined {
    for (const field of fields) {
        if (field.path === path) {
            return field;
        }
        const child = field.children ? findDataFieldInList(field.children, path) : undefined;
        if (child) {
            return child;
        }
    }

    return undefined;
}

function stripScopeName(scopeName: string, path: string): string {
    const prefix = `${scopeName}.`;
    return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}
