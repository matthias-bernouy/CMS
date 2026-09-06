import { AvailabilityDrafts } from "./AvailabilityDrafts";
import "./BlocChoice";
import "./artwork/LibraryArtwork";
import "./icons/LibraryIcon";
import "./preview/BlocPreview";

type Modal = HTMLElement & { show(): void };

/** Light-DOM interaction controller; all page markup and data bindings are static. */
export class BlocLibrary extends HTMLElement {
    private readonly drafts = new AvailabilityDrafts();

    connectedCallback(): void {
        this.addEventListener("click", this.clickAction);
        this.addEventListener("change", this.changeChoice);
        this.addEventListener("bloc:choice-ready", this.syncChoices);
        this.addEventListener("submit", this.prepareSubmission, true);
        this.addEventListener("cms-source:success", this.saved);
        window.addEventListener("beforeunload", this.beforeUnload);
    }

    disconnectedCallback(): void {
        this.removeEventListener("click", this.clickAction);
        this.removeEventListener("change", this.changeChoice);
        this.removeEventListener("bloc:choice-ready", this.syncChoices);
        this.removeEventListener("submit", this.prepareSubmission, true);
        this.removeEventListener("cms-source:success", this.saved);
        window.removeEventListener("beforeunload", this.beforeUnload);
    }

    private readonly syncChoices = (): void => this.drafts.sync(this);

    private readonly changeChoice = (event: Event): void => {
        const choice = (event.target as Element | null)?.closest<HTMLElement>("cms-bloc-choice");
        if (choice) {
            this.drafts.change(choice);
            this.syncChoices();
        }
    };

    private readonly prepareSubmission = (event: Event): void => {
        if (event.target instanceof HTMLFormElement && event.target.hasAttribute("data-availability-form")) {
            this.drafts.prepare(event.target);
        }
    };

    private readonly saved = (event: Event): void => {
        if (event.target instanceof HTMLFormElement && event.target.hasAttribute("data-availability-form")) {
            this.drafts.clear(event.target);
            this.syncChoices();
        }
    };

    private readonly clickAction = (event: Event): void => {
        const target = event.target instanceof Element ? event.target : null;
        const action = target?.closest<HTMLElement>("[data-reload], [data-discard], [data-preview]");
        if (!action) {
            return;
        }
        if (action.hasAttribute("data-discard")) {
            this.drafts.clear(action);
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
        if (this.drafts.dirty) {
            event.preventDefault();
            event.returnValue = "";
        }
    };
}

customElements.define("cms-bloc-library", BlocLibrary);
