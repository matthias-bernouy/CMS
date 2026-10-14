import { parseSyncAttribute, readSyncValue, subscribeSyncValue, writeSyncValue } from "./SyncState";

const DEBOUNCE_MS = 300;

export class SyncControl {
    private readonly target;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private reflecting = false;
    private active = false;
    private waitingForDefinition = false;
    private stopSubscription: (() => void) | null = null;
    private childObserver: MutationObserver | null = null;
    private readonly onInput = () => this.schedule();
    private readonly onChange = () => this.write();
    private readonly onChildren = () => this.reflect(readSyncValue(this.target!, this.element.ownerDocument));

    constructor(private readonly element: Element) {
        this.target = parseSyncAttribute(element);
    }

    start(): void {
        if (!this.target) {
            return;
        }
        this.active = true;
        this.reflect(readSyncValue(this.target, this.element.ownerDocument));
        this.stopSubscription = subscribeSyncValue(
            this.target,
            (value) => this.reflect(value),
            this.element.ownerDocument,
        );
        this.element.addEventListener("input", this.onInput);
        this.element.addEventListener("change", this.onChange);
        const Observer = this.element.ownerDocument.defaultView?.MutationObserver ?? MutationObserver;
        this.childObserver = new Observer(this.onChildren);
        this.childObserver.observe(this.element, { childList: true });
    }

    dispose(): void {
        this.active = false;
        this.stopSubscription?.();
        this.stopSubscription = null;
        this.element.removeEventListener("input", this.onInput);
        this.element.removeEventListener("change", this.onChange);
        this.childObserver?.disconnect();
        this.childObserver = null;
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    private reflect(value: unknown): void {
        if (!this.controlIsDefined() || value === undefined || this.timer) {
            return;
        }
        const control = this.element as HTMLInputElement;
        this.reflecting = true;
        try {
            if (control.type === "checkbox") {
                control.checked = typeof value === "boolean" ? value : value === (control.value || "true");
            } else if (control.value !== String(value ?? "")) {
                control.value = String(value ?? "");
            }
        } finally {
            this.reflecting = false;
        }
    }

    private controlIsDefined(): boolean {
        const tag = this.element.localName;
        const registry = this.element.ownerDocument.defaultView?.customElements;
        if (!tag.includes("-") || !registry || registry.get(tag)) {
            return true;
        }
        if (!this.waitingForDefinition) {
            this.waitingForDefinition = true;
            void registry.whenDefined(tag).then(() => {
                this.waitingForDefinition = false;
                if (this.active && this.target) {
                    this.reflect(readSyncValue(this.target, this.element.ownerDocument));
                }
            });
        }
        return false;
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
        if (!this.target || this.reflecting) {
            return;
        }
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        const control = this.element as HTMLInputElement;
        const value = control.type === "checkbox" ? control.checked : (control.value ?? "");
        writeSyncValue(this.target, value, this.element.ownerDocument);
    }
}
