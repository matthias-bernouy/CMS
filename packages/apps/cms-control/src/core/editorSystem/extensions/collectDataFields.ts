import { collectAncestorExtensions } from "./collectAncestors";
import { flattenScalars } from "./schemaScalars";

/**
 * One scalar field surfaced by an ancestor `DataExtension`. The `sourceId`
 * + `sourceLabel` let consumers group fields by data source in the UI;
 * `path` is the dotted accessor inside that source (or empty when the
 * source schema itself is a primitive — token = `{{ <sourceId> }}`).
 *
 * Inserted token convention: `{{ <sourceId>[.<path>] }}`. The runtime
 * renderer (`cms-source`) substitutes scalars at render time.
 */
export type DataField = {
    sourceId:    string;
    sourceLabel: string;
    path:        string;
    label:       string;
    type:        string;
};

/**
 * Walk every `data` extension on `fromEl`'s ancestor chain (inner-first)
 * and flatten each schema into scalar fields the richtextbar / future
 * pickers can offer.
 */
export function collectDataFields(fromEl: Element): DataField[] {
    const out: DataField[] = [];
    for (const ext of collectAncestorExtensions(fromEl, "data")) {
        if (ext.enabled && !ext.enabled()) continue;
        const schema = ext.getSchema();
        if (!schema) continue;
        const sourceLabel = ext.label();
        for (const f of flattenScalars(schema)) {
            out.push({
                sourceId: ext.id,
                sourceLabel,
                path:     f.path,
                label:    f.label,
                type:     f.type,
            });
        }
    }
    return out;
}

/**
 * The insert token content for a field (without the `{{ }}` braces):
 * `<sourceId>[.<path>]`. An empty `path` resolves to the source itself
 * (`{{ <sourceId> }}`). Single source of truth for the token convention shared
 * by the richtextbar and the future Dynamic picker — the runtime interpolator
 * must resolve this same prefixed shape.
 */
export function tokenOf(f: DataField): string {
    return f.path ? `${f.sourceId}.${f.path}` : f.sourceId;
}
