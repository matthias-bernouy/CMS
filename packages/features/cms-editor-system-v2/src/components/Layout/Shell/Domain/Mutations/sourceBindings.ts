import {
    applySourceStatusCondition,
    applySourceStatusConditions,
    asRepeat,
    asSource,
    CMS_BINDING_ATTRIBUTES,
    sourceStatusConditionsFromElement,
    parseSource,
    type CmsSourceState,
    type CmsSourceStatusCondition,
    type Editor,
} from "@bernouy/cms-content/editor";

import {
    clearSourceDependencyUsage,
    collectSourceDependencyUsages,
    type SourceDependencyUsage,
} from "../../sourceDependencyCleanup";
import type { EditorDataSource } from "../../../../../runtime";

export type SourceBinding = {
    url: string;
    alias?: string;
    method?: EditorDataSource["method"];
    params?: Record<string, unknown>;
    trigger?: "auto" | "submit";
};

const BINDING_READY_ATTRIBUTE = "cms-ready";

export function setSource(
    editor: Editor,
    source: EditorDataSource,
    binding: SourceBinding = { url: source.url },
): void {
    editor.target.setAttribute(CMS_BINDING_ATTRIBUTES.source, (asSource as (source: SourceBinding | string) => string)(binding));
    if (binding.trigger === "submit") editor.target.setAttribute(CMS_BINDING_ATTRIBUTES.sourceTrigger, "submit");
    else editor.target.removeAttribute(CMS_BINDING_ATTRIBUTES.sourceTrigger);
    const method = binding.method ?? source.method ?? "GET";
    if (method && (method !== "GET" || binding.trigger === "submit")) editor.target.setAttribute(CMS_BINDING_ATTRIBUTES.sourceMethod, method);
    else editor.target.removeAttribute(CMS_BINDING_ATTRIBUTES.sourceMethod);
}

export function removeSource(editor: Editor, confirmRemoveSourceDependents: (count: number) => boolean): boolean {
    const usages = sourceDependentBindings(editor);
    if (usages.length > 0 && !confirmRemoveSourceDependents(usages.length)) return false;

    for (const usage of usages) clearSourceDependencyUsage(usage);
    editor.target.removeAttribute(CMS_BINDING_ATTRIBUTES.source);
    editor.target.removeAttribute(CMS_BINDING_ATTRIBUTES.sourceId);
    editor.target.removeAttribute(CMS_BINDING_ATTRIBUTES.sourceMethod);
    editor.target.removeAttribute(CMS_BINDING_ATTRIBUTES.sourcePublish);
    editor.target.removeAttribute(CMS_BINDING_ATTRIBUTES.sourceSuccessRedirect);
    editor.target.removeAttribute(CMS_BINDING_ATTRIBUTES.sourceSuccessReset);
    editor.target.removeAttribute(CMS_BINDING_ATTRIBUTES.sourceTrigger);
    editor.target.removeAttribute(BINDING_READY_ATTRIBUTE);
    return true;
}

export function sourceDependentBindings(editor: Editor): SourceDependencyUsage[] {
    const source = parseSource(editor.target.getAttribute(CMS_BINDING_ATTRIBUTES.source) ?? "") as SourceBinding | null;
    const alias = source?.alias?.trim();
    const sourceId = editor.target.getAttribute(CMS_BINDING_ATTRIBUTES.sourceId)?.trim();

    return collectSourceDependencyUsages(editor, alias, sourceId || undefined);
}

export function confirmRemoveSourceDependents(count: number): boolean {
    const confirm = globalThis.confirm;
    if (typeof confirm !== "function") return true;

    const plural = count === 1 ? "binding depends" : "bindings depend";
    return confirm(`This source has ${count} descendant ${plural} on its data. Remove the source and clean those dependent bindings?`);
}

export function setRepeat(editor: Editor, path: string, alias: string): void {
    editor.target.setAttribute(CMS_BINDING_ATTRIBUTES.repeat, asRepeat({ path, alias }));
}

export function removeRepeat(editor: Editor): void {
    editor.target.removeAttribute(CMS_BINDING_ATTRIBUTES.repeat);
}

export function setSourceStatusCondition(editor: Editor, sourceEditor: Editor, state: CmsSourceState): boolean {
    if (!canUseSourceForStatusCondition(editor.target, sourceEditor.target)) return false;
    if (hasNonSourceStatusCondition(editor.target)) return false;
    const sourceId = ensureSourceId(sourceEditor.target);
    if (hasSourceStatusConditionAncestor(editor.target, sourceEditor.target)) return false;
    applySourceStatusCondition(editor.target, state, sourceId);
    return true;
}

export function setSourceStatusConditions(
    editor: Editor,
    conditions: Array<{ sourceEditor: Editor; sourceState: CmsSourceState }>,
): boolean {
    if (conditions.length === 0) return false;
    if (hasNonSourceStatusCondition(editor.target)) return false;

    const next: CmsSourceStatusCondition[] = [];
    for (const condition of conditions) {
        if (!canUseSourceForStatusCondition(editor.target, condition.sourceEditor.target)) return false;
        if (hasSourceStatusConditionAncestor(editor.target, condition.sourceEditor.target)) return false;
        next.push({
            sourceId: ensureSourceId(condition.sourceEditor.target),
            state:    condition.sourceState,
        });
    }

    applySourceStatusConditions(editor.target, dedupeSourceStatusConditions(next));
    return true;
}

export function removeSourceStatusCondition(editor: Editor): boolean {
    if (sourceStatusConditionsFromElement(editor.target).length === 0) return false;
    editor.target.removeAttribute(CMS_BINDING_ATTRIBUTES.condition);
    return true;
}

function canUseSourceForStatusCondition(target: HTMLElement, source: HTMLElement): boolean {
    return target !== source && source.contains(target);
}

function hasNonSourceStatusCondition(target: HTMLElement): boolean {
    return target.hasAttribute(CMS_BINDING_ATTRIBUTES.condition) && sourceStatusConditionsFromElement(target).length === 0;
}

function hasSourceStatusConditionAncestor(target: HTMLElement, source: HTMLElement): boolean {
    for (let current = target.parentElement; current && current !== source; current = current.parentElement) {
        if (sourceStatusConditionTargetsSource(current, source)) return true;
    }
    return false;
}

function sourceStatusConditionTargetsSource(target: HTMLElement, source: HTMLElement): boolean {
    const conditions = sourceStatusConditionsFromElement(target);
    return conditions.some(condition => {
        if (condition.sourceId) return condition.sourceId === source.getAttribute(CMS_BINDING_ATTRIBUTES.sourceId);
        return nearestSourceAncestor(target) === source;
    });
}

function nearestSourceAncestor(target: HTMLElement): HTMLElement | null {
    for (let current = target.parentElement; current; current = current.parentElement) {
        if (current.hasAttribute(CMS_BINDING_ATTRIBUTES.source)) return current;
    }
    return null;
}

function ensureSourceId(source: HTMLElement): string {
    const current = source.getAttribute(CMS_BINDING_ATTRIBUTES.sourceId)?.trim();
    if (current && isSourceId(current)) return current;

    const parsed = parseSource(source.getAttribute(CMS_BINDING_ATTRIBUTES.source) ?? "") as SourceBinding | null;
    const base = normalizeSourceId(parsed?.alias ?? source.localName) || "source";
    const id = uniqueSourceId(source, base);
    source.setAttribute(CMS_BINDING_ATTRIBUTES.sourceId, id);
    return id;
}

function uniqueSourceId(source: HTMLElement, base: string): string {
    let candidate = base;
    let index = 2;
    while (sourceIdExists(source, candidate)) {
        candidate = `${base}-${index}`;
        index += 1;
    }
    return candidate;
}

function sourceIdExists(source: HTMLElement, id: string): boolean {
    const root = source.getRootNode() as ParentNode;
    for (const element of Array.from(root.querySelectorAll?.(`[${CMS_BINDING_ATTRIBUTES.sourceId}]`) ?? [])) {
        if (element !== source && element.getAttribute(CMS_BINDING_ATTRIBUTES.sourceId) === id) return true;
    }
    return false;
}

function normalizeSourceId(value: string): string {
    return value.trim()
        .replace(/[^A-Za-z0-9_$-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .replace(/^[^A-Za-z_$]+/, "");
}

function isSourceId(value: string): boolean {
    return /^[A-Za-z_$][\w$-]*$/.test(value);
}

function dedupeSourceStatusConditions(conditions: CmsSourceStatusCondition[]): CmsSourceStatusCondition[] {
    const seen = new Set<string>();
    return conditions.filter(condition => {
        const key = `${condition.sourceId ?? ""}:${condition.state}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}
