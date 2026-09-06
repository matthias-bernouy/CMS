type Change = { id: string; resource: string; active: boolean };
type Toggle = HTMLElement & { checked: boolean };
const key = (change: Pick<Change, "id" | "resource">) => `${change.id}\0${change.resource}`;

/** Serializes user intent; the persistent declarative form owns all HTTP and result state. */
export class AvailabilityQueue {
    private readonly queued = new Map<string, Change>();
    private retryChanges: Change[] = [];
    private pending?: Change;
    private timer?: ReturnType<typeof setTimeout>;

    get dirty(): boolean {
        return Boolean(this.pending || this.queued.size);
    }

    change(root: HTMLElement, choice: HTMLElement): void {
        const id = choice.closest<HTMLElement>("[data-installation]")?.dataset.installation;
        const resource = choice.getAttribute("resource");
        const toggle = choice.querySelector<Toggle>("w13c-switch");
        if (!id || !resource || !toggle) {
            return;
        }
        const change = { id, resource, active: toggle.checked };
        this.retryChanges = [];
        this.queued.set(key(change), change);
        this.pump(root);
    }

    sync(root: HTMLElement): void {
        for (const choice of Array.from(root.querySelectorAll<HTMLElement>("cms-bloc-choice"))) {
            const id = choice.closest<HTMLElement>("[data-installation]")?.dataset.installation ?? "";
            const changeKey = key({ id, resource: choice.getAttribute("resource") ?? "" });
            const intent =
                this.queued.get(changeKey) ??
                (this.pending && key(this.pending) === changeKey ? this.pending : undefined);
            const toggle = choice.querySelector<Toggle>("w13c-switch");
            if (toggle) {
                toggle.checked = intent?.active ?? choice.getAttribute("selected") === "true";
            }
        }
    }

    complete(root: HTMLElement, success: boolean): void {
        const change = this.pending;
        if (!change) {
            return;
        }
        if (success) {
            for (const choice of Array.from(root.querySelectorAll<HTMLElement>("cms-bloc-choice"))) {
                if (
                    choice.getAttribute("resource") === change.resource &&
                    choice.closest<HTMLElement>("[data-installation]")?.dataset.installation === change.id
                ) {
                    choice.setAttribute("selected", String(change.active));
                }
            }
            if (this.queued.get(key(change))?.active === change.active) {
                this.queued.delete(key(change));
            }
        } else {
            const retries = new Map([[key(change), change], ...this.queued]);
            this.retryChanges = [...retries.values()];
            this.queued.clear();
        }
        this.pending = undefined;
        this.sync(root);
        // Finish the binding result event before submitting the next captured intent.
        this.timer = setTimeout(() => {
            if (this.queued.size) {
                this.pump(root);
            } else if (
                !this.pending &&
                root.isConnected &&
                (!success || new URLSearchParams(location.search).get("visibility"))
            ) {
                root.ownerDocument.dispatchEvent(new Event("bloc:availability-changed"));
            }
        }, 0);
    }

    retry(root: HTMLElement): void {
        for (const change of this.retryChanges) {
            this.queued.set(key(change), change);
        }
        this.retryChanges = [];
        this.pump(root);
        this.sync(root);
    }

    dispose(): void {
        clearTimeout(this.timer);
    }

    private pump(root: HTMLElement): void {
        if (this.pending || !root.isConnected) {
            return;
        }
        const change = this.queued.values().next().value;
        const form = root.querySelector<HTMLFormElement>("[data-availability-form]");
        if (!change || !form) {
            return;
        }
        this.queued.delete(key(change));
        this.pending = change;
        for (const field of ["id", "resource", "active"] as const) {
            form.querySelector<HTMLInputElement>(`input[name="${field}"]`)!.value = String(change[field]);
        }
        form.requestSubmit();
    }
}
