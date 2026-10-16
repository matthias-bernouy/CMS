import { createBlocScope } from "@bernouy/cms-content/browser";

const LOGIN_PATH = /\/auth\/[a-z][a-z0-9._-]*\/login$/u;

class Controller {
    private readonly scope: ReturnType<typeof createBlocScope>;
    private button: HTMLButtonElement | null = null;

    constructor(private readonly blocRoot: HTMLElement) {
        this.scope = createBlocScope(this.blocRoot);
    }

    connect(): void {
        this.button = this.blocRoot instanceof HTMLButtonElement ? this.blocRoot : null;
        this.button?.addEventListener("click", this.open);
    }

    disconnect(): void {
        this.button?.removeEventListener("click", this.open);
        this.button = null;
    }

    private open = (): void => {
        const raw = this.blocRoot.getAttribute("login-url")?.trim();
        if (!raw) {
            return;
        }
        const target = new URL(raw, location.href);
        if (target.origin !== location.origin || !LOGIN_PATH.test(target.pathname)) {
            return;
        }
        const returnTo = safeReturnTo(new URL(location.href).searchParams.get("returnTo"));
        if (returnTo) {
            target.searchParams.set("returnTo", returnTo);
        }
        const anchor = document.createElement("a");
        anchor.href = target.href;
        anchor.rel = "noopener";
        anchor.click();
    };
}

function safeReturnTo(value: string | null): string | null {
    if (!value?.startsWith("/") || value.startsWith("//")) {
        return null;
    }
    const target = new URL(value, location.origin);
    return target.origin === location.origin ? `${target.pathname}${target.search}${target.hash}` : null;
}

export function mount(root: HTMLElement): void | (() => void) {
    const controller = new Controller(root);
    controller.connect();
    return () => {
        controller.disconnect();
    };
}
