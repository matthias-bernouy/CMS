import { AvailabilityQueue } from "./Queue";

/** Connects the shared bloc-availability form to every choice inside a host. */
export class AvailabilityController {
    private readonly queue = new AvailabilityQueue();

    constructor(private readonly root: HTMLElement) {}

    connect(): void {
        this.root.addEventListener("click", this.retry);
        this.root.addEventListener("change", this.changeChoice);
        this.root.addEventListener("bloc:choice-ready", this.syncChoices);
        this.root.addEventListener("cms-source:success", this.saved);
        this.root.addEventListener("cms-source:failed", this.saved);
        window.addEventListener("beforeunload", this.beforeUnload);
    }

    disconnect(): void {
        this.root.removeEventListener("click", this.retry);
        this.root.removeEventListener("change", this.changeChoice);
        this.root.removeEventListener("bloc:choice-ready", this.syncChoices);
        this.root.removeEventListener("cms-source:success", this.saved);
        this.root.removeEventListener("cms-source:failed", this.saved);
        this.queue.dispose();
        window.removeEventListener("beforeunload", this.beforeUnload);
    }

    private readonly syncChoices = (): void => this.queue.sync(this.root);

    private readonly changeChoice = (event: Event): void => {
        const choice = (event.target as Element | null)?.closest<HTMLElement>("cms-bloc-choice");
        if (choice) {
            this.queue.change(this.root, choice);
            this.syncChoices();
        }
    };

    private readonly saved = (event: Event): void => {
        if (event.target instanceof HTMLFormElement && event.target.hasAttribute("data-availability-form")) {
            this.queue.complete(this.root, event.type === "cms-source:success");
            this.syncChoices();
        }
    };

    private readonly retry = (event: Event): void => {
        if ((event.target as Element | null)?.closest("[data-retry-availability]")) {
            this.queue.retry(this.root);
            this.syncChoices();
        }
    };

    private readonly beforeUnload = (event: BeforeUnloadEvent): void => {
        if (this.queue.dirty) {
            event.preventDefault();
            event.returnValue = "";
        }
    };
}
