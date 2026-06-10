import type { CMSEvent } from "../events";

export type EDITOR_SYSTEM_MODE = "view" | "editor";

export declare global {

    interface HTMLElementEventMap {
        "editor-system-switch-mode": CMSEvent<EDITOR_SYSTEM_MODE>
    }

    interface HTMLElementTagNameMap {
        'cms-editor-system': EditorSystem;
    }

}