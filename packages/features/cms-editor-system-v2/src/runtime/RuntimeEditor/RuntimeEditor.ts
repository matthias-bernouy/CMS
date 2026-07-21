import { Editor } from "@bernouy/cms-content/editor";
import type { EditorRegistry } from "../EditorRegistry/EditorRegistry";
import { createRuntimeEditorClass } from "./createRuntimeEditorClass";

const RuntimeEditorClass = /* @__PURE__ */ createRuntimeEditorClass(Editor);

export class RuntimeEditor extends RuntimeEditorClass {
    constructor(target: HTMLElement, registry: EditorRegistry) {
        super(target, registry);
        registry.register(this);
    }
}
