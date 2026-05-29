import type { EditorManager } from "cms-control/core/editorSystem/runtime/EditorManager";
import type { Editor } from "cms-control/core/editorSystem/Editor/Editor";
import type { Component } from "@bernouy/cms-blocs/base";
import type { registerEditor, registerEditor_opaque } from "cms-control/core/editorSystem/registerEditor";
import { P9R_ATTR } from "@bernouy/cms-shared";
import { P9R_CACHE, P9R_EVENT, P9R_ID, P9R_MODE } from "@bernouy/cms-shared";

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

}

export {};
