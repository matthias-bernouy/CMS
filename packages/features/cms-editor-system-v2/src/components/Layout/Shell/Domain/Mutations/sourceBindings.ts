import {
    asRepeat,
    asSource,
    CMS_BINDING_ATTRIBUTES,
    parseSource,
    type Editor,
} from "@bernouy/cms-content/editor";

import {
    clearSourceDependencyUsage,
    collectSourceDependencyUsages,
    type SourceDependencyUsage,
} from "../../sourceDependencyCleanup";
import type { EditorDataSource } from "../../../../../runtime";

type SourceBinding = {
    url: string;
    alias?: string;
    params?: Record<string, unknown>;
};

const BINDING_READY_ATTRIBUTE = "cms-ready";

export function setSource(
    editor: Editor,
    source: EditorDataSource,
    binding: SourceBinding = { url: source.url },
): void {
    editor.target.setAttribute(CMS_BINDING_ATTRIBUTES.source, (asSource as (source: SourceBinding | string) => string)(binding));
}

export function removeSource(editor: Editor, confirmRemoveSourceDependents: (count: number) => boolean): boolean {
    const usages = sourceDependentBindings(editor);
    if (usages.length > 0 && !confirmRemoveSourceDependents(usages.length)) return false;

    for (const usage of usages) clearSourceDependencyUsage(usage);
    editor.target.removeAttribute(CMS_BINDING_ATTRIBUTES.source);
    editor.target.removeAttribute(BINDING_READY_ATTRIBUTE);
    return true;
}

export function sourceDependentBindings(editor: Editor): SourceDependencyUsage[] {
    const source = parseSource(editor.target.getAttribute(CMS_BINDING_ATTRIBUTES.source) ?? "") as SourceBinding | null;
    const alias = source?.alias?.trim();

    return collectSourceDependencyUsages(editor, alias);
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
