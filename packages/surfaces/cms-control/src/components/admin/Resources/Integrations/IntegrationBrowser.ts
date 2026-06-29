import { Component } from "@bernouy/components/base";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };
import { fetchDefinitions, fetchInstances, importIntegration } from "./api";
import { artifactSummary, categories, defaultInstance, installedCounts, mark, matches } from "./domain";
import { collectAnswers } from "./fields";
import { LAST_SETUP_STEP, renderSetup, showSetupStep } from "./setup";
import type { IntegrationDefinition, IntegrationImportPayload, IntegrationInstanceRow } from "./model";

export class IntegrationBrowser extends Component {
    private definitions: IntegrationDefinition[] = [];
    private instances: IntegrationInstanceRow[] = [];
    private activeDefinition: IntegrationDefinition | null = null;
    private setupStep = 0;

    constructor() { super({ css: css as unknown as string, template: template as unknown as string }); }

    override connectedCallback(): void {
        super.connectedCallback();
        this.bind();
        void this.load();
    }

    private async load(): Promise<void> {
        [this.definitions, this.instances] = await Promise.all([fetchDefinitions(), fetchInstances()]);
        this.renderCategories();
        this.renderInstances();
        this.renderCatalogue();
    }

    private bind(): void {
        this.query<HTMLInputElement>("[data-search]").addEventListener("input", () => this.renderCatalogue());
        this.query<HTMLSelectElement>("[data-category]").addEventListener("change", () => this.renderCatalogue());
        this.query("[data-close]").addEventListener("click", () => this.closeSetup());
        this.query("[data-back]").addEventListener("click", () => this.moveSetup(-1));
        this.query("[data-next]").addEventListener("click", () => this.moveSetup(1));
        this.query("[data-import]").addEventListener("click", () => void this.importActive());
        document.querySelector("[data-integrations-manual-open]")?.addEventListener("click", () => this.query<HTMLDialogElement>("[data-manual]").showModal());
        this.query("[data-manual-close]").addEventListener("click", () => this.query<HTMLDialogElement>("[data-manual]").close());
        this.query("[data-manual-submit]").addEventListener("click", () => void this.importManual());
    }

    private renderCategories(): void {
        const select = this.query<HTMLSelectElement>("[data-category]");
        select.replaceChildren(new Option("All categories", ""));
        for (const category of categories(this.definitions)) {
            select.append(new Option(category, category));
        }
    }

    private renderInstances(): void {
        const root = this.query<HTMLElement>("[data-instances]");
        const empty = this.query<HTMLElement>("[data-instances-empty]");
        const template = this.query<HTMLTemplateElement>("[data-instance-template]");
        root.replaceChildren();
        empty.hidden = this.instances.length > 0;
        for (const instance of this.instances) root.append(this.instanceCard(template, instance));
    }

    private instanceCard(template: HTMLTemplateElement, instance: IntegrationInstanceRow): HTMLElement {
        const card = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
        this.fill(card, "[data-label]", instance.label);
        this.fill(card, "[data-id]", instance.id);
        this.fill(card, "[data-status]", instance.status);
        this.fill(card, "[data-artifacts]", String(instance.artifactCount));
        this.fill(card, "[data-runs]", String(instance.runCount));
        return card;
    }

    private renderCatalogue(): void {
        const root = this.query<HTMLElement>("[data-catalogue]");
        const empty = this.query<HTMLElement>("[data-catalogue-empty]");
        const template = this.query<HTMLTemplateElement>("[data-card-template]");
        const query = this.query<HTMLInputElement>("[data-search]").value.trim();
        const category = this.query<HTMLSelectElement>("[data-category]").value;
        const counts = installedCounts(this.instances);
        const visible = this.definitions.filter(definition => matches(definition, query, category));
        root.replaceChildren();
        empty.hidden = visible.length > 0;
        for (const definition of visible) root.append(this.definitionCard(template, definition, counts.get(definition.kind) ?? 0));
    }

    private definitionCard(template: HTMLTemplateElement, definition: IntegrationDefinition, count: number): HTMLElement {
        const card = template.content.firstElementChild!.cloneNode(true) as HTMLElement;
        this.fill(card, "[data-mark]", mark(definition));
        this.fill(card, "[data-label]", definition.label);
        this.fill(card, "[data-description]", definition.description ?? "");
        this.fill(card, "[data-kind]", definition.kind);
        this.fill(card, "[data-artifacts]", artifactSummary(definition));
        this.fill(card, "[data-installed]", String(count));
        card.classList.toggle("is-installed", count > 0);
        const button = card.querySelector<HTMLButtonElement>("[data-open]")!;
        button.textContent = count > 0 ? "Installed" : "Configure";
        button.disabled = count > 0;
        if (count === 0) button.addEventListener("click", () => this.openSetup(definition));
        return card;
    }

    private openSetup(definition: IntegrationDefinition): void {
        this.activeDefinition = definition;
        this.fill(this.shadowRoot!, "[data-setup-mark]", mark(definition));
        this.fill(this.shadowRoot!, "[data-setup-title]", definition.label);
        this.fill(this.shadowRoot!, "[data-setup-description]", definition.description ?? "");
        renderSetup(this.shadowRoot!, definition);
        this.setupStep = 0;
        showSetupStep(this.shadowRoot!, this.setupStep);
        this.query<HTMLDialogElement>("[data-setup]").showModal();
    }

    private async importActive(): Promise<void> {
        if (!this.activeDefinition) return;
        const fields = this.query<HTMLElement>("[data-fields]");
        const answers = collectAnswers(fields, this.activeDefinition);
        await importIntegration({
            kind: this.activeDefinition.kind,
            answers,
            instance: defaultInstance(this.activeDefinition, answers),
        });
        this.closeSetup();
        await this.load();
    }

    private async importManual(): Promise<void> {
        const textarea = this.query<HTMLTextAreaElement>("[data-manual-json]");
        await importIntegration(JSON.parse(textarea.value) as IntegrationImportPayload);
        this.query<HTMLDialogElement>("[data-manual]").close();
        await this.load();
    }

    private closeSetup(): void {
        this.query<HTMLDialogElement>("[data-setup]").close();
    }

    private moveSetup(delta: number): void {
        this.setupStep = Math.max(0, Math.min(LAST_SETUP_STEP, this.setupStep + delta));
        showSetupStep(this.shadowRoot!, this.setupStep);
    }

    private fill(root: ParentNode, selector: string, value: string): void {
        (root.querySelector(selector) as HTMLElement).textContent = value;
    }

    private query<T extends Element>(selector: string): T {
        return this.shadowRoot!.querySelector(selector) as T;
    }
}

if (!customElements.get("cms-integrations-admin")) customElements.define("cms-integrations-admin", IntegrationBrowser);
