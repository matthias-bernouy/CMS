import {
    CMS_BINDING_ATTRIBUTES,
    CMS_BINDING_CORE_TAG,
    parseSourceStatusConditions,
    parseRepeat,
    type Editor,
} from "@bernouy/cms-content/editor";

export type SourceDependencyUsage = {
    target: Element | Text;
    attribute?: string;
};

type DependencyScope = {
    aliases: Set<string>;
    sourceId?: string;
    sourceLocal: boolean;
};
export function collectSourceDependencyUsages(
    editor: Editor,
    sourceAlias?: string,
    sourceId?: string,
): SourceDependencyUsage[] {
    const usages: SourceDependencyUsage[] = [];
    const scope = collectElementDependencies(
        editor.target,
        {
            aliases: sourceAlias ? new Set([sourceAlias]) : new Set(),
            sourceId,
            sourceLocal: true,
        },
        usages,
        { isRoot: true },
    );

    collectBindingDependencies(editor.target, scope, usages);
    collectEditorBindingDependencies(editor, scope, usages);
    return dedupeDependencyUsages(usages);
}
export function clearSourceDependencyUsage(usage: SourceDependencyUsage): void {
    if (usage.target.nodeType === Node.TEXT_NODE) {
        usage.target.textContent = withoutBindingExpressions(usage.target.textContent ?? "");
        return;
    }
    if (!usage.attribute || !(usage.target instanceof Element)) {
        return;
    }
    if (usage.attribute === CMS_BINDING_ATTRIBUTES.repeat || usage.attribute === CMS_BINDING_ATTRIBUTES.condition) {
        usage.target.removeAttribute(usage.attribute);
        return;
    }
    const current = usage.target.getAttribute(usage.attribute) ?? "";
    const next = withoutBindingExpressions(current).trim();
    if (next) {
        usage.target.setAttribute(usage.attribute, next);
    } else {
        usage.target.removeAttribute(usage.attribute);
    }
}
function collectBindingDependencies(
    root: Element,
    inheritedScope: DependencyScope,
    usages: SourceDependencyUsage[],
): void {
    for (const child of Array.from(root.childNodes)) {
        if (child.nodeType === Node.TEXT_NODE) {
            const text = child as Text;
            if (bindingTextDependsOn(text.data, inheritedScope)) {
                usages.push({ target: text });
            }
            continue;
        }
        if (child.nodeType !== Node.ELEMENT_NODE) {
            continue;
        }
        const element = child as Element;
        const scope = collectElementDependencies(element, inheritedScope, usages);
        if (isBindingBoundary(element)) {
            continue;
        }
        collectBindingDependencies(element, scope, usages);
    }
}
function collectElementDependencies(
    element: Element,
    inheritedScope: DependencyScope,
    usages: SourceDependencyUsage[],
    options: { isRoot?: boolean } = {},
): DependencyScope {
    const scope: DependencyScope = {
        aliases: new Set(inheritedScope.aliases),
        sourceId: inheritedScope.sourceId,
        sourceLocal: inheritedScope.sourceLocal,
    };

    if (!options.isRoot && isBindingBoundary(element)) {
        return scope;
    }

    const repeat = element.getAttribute(CMS_BINDING_ATTRIBUTES.repeat);
    if (repeat && (inheritedScope.sourceLocal || bindingTextDependsOn(repeat, inheritedScope))) {
        usages.push({ target: element, attribute: CMS_BINDING_ATTRIBUTES.repeat });
        const parsed = parseRepeat(repeat) as { alias?: string } | null;
        const repeatAlias = parsed?.alias?.trim();
        if (repeatAlias) {
            scope.aliases.add(repeatAlias);
        }
    }

    for (const attribute of Array.from(element.attributes)) {
        if (attribute.name === CMS_BINDING_ATTRIBUTES.source) {
            continue;
        }
        if (attribute.name === CMS_BINDING_ATTRIBUTES.repeat) {
            continue;
        }
        if (bindingTextDependsOn(attribute.value, scope)) {
            usages.push({ target: element, attribute: attribute.name });
        }
    }

    return scope;
}
function collectEditorBindingDependencies(
    editor: Editor,
    inheritedScope: DependencyScope,
    usages: SourceDependencyUsage[],
): void {
    for (const child of editor.getChildren()) {
        const scope = collectElementDependencies(child.target, inheritedScope, usages);
        if (isBindingBoundary(child.target)) {
            continue;
        }

        collectBindingDependencies(child.target, scope, usages);
        collectEditorBindingDependencies(child, scope, usages);
    }
}
function isBindingBoundary(element: Element): boolean {
    return element.hasAttribute(CMS_BINDING_ATTRIBUTES.source) || element.localName === CMS_BINDING_CORE_TAG;
}
function bindingTextDependsOn(value: string, scope: DependencyScope): boolean {
    for (const alias of scope.aliases) {
        if (expressionReferencesScope(value, alias)) {
            return true;
        }
    }

    if (!scope.sourceLocal) {
        return false;
    }
    return containsBindingSyntax(value, scope);
}
function expressionReferencesScope(value: string, scope: string): boolean {
    const escaped = scope.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^A-Za-z0-9_$])${escaped}(?:\\b|\\s*\\.)`).test(value);
}
function containsBindingSyntax(value: string, scope: DependencyScope): boolean {
    const statusConditions = parseSourceStatusConditions(value);
    if (statusConditions.length > 0) {
        return statusConditions.some((condition) => !condition.sourceId || condition.sourceId === scope.sourceId);
    }

    if (/\S+\s+as\s+[A-Za-z_$][\w$]*\s*$/.test(value)) {
        return true;
    }

    const matches = value.matchAll(/\{\{\s*([\s\S]*?)\s*\}\}/g);
    for (const match of matches) {
        const expression = match[1]?.trim() ?? "";
        const head = /^[A-Za-z_$][\w$]*/.exec(expression)?.[0] ?? "";
        if (head && expression[head.length] !== ".") {
            return true;
        }
    }

    return false;
}
function withoutBindingExpressions(value: string): string {
    return value
        .replace(/\{\{\s*[\s\S]*?\s*\}\}/g, "")
        .replace(/\s+/g, " ")
        .trim();
}
function dedupeDependencyUsages(usages: SourceDependencyUsage[]): SourceDependencyUsage[] {
    const seen = new Set<string>();
    const ids = new WeakMap<Node, number>();
    let nextId = 0;

    return usages.filter((usage) => {
        let id = ids.get(usage.target);
        if (id === undefined) {
            id = nextId;
            nextId += 1;
            ids.set(usage.target, id);
        }

        const key = `${id}:${usage.attribute ?? ""}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}
