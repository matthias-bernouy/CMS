import {
    asRepeat,
    asSource,
    asSourceBody,
    CMS_BINDING_ATTRIBUTES,
    parseSource,
    type Editor,
} from "@bernouy/cms-content/editor";

import {
    clearSourceDependencyUsage,
    collectSourceDependencyUsages,
    type SourceDependencyUsage,
} from "../../Bindings/sourceDependencyCleanup";
import type { EditorDataSource } from "../../../../../../runtime";
import type { SourceBinding } from "./sourceBindingTypes";

export type { SourceBinding } from "./sourceBindingTypes";
export {
    removeSourceStatusCondition,
    setSourceStatusCondition,
    setSourceStatusConditions,
} from "./sourceStatusBindings";

const BINDING_READY_ATTRIBUTE = "cms-ready";

export function setSource(
    editor: Editor,
    source: EditorDataSource,
    binding: SourceBinding = { url: source.url },
): void {
    editor.target.setAttribute(
        CMS_BINDING_ATTRIBUTES.source,
        (asSource as (source: SourceBinding | string) => string)(binding),
    );
    if (binding.trigger === "submit" || binding.trigger === "change") {
        editor.target.setAttribute(CMS_BINDING_ATTRIBUTES.sourceTrigger, binding.trigger);
    } else {
        editor.target.removeAttribute(CMS_BINDING_ATTRIBUTES.sourceTrigger);
    }
    const method = binding.method ?? source.method ?? "GET";
    if (method && (method !== "GET" || binding.trigger === "submit" || binding.trigger === "change")) {
        editor.target.setAttribute(CMS_BINDING_ATTRIBUTES.sourceMethod, method);
    } else {
        editor.target.removeAttribute(CMS_BINDING_ATTRIBUTES.sourceMethod);
    }

    const body = binding.body ? (asSourceBody as (body: Record<string, unknown>) => string)(binding.body) : "";
    if (body) {
        editor.target.setAttribute(CMS_BINDING_ATTRIBUTES.sourceBody, body);
    } else {
        editor.target.removeAttribute(CMS_BINDING_ATTRIBUTES.sourceBody);
    }
}

export function removeSource(editor: Editor, confirmRemoveSourceDependents: (count: number) => boolean): boolean {
    const usages = sourceDependentBindings(editor);
    if (usages.length > 0 && !confirmRemoveSourceDependents(usages.length)) {
        return false;
    }

    for (const usage of usages) {
        clearSourceDependencyUsage(usage);
    }
    editor.target.removeAttribute(CMS_BINDING_ATTRIBUTES.source);
    editor.target.removeAttribute(CMS_BINDING_ATTRIBUTES.sourceBody);
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
    if (typeof confirm !== "function") {
        return true;
    }

    const plural = count === 1 ? "binding depends" : "bindings depend";
    return confirm(
        `This source has ${count} descendant ${plural} on its data. Remove the source and clean those dependent bindings?`,
    );
}

export function setRepeat(editor: Editor, path: string, alias: string): void {
    editor.target.setAttribute(CMS_BINDING_ATTRIBUTES.repeat, asRepeat({ path, alias }));
}

export function removeRepeat(editor: Editor): void {
    editor.target.removeAttribute(CMS_BINDING_ATTRIBUTES.repeat);
}
