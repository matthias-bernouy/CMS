import type {
    PageIndexingEditorCandidate,
    PageIndexingEditorModel,
} from "cms-control/core/content/page/pageIndexingEditor";
import "./PageIndexingVariables";
import { editorNotice, pageIndexingSettingsView, selectedCandidate, variableText } from "./view";

type ValueControl = HTMLElement & { value: string };
type SwitchControl = HTMLElement & { checked: boolean };
type VariablesControl = HTMLElement & { value: string };

const EMPTY_MODEL: PageIndexingEditorModel = {
    configured: false,
    suggested: false,
    detectionStatus: "none",
    enabled: true,
    selection: "",
    selectionValid: true,
    availableVariables: [],
    candidates: [],
};

export class PageIndexingSettings extends HTMLElement {
    static observedAttributes = ["value"];

    private model = EMPTY_MODEL;
    private enabled = true;
    private selection = "";
    private dirty = false;
    private toggle: SwitchControl | null = null;

    connectedCallback(): void {
        this.render();
    }

    disconnectedCallback(): void {
        this.toggle?.removeEventListener("change", this.onToggle);
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            this.render();
        }
    }

    private render(): void {
        this.toggle?.removeEventListener("change", this.onToggle);
        this.model = parseModel(this.getAttribute("value"));
        this.enabled = this.model.enabled;
        this.selection = this.model.selection;
        this.dirty = false;
        const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
        root.innerHTML = pageIndexingSettingsView(this.model);

        this.toggle =
            this.closest("cms-detail-section")?.querySelector<SwitchControl>("[data-page-indexing-toggle]") ?? null;
        if (this.toggle) {
            this.toggle.checked = this.enabled;
            this.toggle.addEventListener("change", this.onToggle);
        }
        this.control("[data-candidate]")?.addEventListener("change", (event) => {
            this.selection = (event.currentTarget as ValueControl).value;
            this.dirty = true;
            this.applySuggestedMetadata(selectedCandidate(this.model.candidates, this.selection));
            this.sync();
        });

        if (this.model.suggested) {
            this.applySuggestedMetadata(selectedCandidate(this.model.candidates, this.selection));
        }
        this.sync();
    }

    private onToggle = (): void => {
        this.enabled = this.toggle?.checked ?? false;
        this.dirty = true;
        this.syncVisibility();
        this.syncFields();
    };

    private sync(): void {
        const candidate = selectedCandidate(this.model.candidates, this.selection);
        const variables = this.closest("form")?.querySelector<VariablesControl>("[data-indexing-variables]");
        if (variables) {
            const text = variableText(this.model.availableVariables, candidate);
            variables.value = text;
            variables.hidden = !text;
        }
        const notice = this.shadowRoot?.querySelector<HTMLElement>("[data-notice]");
        if (notice) {
            const text = editorNotice(this.model, this.selection);
            notice.textContent = text;
            notice.hidden = !text;
        }
        this.syncVisibility();
        this.syncFields();
    }

    private syncVisibility(): void {
        this.toggleAttribute("data-disabled", !this.enabled);
    }

    private syncFields(): void {
        const validConfigured = this.model.configured && this.model.selectionValid;
        const submit = validConfigured || this.model.candidates.length === 0 || this.model.suggested || this.dirty;
        this.field("indexingEnabled", String(this.enabled), !submit);
        this.field("indexingCandidate", this.selection, !submit || !this.selection);
    }

    private applySuggestedMetadata(candidate: PageIndexingEditorCandidate | undefined): void {
        const form = this.closest("form");
        if (!form || !candidate) {
            return;
        }
        if (candidate.suggestedTitle) {
            const title = form.querySelector<ValueControl>('p9r-input[name="title"]');
            if (title) {
                title.value = candidate.suggestedTitle;
            }
        }
        if (candidate.suggestedDescription) {
            const description = form.querySelector<ValueControl>('p9r-textarea[name="description"]');
            if (description) {
                description.value = candidate.suggestedDescription;
            }
        }
    }

    private field(name: string, value: string, disabled: boolean): void {
        let input = Array.from(this.children).find(
            (child): child is HTMLInputElement =>
                child instanceof HTMLInputElement && child.dataset.indexingField === name,
        );
        if (!input) {
            input = document.createElement("input");
            input.type = "hidden";
            input.name = name;
            input.dataset.indexingField = name;
            this.append(input);
        }
        input.value = value;
        input.setAttribute("value", value);
        input.disabled = disabled;
    }

    private control(selector: string): ValueControl | null {
        return this.shadowRoot?.querySelector<ValueControl>(selector) ?? null;
    }
}

function parseModel(value: string | null): PageIndexingEditorModel {
    try {
        const parsed = JSON.parse(value ?? "");
        return normalizeModel(parsed);
    } catch {
        try {
            const parsed = JSON.parse(decodeURIComponent(value ?? ""));
            return normalizeModel(parsed);
        } catch {
            return EMPTY_MODEL;
        }
    }
}

function normalizeModel(value: unknown): PageIndexingEditorModel {
    if (!value || typeof value !== "object") {
        return EMPTY_MODEL;
    }
    const model = value as Partial<PageIndexingEditorModel>;
    return {
        ...EMPTY_MODEL,
        ...model,
        availableVariables: Array.isArray(model.availableVariables) ? model.availableVariables : [],
        candidates: Array.isArray(model.candidates) ? model.candidates : [],
    };
}

if (!customElements.get("cms-page-indexing-settings")) {
    customElements.define("cms-page-indexing-settings", PageIndexingSettings);
}
