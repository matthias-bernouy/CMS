import { BlocBehavior } from "@bernouy/cms-content/browser";

const LOGIN_PATH = /\/auth\/[a-z][a-z0-9._-]*\/login$/u;

export class Bloc extends BlocBehavior {
    private button: HTMLButtonElement | null = null;

    constructor(root: HTMLElement) {
        super(root);
    }

    override connectedCallback(): void {
        this.button = this.blocRoot instanceof HTMLButtonElement ? this.blocRoot : null;
        this.button?.addEventListener("click", this.open);
    }

    disconnectedCallback(): void {
        this.button?.removeEventListener("click", this.open);
        this.button = null;
    }

    private open = (): void => {
        const raw = this.getAttribute("login-url")?.trim();
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
