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
export type Surface = "richtextbar" | "blocActions";

export type SurfaceExtensionMap = {
    richtextbar: RichTextBarExtension;
    blocActions: BlocActionExtension;
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
    enabled?:   () => boolean;
    /** Items the user can pick — paths into the publishing bloc's data shape. */
    getOptions: () => Field[];
    /** Called when the user clicks an option. The extension owns the side-effect
     *  (wrapping, replacing, reading attributes…). Return type is `void` because
     *  the bar drives no follow-up — unlike richtextbar's text insertion. */
    onPick:     (option: Field, ctx: BlocActionContext) => void;
}
