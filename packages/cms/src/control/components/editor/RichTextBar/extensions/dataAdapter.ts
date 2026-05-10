import type { DataExtension, RichTextBarExtension } from "src/control/core/editorSystem/extensions";
import { collectAncestorExtensions, flattenScalars } from "src/control/core/editorSystem/extensions";
import { ICON_DATABASE } from "src/control/components/icons";

/**
 * Synthesize one virtual `RichTextBarExtension` per ancestor data
 * source so the richtextbar's existing popover machinery (one section
 * per extension, one row per field) renders data-driven completions
 * without duplicating UI plumbing.
 *
 * The inserted token is `{{ <sourceId>[.<path>] }}` — the runtime
 * renderer (e.g. `<cms-fetch>`) substitutes scalars at template time.
 */
export function adaptDataExtensions(fromEl: Element): RichTextBarExtension[] {
    return collectAncestorExtensions(fromEl, "data")
        .map(adaptOne)
        .filter((x): x is RichTextBarExtension => x !== null);
}

function adaptOne(d: DataExtension): RichTextBarExtension | null {
    if (d.enabled && !d.enabled()) return null;
    const schema = d.getSchema();
    if (!schema) return null;
    const fields = flattenScalars(schema).map(f => ({
        path:  f.path ? `${d.id}.${f.path}` : d.id,
        label: f.label,
        type:  f.type,
    }));
    if (fields.length === 0) return null;
    return {
        label:          d.label,
        icon:           ICON_DATABASE,
        getCompletions: () => fields,
        onPick:         (field) => `{{ ${field.path} }}`,
    };
}
