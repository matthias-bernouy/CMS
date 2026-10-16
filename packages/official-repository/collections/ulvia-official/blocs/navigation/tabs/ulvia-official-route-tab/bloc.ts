import { createBlocScope, observeBlocAttributes } from "@bernouy/cms-content/browser";

class Controller {
    private readonly scope: ReturnType<typeof createBlocScope>;
    static get observedAttributes(): string[] {
        return ["active"];
    }

    constructor(private readonly blocRoot: HTMLElement) {
        this.scope = createBlocScope(this.blocRoot);
    }

    connect(): void {
        this.syncCurrentPage();
    }

    attributeChanged(): void {
        this.syncCurrentPage();
    }

    private syncCurrentPage(): void {
        const link = this.blocRoot instanceof HTMLAnchorElement ? this.blocRoot : null;
        if (!link) {
            return;
        }
        if (this.blocRoot.hasAttribute("active")) {
            link.setAttribute("aria-current", "page");
        } else {
            link.removeAttribute("aria-current");
        }
    }
}

export function mount(root: HTMLElement): void | (() => void) {
    const controller = new Controller(root);
    controller.connect();
    const stopObserving = observeBlocAttributes(root, Controller.observedAttributes, () =>
        controller.attributeChanged(),
    );
    return () => {
        stopObserving();
    };
}
