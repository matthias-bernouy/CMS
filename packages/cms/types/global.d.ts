import type { EditorManager } from "src/control/core/editorSystem/runtime/EditorManager";
import type { Editor } from "src/control/core/editorSystem/Editor/Editor";
import type { Component } from "src/control/core/editorSystem/Component";
import type { registerEditor, registerEditor_opaque } from "src/control/core/editorSystem/registerEditor";
import type { Media } from "@bernouy/socle";
import { P9R_ATTR } from "src/socle/constants/editorAttributes";
import { P9R_CACHE, P9R_EVENT, P9R_ID, P9R_MODE } from "src/socle/constants/p9r-constants";

// NOTE: wildcard module declarations for `*.css` / `*.html` live in
// `./assets.d.ts`, NOT here. This file has top-level imports and is
// therefore a module — wildcard `declare module` entries would be
// scoped instead of reaching global scope.

declare global {

    interface Document {
        editors: {
            tag:   string,
            cl:    class,
            label: string,
            group: string,
        }[];
        compIdentifierToEditor: Map<string, Editor>;
    }

    var p9r: {
        readonly attr:  typeof P9R_ATTR;
        readonly mode:  typeof P9R_MODE;
        readonly event: typeof P9R_EVENT;
        readonly id:    typeof P9R_ID;
        readonly cache: typeof P9R_CACHE;
        readonly Component: typeof Component;
        readonly Editor: typeof Editor;
        readonly registerEditor: typeof registerEditor;
        readonly registerEditor_opaque: typeof registerEditor_opaque;
    };

    /**
     * CMS-scoped globals the active providers may install on `window`. Only
     * the shape is declared here — the actual runtime binding is the
     * provider's responsibility (e.g. the Media implementation is expected
     * to set `window._cms.Media` before the admin UI uses it).
     */
    interface Window {
        _cms?: {
            Media?: Media;
        };
    }

}

export {};
