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
        this.sync();
    }

    attributeChanged(): void {
        this.sync();
    }

    private sync(): void {
        const control = this.blocRoot.matches("a, button") ? this.blocRoot : null;
        if (!control) {
            return;
        }
        const current = this.blocRoot.hasAttribute("active") || this.matchesCurrentLocation(control);
        this.blocRoot.toggleAttribute("data-current", current);
        if (current) {
            control.setAttribute("aria-current", "page");
        } else {
            control.removeAttribute("aria-current");
        }
    }

    private matchesCurrentLocation(control: HTMLElement): boolean {
        if (!(control instanceof HTMLAnchorElement) || !control.href || control.target) {
            return false;
        }
        const target = new URL(control.href, window.location.href);
        const current = new URL(window.location.href);
        return (
            target.origin === current.origin &&
            normalizePath(target.pathname) === normalizePath(current.pathname) &&
            Array.from(target.searchParams).every(([name, value]) => current.searchParams.getAll(name).includes(value))
        );
    }
}

function normalizePath(path: string): string {
    return path.length > 1 ? path.replace(/\/+$/u, "") : path;
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
