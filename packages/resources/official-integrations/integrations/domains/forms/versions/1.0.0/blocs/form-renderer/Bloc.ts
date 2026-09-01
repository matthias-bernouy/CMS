import { answersFrom, formsRoot, renderStep, sourceBase } from "./renderer";
import { parsePublishedForm } from "./definition";
import { restaurantPreview } from "./preview";
import { clearFormDrafts, readDraft, writeDraft } from "./state";

export class FormsRenderer extends HTMLElement {
    static observedAttributes = ["access", "form-key", "source-id", "source-prefix", "version"];
    /** @type {import("./definition").PublishedForm | undefined} */
    published;
    /** @type {import("./state").DraftState | undefined} */
    draft;
    /** @type {AbortController | undefined} */
    request;

    connectedCallback() {
        this.load();
    }

    disconnectedCallback() {
        this.request?.abort();
    }

    attributeChangedCallback() {
        if (this.isConnected) {
            this.load();
        }
    }

    async load() {
        this.request?.abort();
        const key = this.getAttribute("form-key")?.trim();
        if (!key) {
            this.open(restaurantPreview);
            return;
        }
        this.showStatus("Loading form…");
        this.request = new AbortController();
        try {
            const endpoint = this.getAttribute("access") === "authenticated" ? "formAuthenticated" : "formPublic";
            const params = new URLSearchParams({ key });
            const version = this.getAttribute("version")?.trim();
            if (version) {
                params.set("version", version);
            }
            const response = await fetch(`${sourceBase(this)}/${endpoint}?${params}`, { signal: this.request.signal });
            if (!response.ok) {
                throw new Error(
                    response.status === 404 ? "This form is not available." : "The form could not be loaded.",
                );
            }
            this.open(parsePublishedForm(await response.json()));
        } catch (error) {
            if (!(error instanceof Error) || error.name !== "AbortError") {
                this.showStatus(error instanceof Error ? error.message : "The form could not be loaded.", true);
            }
        }
    }

    /** @param {import("./definition").PublishedForm} published */
    open(published) {
        this.published = published;
        this.draft = readDraft(this.storageKey(published));
        this.render();
    }

    render() {
        if (!this.published || !this.draft) {
            return;
        }
        const root = formsRoot(this);
        const maximum = this.published.definition.steps.length - 1;
        this.draft.step = Math.min(Math.max(this.draft.step, 0), maximum);
        renderStep(root, this.published.definition, this.draft.step, this.draft.answers, {
            back: () => {
                if (this.draft) {
                    this.draft.step -= 1;
                    this.persistDraft();
                    this.render();
                }
            },
            submit: (form) => this.advance(form),
        });
    }

    /** @param {HTMLFormElement} form */
    async advance(form) {
        if (!this.published || !this.draft || !form.reportValidity()) {
            return;
        }
        this.draft.answers = { ...this.draft.answers, ...answersFrom(form) };
        const website = String(new FormData(form).get("website") ?? "");
        if (this.draft.step + 1 < this.published.definition.steps.length) {
            this.draft.step += 1;
            this.persistDraft();
            this.render();
            return;
        }
        this.persistDraft();
        await this.submit(website);
    }

    /** @param {string} website */
    async submit(website) {
        if (!this.published || !this.draft) {
            return;
        }
        this.showStatus("Sending your answers…");
        const endpoint = this.getAttribute("access") === "authenticated" ? "submitAuthenticated" : "submitPublic";
        try {
            const response = await fetch(
                `${sourceBase(this)}/${endpoint}?key=${encodeURIComponent(this.published.key)}`,
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        answers: this.draft.answers,
                        idempotencyKey: this.draft.idempotencyKey,
                        sessionId: this.draft.sessionId,
                        startedAt: this.draft.startedAt,
                        version: this.published.version,
                        website,
                    }),
                },
            );
            if (!response.ok) {
                const body = await response.json().catch(() => ({}));
                throw new Error(typeof body.error === "string" ? body.error : "Your answers could not be sent.");
            }
            clearFormDrafts(this.sourceId(), this.published);
            this.showSuccess();
            this.dispatchEvent(new CustomEvent("forms:submitted", { bubbles: true, detail: await response.json() }));
        } catch (error) {
            this.showStatus(error instanceof Error ? error.message : "Your answers could not be sent.", true, true);
        }
    }

    /** @param {import("./definition").PublishedForm} form */
    storageKey(form) {
        return `cms.forms:${this.sourceId()}:${form.key}:${form.version}`;
    }

    sourceId() {
        return this.getAttribute("source-id") || "forms";
    }

    persistDraft() {
        if (!this.published || !this.draft) {
            return;
        }
        writeDraft(this.storageKey(this.published), this.draft);
    }

    /** @param {string} message */
    showStatus(message, error = false, retry = false) {
        const status = document.createElement("div");
        status.className = error ? "forms-status is-error" : "forms-status";
        status.setAttribute("role", error ? "alert" : "status");
        const text = document.createElement("p");
        text.textContent = message;
        status.append(text);
        if (retry) {
            const button = document.createElement("button");
            button.type = "button";
            button.textContent = "Try again";
            button.addEventListener("click", () => this.submit(""));
            status.append(button);
        }
        formsRoot(this).replaceChildren(status);
    }

    showSuccess() {
        const success = document.createElement("section");
        success.className = "forms-success";
        const mark = document.createElement("span");
        mark.textContent = "✓";
        const title = document.createElement("h2");
        title.textContent = "Thank you";
        const message = document.createElement("p");
        message.textContent = this.published?.definition.successMessage || "Your answers have been received.";
        success.append(mark, title, message);
        formsRoot(this).replaceChildren(success);
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", FormsRenderer);
