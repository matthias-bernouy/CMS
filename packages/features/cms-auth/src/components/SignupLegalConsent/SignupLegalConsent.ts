import { SIGNUP_LEGAL_CONSENT_ATTRIBUTES, signupLegalConsentCopy } from "./configuration";
import { applySelectedVersionIds, restoredVersionIds, selectedVersionIds, syncSignupLegalFormValue } from "./form";
import { fetchSignupLegalRequirements } from "./requirements";
import { renderSignupLegalConsent, setNewTabNotices, type SignupLegalConsentViewState } from "./view";

export const CMS_SIGNUP_LEGAL_CONSENT_TAG = "cms-signup-legal-consent";

export class CmsSignupLegalConsent extends HTMLElement {
    static formAssociated = true;
    static observedAttributes = SIGNUP_LEGAL_CONSENT_ATTRIBUTES;

    private readonly internals: ElementInternals;
    private readonly root: ShadowRoot;
    private state: SignupLegalConsentViewState = { kind: "loading" };
    private checkboxes: HTMLInputElement[] = [];
    private request: AbortController | null = null;
    private requestSequence = 0;
    private disabledByForm = false;
    private restoredIds: string[] | null = null;

    constructor() {
        super();
        this.root = this.attachShadow({ mode: "open" });
        this.internals = this.attachInternals();
    }

    connectedCallback(): void {
        this.render();
        void this.load();
    }

    disconnectedCallback(): void {
        this.request?.abort();
        this.request = null;
    }

    attributeChangedCallback(name: string, previous: string | null, current: string | null): void {
        if (!this.isConnected || previous === current) {
            return;
        }
        if (name === "source-id" || name === "source-prefix") {
            void this.load();
            return;
        }
        this.render(this.selectedIds());
    }

    formDisabledCallback(disabled: boolean): void {
        this.disabledByForm = disabled;
        this.syncDisabled();
        this.syncFormValue();
    }

    formResetCallback(): void {
        for (const checkbox of this.checkboxes) {
            checkbox.checked = false;
        }
        this.syncFormValue();
    }

    formStateRestoreCallback(state: string | File | FormData): void {
        const ids = restoredVersionIds(state);
        if (this.state.kind !== "ready") {
            this.restoredIds = ids;
            return;
        }
        this.applySelection(ids);
    }

    private async load(): Promise<void> {
        const sequence = ++this.requestSequence;
        this.request?.abort();
        const request = new AbortController();
        this.request = request;
        this.state = { kind: "loading" };
        this.render();
        try {
            const documents = await fetchSignupLegalRequirements(this, request.signal);
            if (request.signal.aborted || sequence !== this.requestSequence) {
                return;
            }
            this.state = documents.length ? { kind: "ready", documents, selectedIds: new Set() } : { kind: "empty" };
            this.render();
            const restoredIds = this.restoredIds;
            this.restoredIds = null;
            if (restoredIds && this.state.kind === "ready") {
                this.applySelection(restoredIds);
            }
        } catch {
            if (request.signal.aborted || sequence !== this.requestSequence) {
                return;
            }
            this.state = { kind: "error" };
            this.render();
        } finally {
            if (sequence === this.requestSequence) {
                this.request = null;
            }
        }
    }

    private render(selectedIds: ReadonlySet<string> = new Set()): void {
        if (this.state.kind === "ready") {
            this.state = { ...this.state, selectedIds };
        }
        this.dataset.state = this.state.kind;
        const copy = signupLegalConsentCopy(this);
        this.checkboxes = renderSignupLegalConsent(this.root, this.state, copy, {
            change: () => this.syncFormValue(),
            retry: () => void this.load(),
        });
        setNewTabNotices(this.root, copy.newTabLabel);
        this.syncDisabled();
        this.syncFormValue();
    }

    private syncFormValue(): void {
        const copy = signupLegalConsentCopy(this);
        syncSignupLegalFormValue({
            internals: this.internals,
            state: this.state,
            checkboxes: this.checkboxes,
            disabled: this.isDisabled(),
            loadingMessage: copy.loadingLabel,
            errorMessage: copy.loadErrorLabel,
            requiredMessage: copy.requiredMessage,
        });
    }

    private applySelection(ids: readonly string[]): void {
        applySelectedVersionIds(this.checkboxes, ids);
        this.syncFormValue();
    }

    private selectedIds(): Set<string> {
        return selectedVersionIds(this.checkboxes);
    }

    private syncDisabled(): void {
        const disabled = this.isDisabled();
        for (const checkbox of this.checkboxes) {
            checkbox.disabled = disabled;
        }
        this.root.querySelector<HTMLButtonElement>("button")?.toggleAttribute("disabled", disabled);
    }

    private isDisabled(): boolean {
        return this.disabledByForm || this.hasAttribute("disabled");
    }
}
