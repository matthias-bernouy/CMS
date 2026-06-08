import type { Field, RichTextBarExtension } from "cms-control/core/editorSystem/extensions";
import { collectDataFields, tokenOf } from "cms-control/core/editorSystem/extensions";
import { ICON_DATABASE } from "cms-control/components/icons";

/**
 * Synthesize one virtual `RichTextBarExtension` per ancestor data source so
 * the richtextbar's existing popover machinery (one section per source, one
 * row per field) renders data-driven completions without duplicating UI
 * plumbing.
 *
 * Pure presentation layer over `collectDataFields` — the scope walk + schema
 * flattening live there (single source of truth). Here we only group the flat
 * field list back by source and map each field to its `{{ <sourceId>[.<path>] }}`
 * insert token via `tokenOf`. The runtime renderer (e.g. `<cms-fetch>`)
 * substitutes scalars at template time.
 */
export function adaptDataExtensions(fromEl: Element): RichTextBarExtension[] {
    const bySource = new Map<string, { label: string; fields: Field[] }>();
    for (const f of collectDataFields(fromEl)) {
        const group = bySource.get(f.sourceId) ?? { label: f.sourceLabel, fields: [] };
        group.fields.push({ path: tokenOf(f), label: f.label, type: f.type });
        bySource.set(f.sourceId, group);
    }
    return [...bySource.values()].map(group => ({
        label:          () => group.label,
        icon:           ICON_DATABASE,
        getCompletions: () => group.fields,
        onPick:         (field) => `{{ ${field.path} }}`,
    }));
}
