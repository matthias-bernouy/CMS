import { AvailabilityQueue } from "./AvailabilityQueue";
import "./BlocChoice";
import "./artwork/LibraryArtwork";
import "./icons/LibraryIcon";
import "./preview/BlocPreview";

type Modal = HTMLElement & { show(): void };

/** Light-DOM interaction controller; all page markup and data bindings are static. */
export class BlocLibrary extends HTMLElement {
    private readonly queue = new AvailabilityQueue();

    connectedCallback(): void {
        this.addEventListener("click", this.clickAction);
        this.addEventListener("change", this.changeChoice);
        this.addEventListener("bloc:choice-ready", this.syncChoices);
        this.addEventListener("cms-source:success", this.saved);
        this.addEventListener("cms-source:failed", this.saved);
        window.addEventListener("beforeunload", this.beforeUnload);
    }

    disconnectedCallback(): void {
        this.removeEventListener("click", this.clickAction);
        this.removeEventListener("change", this.changeChoice);
        this.removeEventListener("bloc:choice-ready", this.syncChoices);
        this.removeEventListener("cms-source:success", this.saved);
        this.removeEventListener("cms-source:failed", this.saved);
        this.queue.dispose();
        window.removeEventListener("beforeunload", this.beforeUnload);
    }

    private readonly syncChoices = (): void => this.queue.sync(this);

    private readonly changeChoice = (event: Event): void => {
        const choice = (event.target as Element | null)?.closest<HTMLElement>("cms-bloc-choice");
        if (choice) {
            this.queue.change(this, choice);
            this.syncChoices();
        }
    };

    private readonly saved = (event: Event): void => {
        if (event.target instanceof HTMLFormElement && event.target.hasAttribute("data-availability-form")) {
            this.queue.complete(this, event.type === "cms-source:success");
            this.syncChoices();
        }
    };

    private readonly clickAction = (event: Event): void => {
        const target = event.target instanceof Element ? event.target : null;
        const action = target?.closest<HTMLElement>("[data-reload], [data-retry-availability], [data-preview]");
        if (!action) {
            return;
        }
        if (action.hasAttribute("data-retry-availability")) {
            this.queue.retry(this);
            this.syncChoices();
        } else if (action.dataset.reload) {
            this.ownerDocument.dispatchEvent(new Event(action.dataset.reload));
        } else if (action.dataset.preview) {
            const modal = this.querySelector<Modal>("[data-preview-modal]");
            modal?.querySelector("cms-bloc-preview")?.setAttribute("src", action.dataset.preview);
            const heading = modal?.querySelector("[slot=title]");
            if (heading) {
                heading.textContent = action.dataset.previewTitle ?? "Bloc preview";
            }
            modal?.show();
        }
    };

    private readonly beforeUnload = (event: BeforeUnloadEvent): void => {
        if (this.queue.dirty) {
            event.preventDefault();
            event.returnValue = "";
        }
    };
}

customElements.define("cms-bloc-library", BlocLibrary);
