import template from "../template.html" with { type: "text" };
import css from "../styles";
import { fetchRepositoryCompatibility, fetchRepositoryVersions } from "../api";
import type { RepositoryCompatibilityPageView, RepositoryVersionSelection } from "../contracts/types";
import { field } from "../forms/fields";
import { renderRepositoryCompatibility } from "../render/compatibility";
import { clearFeedback, showFeedback } from "../render/feedback";
import { renderRepositoryVersions } from "../render/versions";
import {
    submitRepositoryPackage,
    submitRepositoryPromotion,
    submitRepositoryReevaluation,
    type RepositoryActionContext,
} from "./actions";
import { renderRepositoryFailure } from "./failure";
import { reloadRepositoryOverview } from "./overview";
import { renderRepositorySelection } from "./selection";

export class RepositoryAdmin extends HTMLElement {
    private initialized = false;
    private request: AbortController | undefined;
    private selected: RepositoryVersionSelection | undefined;
    private compatibility: RepositoryCompatibilityPageView | undefined;

    connectedCallback(): void {
        if (!this.initialized) {
            this.mount();
            this.bind();
            this.initialized = true;
        }
        this.request?.abort();
        this.request = new AbortController();
        void reloadRepositoryOverview(this, this.signal());
    }

    disconnectedCallback(): void {
        this.request?.abort();
        this.request = undefined;
    }

    private mount(): void {
        const style = document.createElement("style");
        style.textContent = css as unknown as string;
        const body = document.createElement("template");
        body.innerHTML = template as unknown as string;
        this.replaceChildren(style, body.content.cloneNode(true));
    }

    private bind(): void {
        this.query<HTMLButtonElement>("[data-refresh]").addEventListener("click", () => {
            void reloadRepositoryOverview(this, this.signal());
        });
        this.query<HTMLFormElement>("[data-versions-form]").addEventListener("submit", (event) => {
            event.preventDefault();
            const form = event.currentTarget as HTMLFormElement;
            void this.loadKind(field(form, "kind").value.trim());
        });
        this.bindAction("[data-upload-form]", "[data-upload-feedback]", submitRepositoryPackage);
        this.bindAction("[data-reevaluation-form]", "[data-reevaluation-feedback]", submitRepositoryReevaluation);
        this.bindAction("[data-promotion-form]", "[data-promotion-feedback]", submitRepositoryPromotion);
        this.query<HTMLButtonElement>("[data-load-more]").addEventListener("click", () => void this.loadMore());
    }

    private bindAction(
        formSelector: string,
        feedbackSelector: string,
        action: (form: HTMLFormElement, feedback: HTMLElement, context: RepositoryActionContext) => Promise<void>,
    ): void {
        this.query<HTMLFormElement>(formSelector).addEventListener("submit", (event) => {
            event.preventDefault();
            if (!this.request) {
                return;
            }
            void action(event.currentTarget as HTMLFormElement, this.query(feedbackSelector), this.actionContext());
        });
    }

    private actionContext(): RepositoryActionContext {
        return {
            signal: this.signal(),
            selection: () => this.selected,
            updateSelection: (selection) => this.setSelection(selection),
            reloadKind: (kind) => this.loadKind(kind),
            reloadCompatibility: () => this.reloadCompatibility(),
        };
    }

    private async loadKind(kind: string): Promise<void> {
        const feedback = this.query<HTMLElement>("[data-versions-feedback]");
        clearFeedback(feedback);
        if (!kind) {
            showFeedback(feedback, "Enter an integration kind.");
            return;
        }
        try {
            const versions = await fetchRepositoryVersions(kind, this.signal());
            renderRepositoryVersions(
                this.query("[data-versions]"),
                versions,
                (version) => void this.selectVersion(versions.kind, version),
            );
            showFeedback(feedback, `Loaded ${versions.versions.length} version(s) for ${versions.kind}.`, "success");
        } catch (error) {
            renderRepositoryFailure(feedback, error);
        }
    }

    private async selectVersion(kind: string, version: string): Promise<void> {
        const feedback = this.query<HTMLElement>("[data-compatibility-feedback]");
        clearFeedback(feedback);
        this.query<HTMLElement>("[data-compatibility-panel]").hidden = false;
        try {
            this.compatibility = await fetchRepositoryCompatibility(kind, version, undefined, this.signal());
            this.setSelection({ kind, version, currentReportRevisionId: this.compatibility.current.id });
            this.renderCompatibility();
        } catch (error) {
            renderRepositoryFailure(feedback, error);
        }
    }

    private async reloadCompatibility(): Promise<void> {
        if (this.selected) {
            await this.selectVersion(this.selected.kind, this.selected.version);
        }
    }

    private async loadMore(): Promise<void> {
        if (!this.selected || !this.compatibility?.nextCursor) {
            return;
        }
        const feedback = this.query<HTMLElement>("[data-compatibility-feedback]");
        clearFeedback(feedback);
        try {
            const page = await fetchRepositoryCompatibility(
                this.selected.kind,
                this.selected.version,
                this.compatibility.nextCursor,
                this.signal(),
            );
            this.compatibility = { ...page, revisions: [...this.compatibility.revisions, ...page.revisions] };
            this.renderCompatibility();
        } catch (error) {
            renderRepositoryFailure(feedback, error);
        }
    }

    private renderCompatibility(): void {
        if (!this.compatibility) {
            return;
        }
        renderRepositoryCompatibility(this.query("[data-compatibility]"), this.compatibility);
        this.query<HTMLButtonElement>("[data-load-more]").hidden = !this.compatibility.nextCursor;
    }

    private setSelection(selection: RepositoryVersionSelection): void {
        this.selected = selection;
        renderRepositorySelection(this, selection);
    }

    private signal(): AbortSignal {
        if (!this.request) {
            throw new DOMException("Repository console is disconnected", "AbortError");
        }
        return this.request.signal;
    }

    private query<T extends Element = HTMLElement>(selector: string): T {
        const node = this.querySelector<T>(selector);
        if (!node) {
            throw new Error(`Missing repository console element ${selector}`);
        }
        return node;
    }
}

if (!customElements.get("cms-repository-admin")) {
    customElements.define("cms-repository-admin", RepositoryAdmin);
}
