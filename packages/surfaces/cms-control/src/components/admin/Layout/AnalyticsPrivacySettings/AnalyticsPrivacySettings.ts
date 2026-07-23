import type { AnalyticsComplianceCriterion, AnalyticsManualAttestation } from "@bernouy/cms-analytics";
import {
    loadAnalyticsGovernance,
    saveAnalyticsSettings,
    saveComplianceSnapshot,
    type AnalyticsComplianceView,
} from "./api";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class CmsAnalyticsPrivacySettings extends HTMLElement {
    private request: AbortController | null = null;

    connectedCallback(): void {
        if (!this.hasChildNodes()) {
            this.innerHTML = `<style>${css as unknown as string}</style>${template as unknown as string}`;
            this.query("[data-retry]").addEventListener("click", () => void this.load());
            this.query<HTMLFormElement>("[data-settings-form]").addEventListener(
                "submit",
                (event) => void this.saveSettings(event),
            );
            this.query<HTMLFormElement>("[data-snapshot-form]").addEventListener(
                "submit",
                (event) => void this.saveSnapshot(event),
            );
        }
        void this.load();
    }

    disconnectedCallback(): void {
        this.request?.abort();
    }

    private async load(): Promise<void> {
        this.request?.abort();
        this.request = new AbortController();
        this.show("loading");
        try {
            const [settings, compliance] = await loadAnalyticsGovernance(this.request.signal);
            const form = this.query<HTMLFormElement>("[data-settings-form]");
            setChecked(form, "enabled", settings.enabled);
            setChecked(form, "visitorEstimation", settings.visitorEstimation);
            setValue(form, "rollupRetentionDays", String(settings.rollupRetentionDays));
            setValue(form, "privacyNoticeUrl", settings.privacyNoticeUrl);
            this.renderCompliance(compliance);
            this.show("ready");
        } catch (error) {
            if ((error as { name?: string }).name !== "AbortError") {
                this.query("[data-error-message]").textContent =
                    error instanceof Error ? error.message : "Unknown error";
                this.show("error");
            }
        }
    }

    private async saveSettings(event: SubmitEvent): Promise<void> {
        event.preventDefault();
        const form = event.currentTarget as HTMLFormElement;
        const data = new FormData(form);
        const message = this.query("[data-settings-message]");
        try {
            await saveAnalyticsSettings({
                enabled: data.has("enabled"),
                visitorEstimation: data.has("visitorEstimation"),
                rollupRetentionDays: Number(data.get("rollupRetentionDays")),
                privacyNoticeUrl: String(data.get("privacyNoticeUrl") ?? ""),
            });
            message.textContent = "Analytics settings saved.";
            await this.load();
        } catch (error) {
            message.textContent = error instanceof Error ? error.message : "Settings could not be saved.";
        }
    }

    private async saveSnapshot(event: SubmitEvent): Promise<void> {
        event.preventDefault();
        const submitter = event.submitter as HTMLButtonElement | null;
        const form = event.currentTarget as HTMLFormElement;
        const attestations: Record<string, AnalyticsManualAttestation> = {};
        for (const row of Array.from(form.querySelectorAll<HTMLElement>("[data-manual-id]"))) {
            const id = row.dataset.manualId!;
            const status = row.querySelector<HTMLSelectElement>("select")!
                .value as AnalyticsManualAttestation["status"];
            const evidence = row.querySelector<HTMLInputElement>("input")!.value;
            if (evidence.trim()) {
                attestations[id] = { status, evidence };
            }
        }
        const message = this.query("[data-snapshot-message]");
        try {
            await saveComplianceSnapshot(attestations, submitter?.value === "true");
            message.textContent =
                submitter?.value === "true" ? "Self-assessment published." : "Private snapshot saved.";
            await this.load();
        } catch (error) {
            message.textContent = error instanceof Error ? error.message : "Snapshot could not be saved.";
        }
    }

    private renderCompliance(view: AnalyticsComplianceView): void {
        this.query("[data-readiness-title]").textContent = view.evaluation.releaseReady
            ? "Release checks passed"
            : "Review required";
        this.query("[data-disclaimer]").textContent = view.disclaimer;
        const automatic = view.evaluation.criteria.filter((criterion) => criterion.mode === "automatic");
        const manual = view.evaluation.criteria.filter((criterion) => criterion.mode === "manual");
        this.renderCriteria(automatic);
        this.renderManual(manual);
        const snapshot = view.latestPublished;
        this.query("[data-snapshot]").innerHTML = snapshot
            ? `<dt>Published</dt><dd>${escapeText(new Date(snapshot.publishedAt).toLocaleString())}</dd>
               <dt>Current</dt><dd>${snapshot.stale ? "No — settings changed" : "Yes"}</dd>
               ${reportingRows(view)}`
            : `<dt>Published</dt><dd>No public snapshot</dd>${reportingRows(view)}`;
    }

    private renderCriteria(criteria: AnalyticsComplianceCriterion[]): void {
        this.query("[data-automatic-criteria]").innerHTML = criteria
            .map(
                (item) =>
                    `<li class="criterion"><strong>${escapeText(item.label)}</strong><span>${escapeText(item.status)} · ${escapeText(item.evidence)}</span></li>`,
            )
            .join("");
    }

    private renderManual(criteria: AnalyticsComplianceCriterion[]): void {
        this.query("[data-manual-criteria]").innerHTML = criteria
            .map(
                (item) => `<label class="manual-row" data-manual-id="${escapeText(item.id)}">
                    <strong>${escapeText(item.label)}</strong>
                    <select aria-label="${escapeText(item.label)} status">
                        <option value="pass"${selected(item.status, "pass")}>Pass</option>
                        <option value="fail"${selected(item.status, "fail")}>Fail</option>
                        <option value="not-applicable"${selected(item.status, "not-applicable")}>Not applicable</option>
                    </select>
                    <input required maxlength="2000" value="${escapeText(item.status === "manual-review" ? "" : item.evidence)}" placeholder="Evidence or decision reference">
                </label>`,
            )
            .join("");
    }

    private show(state: "loading" | "error" | "ready"): void {
        for (const element of Array.from(this.querySelectorAll<HTMLElement>("[data-state]"))) {
            element.hidden = element.dataset.state !== state;
        }
    }

    private query<T extends HTMLElement = HTMLElement>(selector: string): T {
        const element = this.querySelector<T>(selector);
        if (!element) {
            throw new Error(`Missing analytics settings element: ${selector}`);
        }
        return element;
    }
}

customElements.define("cms-analytics-privacy-settings", CmsAnalyticsPrivacySettings);

function setChecked(form: HTMLFormElement, name: string, value: boolean): void {
    (form.elements.namedItem(name) as HTMLInputElement).checked = value;
}

function setValue(form: HTMLFormElement, name: string, value: string): void {
    (form.elements.namedItem(name) as HTMLInputElement).value = value;
}

function escapeText(value: string): string {
    return value.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);
}

function selected(current: string, value: string): string {
    return current === value ? " selected" : "";
}

function reportingRows(view: AnalyticsComplianceView): string {
    return `<dt>Last closed bucket</dt><dd>${escapeText(new Date(view.reporting.lastClosedBucket).toLocaleString())}</dd>
        <dt>Referrer capacity</dt><dd>${view.reporting.referrerSaturated ? "Saturated — remainder grouped" : "Not saturated"}</dd>
        <dt>Filter</dt><dd>${escapeText(view.reporting.versions.filter)}</dd>`;
}
