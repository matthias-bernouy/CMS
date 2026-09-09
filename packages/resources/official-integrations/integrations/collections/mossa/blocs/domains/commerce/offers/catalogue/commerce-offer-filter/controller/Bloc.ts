import { refreshSourceContext, setSourceContext, sourceFormRequest } from "@bernouy/components/binding";
import { filterPresentation, presentationAttributes, projectSchema } from "./presentation";

export class CommerceOfferFilter extends HTMLElement {
    static observedAttributes = presentationAttributes;

    private requestCategory = "";
    private requestPending = false;
    private syncScheduled = false;

    connectedCallback(): void {
        this.style.display = "contents";
        setSourceContext(this.source, (value) => ({
            ...projectSchema(value, this),
            presentation: {
                ...filterPresentation(this),
                matchesCategory: Boolean(this.category && this.category === this.requestCategory),
            },
        }));
        this.categoryRoot?.addEventListener("change", this.onCategorySignal);
        this.ownerDocument.addEventListener("cms-params:change", this.onCategorySignal);
        this.ownerDocument.defaultView?.addEventListener("popstate", this.onCategorySignal);
        this.updateSelectCategoryCopy();
        this.scheduleSync();
    }

    disconnectedCallback(): void {
        this.categoryRoot?.removeEventListener("change", this.onCategorySignal);
        this.ownerDocument.removeEventListener("cms-params:change", this.onCategorySignal);
        this.ownerDocument.defaultView?.removeEventListener("popstate", this.onCategorySignal);
    }

    attributeChangedCallback(): void {
        if (!this.isConnected) {
            return;
        }
        this.updateSelectCategoryCopy();
        refreshSourceContext(this.source);
    }

    private readonly onCategorySignal = (): void => this.scheduleSync();

    private scheduleSync(): void {
        if (this.syncScheduled) {
            return;
        }
        this.syncScheduled = true;
        queueMicrotask(() => {
            this.syncScheduled = false;
            if (this.isConnected) {
                void this.syncCategory();
            }
        });
    }

    private async syncCategory(): Promise<void> {
        const category = this.category;
        this.selectCategoryMessage.hidden = Boolean(category);
        refreshSourceContext(this.source);
        if (!category || this.requestPending || category === this.requestCategory) {
            return;
        }
        this.requestPending = true;
        this.requestCategory = category;
        refreshSourceContext(this.source);
        try {
            await sourceFormRequest(this, "schema", { category });
        } catch {
            // Binding owns and renders the declarative source error state.
        } finally {
            this.requestPending = false;
            refreshSourceContext(this.source);
            if (this.category && this.category !== this.requestCategory) {
                this.scheduleSync();
            }
        }
    }

    private updateSelectCategoryCopy(): void {
        this.selectCategoryMessage.textContent =
            this.getAttribute("select-category-label") || "Select a category to see its filters.";
    }

    private get category(): string {
        return this.categoryControl?.value.trim() || "";
    }

    private get categoryControl(): HTMLInputElement | null {
        return this.categoryRoot?.querySelector<HTMLInputElement>('[cms-param-sync="category"]') || null;
    }

    private get categoryRoot(): HTMLElement | null {
        return this.closest<HTMLElement>("mossa-category-filters");
    }

    private get selectCategoryMessage(): HTMLParagraphElement {
        return this.querySelector<HTMLParagraphElement>(".select-category")!;
    }

    private get source(): HTMLFormElement {
        return this.querySelector<HTMLFormElement>('[cms-source-id="schema"]')!;
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", CommerceOfferFilter);
