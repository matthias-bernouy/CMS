import type EditorRoot from "src/control/components/editor/EditorSystem/EditorRoot/EditorRoot";
import { NearestElementRequire } from "src/control/errors/NearestElementRequire";


export default function getClosestEditorSystem(ele: HTMLElement): EditorRoot {
    let current: Node | null = ele;

    while (current) {
        if (current instanceof Element) {
            const editorManager = current.closest("cms-editor-system");
            if (editorManager) return editorManager as EditorRoot;
        }

        if (current instanceof ShadowRoot) {
            current = current.host;
        } else {
            current = current.parentNode;
        }
    }

    throw new NearestElementRequire(ele, "cms-editor-system");
}