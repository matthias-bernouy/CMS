import { Editor } from "./Editor/Editor";

export class EmptyEditor extends Editor {
    constructor(target: HTMLElement) {
        super(target, "");
    }

    init() {
    }

    restore() {
    } 
}


/**
 * Canonical registrar. Bloc bundles never call this directly — the
 * `p9rExternalsPlugin` injects a per-bloc shim that carries the
 * `BE5_*_TO_BE_REPLACED` placeholders at the bloc's own call site, so
 * post-build substitution in `build.ts` / `prepare_bloc.ts` produces the
 * right tag/label/group for that specific bloc. This function only lives
 * once on `window.p9r`, so it must not contain placeholders.
 */
export function registerEditor(props: {
    suffix?: string,
    cl?: new (node: HTMLElement) => Editor,
    tag: string,
    label: string,
    group: string,
}) {
    if ( !document.editors ) document.editors = [];
    document.editors.push({
        tag:   props.tag + (props.suffix || ""),
        cl:    props.cl || EmptyEditor,
        label: props.label + (props.suffix || ""),
        group: props.group, 
    })
}

/**
 * Register a bloc as opaque. The bloc itself still gets the parent-level action
 * bar (move, delete, duplicate, change), but its entire subtree is sealed: no
 * descendant will be editorized. Used when a bloc is deployed without an
 * Editor module.
 */
export function registerEditor_opaque(props: {
    tag: string,
    label: string,
    group: string,
}) {
    if ( !document.editors ) document.editors = [];
    document.editors.push({
        tag:   props.tag,
        cl:    EmptyEditor,
        label: props.label,
        group: props.group,
    })
}