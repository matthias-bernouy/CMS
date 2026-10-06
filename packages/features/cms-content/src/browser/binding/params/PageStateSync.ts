import { currentState, setState, STATE_CHANGE_EVENT } from "../params";
import { PAGE_STATE_ATTR } from "../core/attrs";

const DEBOUNCE_MS = 300;

export { PAGE_STATE_ATTR };

export class PageStateSync {
    private readonly key: string;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private reflectTimer: ReturnType<typeof setTimeout> | null = null;
    private last: string | null = null;
    private reflecting = false;
    private childObserver: MutationObserver | null = null;
    private readonly onInput = () => this.schedule();
    private readonly onChange = () => this.write();
    private readonly onState = () => this.reflect();
    private readonly onChildren = () => {
        if (this.reflectTimer) {
            clearTimeout(this.reflectTimer);
        }
        this.reflectTimer = setTimeout(() => this.reflect(), 0);
    };

    constructor(private readonly el: Element) {
        this.key = (el.getAttribute(PAGE_STATE_ATTR) || "").trim() || (el as HTMLInputElement).name || "";
    }

    start(): void {
        if (!this.key) {
            console.warn(`${PAGE_STATE_ATTR}: no key - set ${PAGE_STATE_ATTR}="<key>" or a name attribute`, this.el);
            return;
        }
        this.reflect();
        this.el.addEventListener("input", this.onInput);
        this.el.addEventListener("change", this.onChange);
        this.el.ownerDocument.addEventListener(STATE_CHANGE_EVENT, this.onState);
        const MutationObserverCtor = this.el.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
        this.childObserver = new MutationObserverCtor(this.onChildren);
        this.childObserver.observe(this.el, { childList: true });
    }

    dispose(): void {
        this.el.removeEventListener("input", this.onInput);
        this.el.removeEventListener("change", this.onChange);
        this.el.ownerDocument.removeEventListener(STATE_CHANGE_EVENT, this.onState);
        this.childObserver?.disconnect();
        this.childObserver = null;
        if (this.timer) {
            clearTimeout(this.timer);
        }
        if (this.reflectTimer) {
            clearTimeout(this.reflectTimer);
        }
        this.timer = this.reflectTimer = null;
    }

    private reflect(): void {
        if (this.timer) {
            return;
        }
        const v = currentState(this.key, this.el.ownerDocument);
        const el = this.el as HTMLInputElement;
        if (el.type === "checkbox") {
            const checked = v !== "" && v === (el.value || "true");
            if (el.checked !== checked) {
                this.set(() => {
                    el.checked = checked;
                });
            }
        } else if (el.value !== v) {
            this.set(() => {
                el.value = v;
            });
        }
        this.last = this.currentValue();
    }

    private set(apply: () => void): void {
        this.reflecting = true;
        try {
            apply();
        } finally {
            this.reflecting = false;
        }
    }

    private currentValue(): string {
        const el = this.el as HTMLInputElement;
        return el.type === "checkbox" ? (el.checked ? el.value || "true" : "") : (el.value ?? "");
    }

    private schedule(): void {
        if (this.reflecting) {
            return;
        }
        if (this.timer) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => this.write(), DEBOUNCE_MS);
    }

    private write(): void {
        if (this.reflecting) {
            return;
        }
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        const value = this.currentValue();
        if (value === this.last) {
            return;
        }
        this.last = value;
        setState(this.key, value, this.el.ownerDocument);
    }
}
