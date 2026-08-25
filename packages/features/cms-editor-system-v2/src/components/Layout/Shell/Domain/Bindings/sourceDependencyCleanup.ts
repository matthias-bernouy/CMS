import {
    CMS_BINDING_ATTRIBUTES,
    CMS_BINDING_CORE_TAG,
    parseRepeat,
    parseRepeatRange,
    type Editor,
} from "@bernouy/cms-content/editor";
import { bindingTextDependsOn, type DependencyScope, withoutBindingExpressions } from "./sourceDependencyExpressions";

export type SourceDependencyUsage = {
    target: Element | Text;
    attribute?: string;
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
            independentAliases: new Set(),
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
        independentAliases: new Set(inheritedScope.independentAliases),
        sourceId: inheritedScope.sourceId,
        sourceLocal: inheritedScope.sourceLocal,
    };

    if (!options.isRoot && isBindingBoundary(element)) {
        return scope;
    }

    const repeat = element.getAttribute(CMS_BINDING_ATTRIBUTES.repeat);
    const range = repeat ? parseRepeatRange(repeat) : null;
    const repeatDependsOnSource =
        repeat && !range && (inheritedScope.sourceLocal || bindingTextDependsOn(repeat, inheritedScope));
    if (repeatDependsOnSource) {
        usages.push({ target: element, attribute: CMS_BINDING_ATTRIBUTES.repeat });
        const parsed = parseRepeat(repeat) as { alias?: string } | null;
        const repeatAlias = parsed?.alias?.trim();
        if (repeatAlias) {
            scope.independentAliases.delete(repeatAlias);
            scope.aliases.add(repeatAlias);
        }
    } else if (range) {
        scope.aliases.delete(range.alias);
        scope.independentAliases.add(range.alias);
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
