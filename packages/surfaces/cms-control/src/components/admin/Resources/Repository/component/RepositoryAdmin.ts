import template from "../template.html" with { type: "text" };
import css from "../styles";
import {
    fetchRepositoryCandidateReport,
    fetchRepositoryCandidateStatus,
    fetchRepositoryCompatibility,
    fetchRepositoryRelease,
    fetchRepositoryVersions,
    RepositoryApiError,
} from "../api";
import type { RepositoryCandidateView } from "../contracts/candidates";
import type { RepositoryReleaseView } from "../contracts/release/types";
import type {
    RepositoryCompatibilityPageView,
    RepositoryVersionsView,
    RepositoryVersionSelection,
} from "../contracts/types";
import { field } from "../forms/fields";
import { renderRepositoryCompatibility } from "../render/compatibility";
import { renderRepositoryCandidateReport } from "../render/candidateReport";
import { clearFeedback, showFeedback } from "../render/feedback";
import { renderRepositoryVersions } from "../render/versions";
import { renderRepositoryRelease } from "../render/release";
import {
    submitRepositoryCandidate,
    submitRepositoryPromotion,
    submitRepositoryReevaluation,
    submitRepositoryVersionBlock,
    type RepositoryActionContext,
} from "./actions";
import {
    forgetRepositoryCandidate,
    monitorRepositoryCandidate,
    rememberedRepositoryCandidate,
} from "./candidateMonitor";
import { renderRepositoryFailure } from "./failure";
import { reloadRepositoryOverview } from "./overview";
import { renderRepositorySelection } from "./selection";

export class RepositoryAdmin extends HTMLElement {
    private initialized = false;
    private request: AbortController | undefined;
    private selected: RepositoryVersionSelection | undefined;
    private compatibility: RepositoryCompatibilityPageView | undefined;
    private release: RepositoryReleaseView | undefined;
    private versions: RepositoryVersionsView | undefined;

    connectedCallback(): void {
        if (!this.initialized) {
            this.mount();
            this.bind();
            this.initialized = true;
        }
        this.request?.abort();
        this.request = new AbortController();
        void reloadRepositoryOverview(this, this.signal());
        void this.resumeCandidateMonitoring();
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
        this.bindAction("[data-candidate-form]", "[data-candidate-feedback]", submitRepositoryCandidate);
        this.bindAction("[data-reevaluation-form]", "[data-reevaluation-feedback]", submitRepositoryReevaluation);
        this.bindAction("[data-promotion-form]", "[data-promotion-feedback]", submitRepositoryPromotion);
        this.bindAction("[data-block-form]", "[data-block-feedback]", submitRepositoryVersionBlock);
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
            monitorCandidate: (candidate) => {
                void this.monitorCandidate(candidate).catch((error) => {
                    if (!isAbortError(error)) {
                        renderRepositoryFailure(this.query("[data-candidate-progress]"), error);
                    }
                });
            },
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
            this.versions = versions;
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
            [this.compatibility, this.release] = await Promise.all([
                fetchRepositoryCompatibility(kind, version, undefined, this.signal()),
                fetchRepositoryRelease(kind, version, this.signal()),
            ]);
            const summary =
                this.versions?.kind === kind
                    ? this.versions.versions.find((entry) => entry.version === version)
                    : undefined;
            this.setSelection({
                kind,
                version,
                currentReport: {
                    revisionId: this.compatibility.currentRevisionId,
                    reportDigest: this.compatibility.currentReportDigest,
                },
                status: this.release.status,
                ...(this.release.decision
                    ? {
                          decision: {
                              revisionId: this.release.decision.decisionId,
                              digest: this.release.decision.decisionDigest,
                              admissible: this.release.decision.admissible,
                          },
                      }
                    : {}),
                ...(summary?.blockPreview ? { blockPreview: summary.blockPreview } : {}),
            });
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
        if (this.release) {
            renderRepositoryRelease(this.query("[data-release]"), this.release);
        }
        this.query<HTMLButtonElement>("[data-load-more]").hidden = !this.compatibility.nextCursor;
    }

    private setSelection(selection: RepositoryVersionSelection): void {
        this.selected = selection;
        renderRepositorySelection(this, selection);
    }

    private async monitorCandidate(initial: RepositoryCandidateView): Promise<void> {
        const feedback = this.query<HTMLElement>("[data-candidate-progress]");
        const reportTarget = this.query<HTMLElement>("[data-candidate-report]");
        reportTarget.replaceChildren();
        const candidate = await monitorRepositoryCandidate(initial, {
            signal: this.signal(),
            fetchStatus: fetchRepositoryCandidateStatus,
            fetchReport: fetchRepositoryCandidateReport,
            onCandidate: (current) => {
                showFeedback(
                    feedback,
                    `${current.kind}@${current.version}: ${current.status}, attempt ${current.attemptCount}.`,
                );
            },
            onReport: (report) => renderRepositoryCandidateReport(reportTarget, report),
            onRetry: (current, retryInMs) => {
                showFeedback(
                    feedback,
                    `${current.kind}@${current.version}: repository temporarily unavailable; retrying in ${Math.ceil(retryInMs / 1_000)}s.`,
                );
            },
        });
        const successful = candidate.status === "published";
        showFeedback(
            feedback,
            successful
                ? `${candidate.kind}@${candidate.version} is published and eligible according to its composite decision.`
                : `${candidate.kind}@${candidate.version} stopped at ${candidate.status}${candidate.failureCode ? ` (${candidate.failureCode})` : ""}.`,
            successful ? "success" : "error",
        );
        if (successful) {
            await this.loadKind(candidate.kind);
        }
    }

    private async resumeCandidateMonitoring(): Promise<void> {
        const candidateId = rememberedRepositoryCandidate();
        if (!candidateId) {
            return;
        }
        try {
            await this.monitorCandidate(await fetchRepositoryCandidateStatus(candidateId, this.signal()));
        } catch (error) {
            if (isAbortError(error)) {
                return;
            }
            if (error instanceof RepositoryApiError && (error.status === 404 || error.status === 410)) {
                forgetRepositoryCandidate(candidateId);
            }
            renderRepositoryFailure(this.query("[data-candidate-progress]"), error);
        }
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

function isAbortError(error: unknown): boolean {
    return typeof error === "object" && error !== null && "name" in error && error.name === "AbortError";
}

if (!customElements.get("cms-repository-admin")) {
    customElements.define("cms-repository-admin", RepositoryAdmin);
}
