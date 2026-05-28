import type { JSONSchema } from "cms-control/core/data/types";

/**
 * Surface = an editor-side UI affordance that blocs extend by publishing
 * scoped capabilities. Each Editor's extensions apply to itself + its light-DOM
 * descendants in the canvas.
 *
 * Closed enum: surfaces are editor-internal concepts. Bloc authors don't define
 * new surfaces — they publish into existing ones. New surfaces are added here
 * (and via a matching `extendXxx` method on `Editor`) only when there is a
 * concrete consumer to validate the contract.
 */
export type Surface = "richtextbar" | "blocActions" | "data";

export type SurfaceExtensionMap = {
    richtextbar: RichTextBarExtension;
    blocActions: BlocActionExtension;
    data:        DataExtension;
};

/** A field declared by a richtextbar extension — surfaced as a completion. */
export type Field = {
    /** Templating path. The bloc decides the syntax (e.g. "user.name", "items[].title"). */
    path:   string;
    label:  string;
    /** Optional hint for the popover (e.g. "string", "number"). Display only. */
    type?:  string;
};

export type PickContext = {
    selection:  Selection;
    range:      Range;
    editableEl: HTMLElement;
};

/**
 * Contract for the rich-text bar. The Editor that owns this extension is the
 * scope: the bar surfaces these completions only when the caret is inside the
 * Editor's target or one of its light-DOM descendants.
 *
 * Every display field is a getter — the popover resolves them on open, so the
 * bloc can react to attribute changes (alias, label override) without having
 * to dispose + re-register the extension.
 */
export interface RichTextBarExtension {
    label:          () => string;
    /** Optional inline SVG markup shown next to the label in the popover header. */
    icon?:          string;
    /** Sync only for MVP — pre-load async data in `BlocEditor.init()` and store
     *  it locally. A push-based update API can be added later if a real bloc
     *  needs it. */
    getCompletions: () => Field[];
    /** Returns the text to insert at the caret. The bar handles the actual DOM
     *  mutation; the extension stays decoupled from the editing engine. */
    onPick:         (field: Field, ctx: PickContext) => string;
    /** Optional gating — return false to hide the extension from the popover. */
    enabled?:       () => boolean;
}

/** Context passed to a blocActions extension at click time. `target` is the
 *  bloc whose BAG was open — typically a descendant of the editor publishing
 *  the extension. The extension is free to mutate it (wrap, replace, etc.). */
export type BlocActionContext = {
    target: HTMLElement;
};

/**
 * Contract for the per-bloc action bar (BAG). Hierarchical like richtextbar:
 * the BAG of any descendant of the publishing Editor surfaces these actions.
 * Use case: a `<base-fetch>` exposes "Iterate from data.items" so the user can
 * pick a child bloc and wrap it in `<base-list-foreach>` from its own BAG.
 */
export interface BlocActionExtension {
    label:      () => string;
    /** Inline SVG shown in the popover header (and as a fallback button title). */
    icon?:      string;
    /** Optional gate. Receives the BAG target so the extension can hide itself
     *  based on context (e.g. an iterate-action publisher wants to suppress
     *  paths an ancestor already iterates). */
    enabled?:   (ctx?: BlocActionContext) => boolean;
    /** Items the user can pick — paths into the publishing bloc's data shape.
     *  Receives the BAG target so options can be filtered against the target's
     *  surroundings (same rationale as `enabled`). */
    getOptions: (ctx?: BlocActionContext) => Field[];
    /** Called when the user clicks an option. The extension owns the side-effect
     *  (wrapping, replacing, reading attributes…). Return type is `void` because
     *  the bar drives no follow-up — unlike richtextbar's text insertion. */
    onPick:     (option: Field, ctx: BlocActionContext) => void;
}

/**
 * Contract for blocs that produce data (a `<fetch>`-like bloc, a list bloc,
 * any source whose shape is described by a JSON schema). Hierarchical:
 * descendants of the publishing Editor receive the extension via the
 * standard `collectAncestorExtensions("data")` walk.
 *
 * The schema is the single source of truth — consumers (richtextbar Data
 * dropdown, future array picker / iteration BAG action) derive their
 * specific projections (scalar paths, array paths, conditions on size)
 * from it. Bloc authors don't pre-flatten anything.
 *
 * `id` becomes the prefix in inserted tokens (e.g. `{{ <id>.user.name }}`),
 * so the renderer downstream can disambiguate when several ancestors
 * publish data. Pick a stable, human-readable identifier — typically the
 * bloc's binding key.
 */
export interface DataExtension {
    id:         string;
    label:      () => string;
    /** Returns the current schema describing the data shape. May return
     *  null while the bloc hasn't fetched/synced yet — consumers treat that
     *  as "no data yet" and skip the extension. */
    getSchema:  () => JSONSchema | null;
    /** Optional gating — return false to hide the extension from consumers. */
    enabled?:   () => boolean;
}
