import type { CMSEvent } from "../events";

export type EDITOR_SYSTEM_MODE = "view" | "editor";

export declare global {

    interface HTMLElementEventMap {
        "editor-system-switch-mode": CMSEvent<EDITOR_SYSTEM_MODE>,
        "editor-system-save":        CMSEvent<string>
    }

    interface HTMLElementTagNameMap {
        'cms-editor-system': EditorSystem;
    }

}