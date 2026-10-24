import { PageEditorController } from "./runtime/controller/index";

export function mount(root: HTMLElement): () => void {
    const controller = new PageEditorController(root);
    controller.connect();
    return () => {
        controller.disconnect();
    };
}
