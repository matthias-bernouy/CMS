import { Editor } from "../Editor/Editor";
import { getEditorContext } from "../editorContext";

/**
 * The generic binding-control surface `<cms-binding-core>` (cms-blocs) exposes —
 * deliberately NOT editor-flavoured. The element only provides primitives; the
 * editor decides WHEN to pause / resume.
 */
type BindingCoreElement = HTMLElement & {
    runtime: { deactivate(): void } | null;
    startRuntime(): void;
};

/**
 * Editor for `<cms-binding-core>` — the Shell's data-binding root, rendered into
 * the editor canvas as part of the page Shell. It is NOT a classic bloc: no BAG,
 * no breadcrumb entry, not selectable (`isInteractive` is forced false; it is
 * registered with an empty label + `visible: false`).
 *
 * It OWNS the pause/resume orchestration; cms-blocs only provides the generic
 * primitives (`runtime.deactivate()` pauses + reverts to the template,
 * `startRuntime()` resumes with fresh data). This editor maps them to the mode:
 *   - EDITOR mode → pause: show the authored template ({{ }} / cms-source /
 *     cms-repeat verbatim) so the content is editable, not the live render.
 *   - VIEW mode   → resume: render with data.
 *
 * The editor opens in EDITOR mode and `ModeBinding` only fires on subsequent
 * switches, so we pause once at construction.
 */
export class BindingCoreEditor extends Editor {

    constructor(target: HTMLElement) {
        super(target, "");
        if (getEditorContext().mode === "view") this.core.startRuntime();
        else this.core.runtime?.deactivate();
    }

    /** Pure plumbing — nothing to surface, so never bind hover / open a BAG. */
    public override get isInteractive(): boolean {
        return false;
    }

    public override onSwitchMode(mode: string): void {
        if (mode === "view") this.core.startRuntime();
        else this.core.runtime?.deactivate();
    }

    public override viewEditor(): void {
        this.target.setAttribute(p9r.attr.ACTION.DISABLE_DRAGGING, "true");
        super.viewEditor();
    }

    private get core(): BindingCoreElement {
        return this.target as BindingCoreElement;
    }

    init() {}
    restore() {}
}
