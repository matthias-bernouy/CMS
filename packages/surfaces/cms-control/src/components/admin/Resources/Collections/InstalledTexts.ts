import type { InstalledCollection } from "@bernouy/cms-repository/collections/installations";
import { collectionRequest } from "./client";
import { languageLabel, renderTextLanguages, renderTextNavigation, textGroup } from "./texts/navigation";
import { renderTextRow, type TextInput } from "./texts/table";
import template from "./texts/template.html" with { type: "text" };
import css from "./texts/style.css" with { type: "text" };

export class InstalledTexts extends HTMLElement {
    private item?: InstalledCollection;
    private revision = 0;
    private generation = 0;
    private ready = false;
    private saving = false;
    private language = "";
    private group = "";
    private readonly dirty = new Set<string>();
    private readonly modified = new Set<string>();
    static get observedAttributes() {
        return ["collection-id"];
    }
    attributeChangedCallback() {
        if (this.ready) {
            this.language = "";
            this.group = "";
            void this.loadSafe();
        }
    }
    disconnectedCallback() {
        this.generation += 1;
    }
    connectedCallback() {
        if (!this.ready) {
            this.ready = true;
            this.innerHTML = `<style>${css}</style>${template}`;
            this.querySelector("[data-language]")!.addEventListener("change", () => {
                const select = this.querySelector<TextInput>("[data-language]")!;
                if (!select.value || this.saving || this.dirty.size) {
                    select.value = this.language;
                    this.status("Save your changes before switching language.");
                    return;
                }
                this.language = select.value;
                this.render();
            });
            this.querySelector("[data-save]")!.addEventListener("click", () => void this.save());
            this.querySelector("[data-view-error]")!.addEventListener("retry", () => void this.loadSafe());
        }
        void this.loadSafe();
    }
    private async loadSafe() {
        this.showState("loading");
        try {
            if (await this.load()) {
                this.showState("ready");
            }
        } catch (error) {
            this.querySelector("[data-view-error-message]")!.textContent =
                error instanceof Error ? error.message : "Collection texts could not be loaded.";
            this.showState("error");
        }
    }
    private async load(): Promise<boolean> {
        const generation = ++this.generation;
        const data = await collectionRequest("installed");
        if (generation !== this.generation || !this.isConnected) {
            return false;
        }
        this.item = data.collections.find(
            (item: InstalledCollection) => item.collectionId === this.getAttribute("collection-id"),
        );
        this.revision = data.revision;
        if (!this.item) {
            throw new Error("Collection not found");
        }
        this.language = renderTextLanguages(
            this.querySelector<TextInput>("[data-language]")!,
            this.item,
            data.languages ?? [],
            this.language,
        );
        this.dirty.clear();
        this.modified.clear();
        this.render();
        return true;
    }
    private render() {
        if (!this.item) {
            return;
        }
        const texts = this.item.release.texts ?? [];
        if (!texts.some((text) => textGroup(text) === this.group)) {
            this.group = texts[0] ? textGroup(texts[0]) : "";
        }
        renderTextNavigation(this.querySelector<HTMLElement>("[data-navigation]")!, texts, this.group, (key) => {
            if (this.saving) {
                return;
            }
            this.capture();
            this.group = key;
            this.render();
        });
        const current = texts.filter((text) => textGroup(text) === this.group);
        this.querySelector("[data-title]")!.textContent = current[0]?.group ?? "Collection texts";
        this.querySelector("[data-default-language]")!.textContent = languageLabel(this.item.release.locale);
        this.querySelector("[data-default-heading]")!.textContent =
            `Default · ${languageLabel(this.item.release.locale)}`;
        this.querySelector("[data-language-heading]")!.textContent = languageLabel(this.language);
        this.querySelector("[data-empty]")!.toggleAttribute("hidden", texts.length > 0);
        this.querySelector("[data-fields]")!.replaceChildren(
            ...current.map((text) =>
                renderTextRow(
                    text,
                    this.item!,
                    this.language,
                    () => {
                        this.dirty.add(text.id);
                        this.modified.add(text.id);
                        this.status("Unsaved changes.");
                    },
                    () => {
                        if (this.saving) {
                            return;
                        }
                        this.capture();
                        delete (this.item!.textOverrides[text.id] as Record<string, unknown> | undefined)?.[
                            this.language
                        ];
                        this.dirty.add(text.id);
                        this.render();
                        this.status("Unsaved changes. Save to restore the collection default.");
                    },
                ),
            ),
        );
    }
    private capture() {
        if (!this.item) {
            return;
        }
        const overrides = this.item.textOverrides as Record<string, Record<string, unknown>>;
        const fields = [...this.querySelectorAll<TextInput>("[data-fields] [data-id]")];
        for (const id of this.modified) {
            const inputs = fields.filter((field) => field.dataset.id === id);
            if (!inputs.length) {
                continue;
            }
            overrides[id] ??= {};
            overrides[id]![this.language] = inputs[0]!.dataset.form
                ? Object.fromEntries(inputs.map((field) => [field.dataset.form, field.value]))
                : inputs[0]!.value;
        }
        this.modified.clear();
    }
    private async save() {
        if (!this.item || this.saving) {
            return;
        }
        this.capture();
        this.saving = true;
        this.querySelectorAll("p9r-button, p9r-textarea, p9r-select").forEach((element) =>
            element.setAttribute("disabled", ""),
        );
        try {
            await collectionRequest(
                "texts",
                { collectionId: this.item.collectionId, revision: this.revision, overrides: this.item.textOverrides },
                "PUT",
            );
            await this.load();
            this.status("Translations saved.");
        } catch (error) {
            this.status(String(error));
        } finally {
            this.saving = false;
            this.querySelectorAll("[disabled]").forEach((element) => element.removeAttribute("disabled"));
        }
    }
    private status(message: string) {
        this.querySelector("[data-status]")!.textContent = message;
    }
    private showState(state: "loading" | "error" | "ready") {
        this.querySelector<HTMLElement>("[data-view-loading]")!.hidden = state !== "loading";
        this.querySelector<HTMLElement>("[data-view-error]")!.hidden = state !== "error";
        this.querySelector<HTMLElement>("[data-view-content]")!.hidden = state !== "ready";
        this.setAttribute("aria-busy", String(state === "loading"));
    }
}
customElements.define("cms-installed-texts", InstalledTexts);
