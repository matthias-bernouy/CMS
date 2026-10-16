import { createBlocScope, observeBlocAttributes } from "@bernouy/cms-content/browser";

class Controller {
    private readonly scope: ReturnType<typeof createBlocScope>;
    static get observedAttributes(): string[] {
        return ["label"];
    }

    constructor(private readonly blocRoot: HTMLElement) {
        this.scope = createBlocScope(this.blocRoot);
        this.syncLabel();
    }

    attributeChanged(): void {
        this.syncLabel();
    }

    private syncLabel(): void {
        this.scope
            .querySelector("nav")
            ?.setAttribute("aria-label", this.blocRoot.getAttribute("label") || "Navigation");
    }
}

export function mount(root: HTMLElement): void | (() => void) {
    const controller = new Controller(root);
    const stopObserving = observeBlocAttributes(root, Controller.observedAttributes, () =>
        controller.attributeChanged(),
    );
    return () => {
        stopObserving();
    };
}
