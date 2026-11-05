import { observeBlocAttributes } from "@bernouy/cms-content/browser";
import { ColorInputController } from "./runtime/behavior";

export function mount(root: HTMLElement): void | (() => void) {
    const controller = new ColorInputController(root);
    controller.connect();
    const stopObserving = observeBlocAttributes(root, ColorInputController.observedAttributes, (name) =>
        controller.attributeChanged(name),
    );
    return () => {
        stopObserving();
        controller.disconnect();
    };
}
