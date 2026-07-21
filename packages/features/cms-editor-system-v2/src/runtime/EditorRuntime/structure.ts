import {
    CMS_BINDING_ATTRIBUTES,
    type Editor,
    type EditorCatalogEntry,
    type EditorDocument,
    parseSourceStatusConditions,
} from "@bernouy/cms-content/editor";
import { isCompositionRuntimeElement } from "@bernouy/components/base";
import type { EditorRegistry } from "../EditorRegistry/EditorRegistry";
import type { EditorStructureNode, RuntimeManagedEditor, StructureNode } from "./types";

export type EditorRuntimeStructureContext = {
    document: EditorDocument;
    registry: EditorRegistry;
    editors: readonly RuntimeManagedEditor[];
    entriesByEditor: ReadonlyMap<Editor, EditorCatalogEntry>;
};

export function runtimeElements(root: HTMLElement): HTMLElement[] {
    return [root, ...Array.from(root.querySelectorAll<HTMLElement>("*"))].filter(
        (element) => !hasCompositionAncestor(element),
    );
}

export function findClosestRuntimeEditor(
    context: EditorRuntimeStructureContext,
    target: Element | null,
): Editor | undefined {
    const { document, registry } = context;
    if (!target || !document.contentRoot.contains(target)) {
        return undefined;
    }
    const closest = registry.getClosestEditor(target, document.contentRoot);
    if (!closest) {
        return undefined;
    }

    let current: HTMLElement | null = closest.target;
    while (current && document.contentRoot.contains(current)) {
        const editor = registry.getEditor(current);
        if (editor?.getStructureMode() === "opaque") {
            return editor;
        }
        if (current === document.contentRoot) {
            break;
        }
        current = current.parentElement;
    }

    return findRichTextOwner(context, closest.target) ?? closest;
}

export function buildRuntimeStructure(context: EditorRuntimeStructureContext): StructureNode[] {
    return structureChildren(context, context.document.contentRoot);
}

export function findRichTextOwner(context: EditorRuntimeStructureContext, target: HTMLElement): Editor | undefined {
    const owner = context.registry.getRichTextOwner(target);
    return owner && context.document.contentRoot.contains(owner.target) ? owner : undefined;
}

function structureChildren(context: EditorRuntimeStructureContext, parent: HTMLElement): StructureNode[] {
    const children: EditorStructureNode[] = [];

    for (const editor of context.editors) {
        if (!context.document.contentRoot.contains(editor.target)) {
            continue;
        }
        if (editor.target === parent) {
            continue;
        }
        if (findRichTextOwner(context, editor.target)) {
            continue;
        }
        if (!parent.contains(editor.target)) {
            continue;
        }
        if (closestStructureParent(context, editor.target, parent) !== parent) {
            continue;
        }

        const entry = context.entriesByEditor.get(editor);
        if (!entry) {
            continue;
        }

        children.push({
            kind: "editor",
            editor,
            target: editor.target,
            tag: entry.tag,
            label: entry.label,
            icon: entry.icon,
            badges: structureBadges(editor),
            children: editor.getStructureMode() === "opaque" ? [] : structureChildren(context, editor.target),
        });
    }

    return children;
}

function structureBadges(editor: Editor): string[] {
    const badges: string[] = [];
    const slot = editor.target.getAttribute("slot");
    if (slot) {
        badges.push(slot);
    }
    if (editor.target.hasAttribute(CMS_BINDING_ATTRIBUTES.source)) {
        badges.push("Source");
    }
    if (editor.target.hasAttribute(CMS_BINDING_ATTRIBUTES.repeat)) {
        badges.push("Repeat");
    }
    const condition = editor.target.getAttribute(CMS_BINDING_ATTRIBUTES.condition);
    const sourceStatuses = [...new Set(parseSourceStatusConditions(condition).map((item) => item.state))];
    if (sourceStatuses.length > 0) {
        badges.push(...sourceStatuses);
    } else if (condition?.trim()) {
        badges.push("condition");
    }

    return badges;
}

function closestStructureParent(
    context: EditorRuntimeStructureContext,
    target: HTMLElement,
    stopAt: HTMLElement,
): HTMLElement {
    let current = target.parentElement;

    while (current && current !== stopAt) {
        if (context.document.contentRoot.contains(current)) {
            const editor = context.registry.getEditor(current);
            if (editor && !findRichTextOwner(context, editor.target)) {
                return current;
            }
        }
        current = current.parentElement;
    }

    return stopAt;
}

function hasCompositionAncestor(element: HTMLElement): boolean {
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
        if (isCompositionRuntimeElement(parent)) {
            return true;
        }
    }
    return false;
}
