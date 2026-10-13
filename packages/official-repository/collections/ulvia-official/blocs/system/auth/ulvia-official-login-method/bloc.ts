import { Component } from "@bernouy/cms-content/browser";
import template from "./shadowdom.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

const LOGIN_PATH = /\/auth\/[a-z][a-z0-9._-]*\/login$/u;

export class Bloc extends Component {
    private button: HTMLButtonElement | null = null;

    constructor() {
        super({ css, template });
    }

    override connectedCallback(): void {
        this.button = this.querySelector(":scope > button");
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
        location.assign(target.href);
    };
}

function safeReturnTo(value: string | null): string | null {
    if (!value?.startsWith("/") || value.startsWith("//")) {
        return null;
    }
    const target = new URL(value, location.origin);
    return target.origin === location.origin ? `${target.pathname}${target.search}${target.hash}` : null;
}
