import { applySeoDefaults, createLanguagesForm, hasChanges, updateCurrentUrls } from "./PageLanguagesView";
import type { PathsDetail, SeoDetail } from "./languageRows";
import { saveLanguages } from "./saveLanguages";
import css from "./style.css" with { type: "text" };
import layoutCss from "./layout.css" with { type: "text" };

const styles = `${css as unknown as string}\n${layoutCss as unknown as string}`;

/** Edits all language URLs and search copy without replacing the bound page detail. */
export class PageLanguages extends HTMLElement {
    private paths: PathsDetail | null = null;
    private seo: SeoDetail | null = null;
    private pendingDefaults: { id: string; title: string; description: string } | null = null;
    private savingVersion: number | null = null;
    private requestVersion = 0;
    private modal: HTMLElement | null = null;
    private readonly reloadOnOpen = (): void => this.refresh();

    static get observedAttributes(): string[] {
        return ["page-id", "base-path"];
    }

    connectedCallback(): void {
        this.modal = this.closest("p9r-modal");
        this.modal?.addEventListener("open", this.reloadOnOpen);
        this.refresh();
    }

    disconnectedCallback(): void {
        this.modal?.removeEventListener("open", this.reloadOnOpen);
        this.modal = null;
        this.requestVersion += 1;
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            this.refresh();
        }
    }

    updateDefaults(title: string, description: string): void {
        this.pendingDefaults = { id: this.getAttribute("page-id") ?? "", title, description };
        if (!this.seo) {
            return;
        }
        applySeoDefaults(this, this.seo, title, description);
    }

    private refresh(): void {
        const id = this.getAttribute("page-id")?.trim();
        const basePath = this.getAttribute("base-path") ?? "";
        const version = ++this.requestVersion;
        this.paths = null;
        this.seo = null;
        this.innerHTML = `<style>${styles}</style><p class="page-languages-loading">Loading page languages…</p>`;
        if (id && !id.includes("{{") && !basePath.includes("{{")) {
            void this.load(id, basePath, version);
        }
    }

    private async load(id: string, basePath: string, version: number): Promise<void> {
        try {
            const [pathsResponse, seoResponse] = await Promise.all([
                fetch(`${basePath}/api/page/paths?id=${encodeURIComponent(id)}`),
                fetch(`${basePath}/api/page/seo?id=${encodeURIComponent(id)}`),
            ]);
            if (!pathsResponse.ok || !seoResponse.ok) {
                throw new Error("Could not load page languages.");
            }
            const [paths, seo] = await Promise.all([
                pathsResponse.json() as Promise<PathsDetail>,
                seoResponse.json() as Promise<SeoDetail>,
            ]);
            if (!this.isConnected || version !== this.requestVersion) {
                return;
            }
            if (this.pendingDefaults?.id === id) {
                seo.defaults = { title: this.pendingDefaults.title, description: this.pendingDefaults.description };
            }
            this.paths = paths;
            this.seo = seo;
            this.render();
        } catch (error) {
            if (this.isConnected && version === this.requestVersion) {
                this.showError(error instanceof Error ? error.message : "Could not load page languages.");
            }
        }
    }

    private render(saved = false): void {
        if (!this.paths || !this.seo) {
            return;
        }
        const expanded = new Set(
            Array.from(this.querySelectorAll<HTMLElement>(".page-language-seo-row:not([hidden])"))
                .map((row) => row.dataset.language!)
                .filter(Boolean),
        );
        this.innerHTML = `<style>${styles}</style>`;
        const { form, message, save } = createLanguagesForm(this.paths, this.seo, expanded, saved);
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            void this.save(form, message, save);
        });
        this.append(form);
    }

    private async save(form: HTMLFormElement, message: HTMLElement, save: HTMLElement): Promise<void> {
        if (!this.paths || !this.seo || this.savingVersion === this.requestVersion || save.hasAttribute("disabled")) {
            return;
        }
        const version = this.requestVersion;
        const pageId = this.paths.id;
        let pathsSaved = false;
        const basePath = this.getAttribute("base-path") ?? "";
        this.savingVersion = version;
        save.setAttribute("disabled", "");
        form.querySelectorAll("p9r-input, p9r-textarea").forEach((field) => field.setAttribute("disabled", ""));
        message.textContent = "";
        try {
            const updatedSeo = await saveLanguages(
                form,
                this.paths,
                this.seo,
                basePath,
                () => this.isConnected && version === this.requestVersion,
                (updated) => {
                    if (!this.isConnected || this.getAttribute("page-id") !== pageId || updated.id !== pageId) {
                        return;
                    }
                    pathsSaved = true;
                    this.dispatchEvent(
                        new CustomEvent("page:paths-saved", {
                            bubbles: true,
                            composed: true,
                            detail: {
                                primaryPath: updated.languages.find((language) => language.default)?.publicPath,
                                revision: updated.revision,
                            },
                        }),
                    );
                    if (version !== this.requestVersion) {
                        this.refresh();
                    }
                },
            );
            if (this.isConnected && version === this.requestVersion) {
                this.seo = updatedSeo;
                this.dispatchEvent(
                    new CustomEvent("page:revision-saved", {
                        bubbles: true,
                        composed: true,
                        detail: { revision: updatedSeo.revision },
                    }),
                );
                this.render(true);
            }
        } catch (error) {
            if (this.isConnected && version === this.requestVersion) {
                const reason = error instanceof Error ? error.message : "Could not save language changes.";
                message.textContent = pathsSaved
                    ? `URLs saved. ${reason} Retry to save the remaining changes.`
                    : reason;
                if (pathsSaved && this.paths) {
                    updateCurrentUrls(form, this.paths);
                }
            }
        } finally {
            if (this.savingVersion === version) {
                this.savingVersion = null;
            }
            if (this.isConnected && version === this.requestVersion) {
                form.querySelectorAll("p9r-input, p9r-textarea").forEach((field) => field.removeAttribute("disabled"));
                save.toggleAttribute("disabled", !this.paths || !this.seo || !hasChanges(this.paths, this.seo, form));
            }
        }
    }

    private showError(text: string): void {
        this.innerHTML = `<style>${styles}</style>`;
        const failure = document.createElement("div");
        failure.className = "page-languages-load-error";
        const message = document.createElement("p");
        message.setAttribute("role", "alert");
        message.textContent = text;
        const retry = document.createElement("p9r-button");
        retry.setAttribute("type", "button");
        retry.textContent = "Try again";
        retry.addEventListener("click", () => this.refresh());
        failure.append(message, retry);
        this.append(failure);
    }
}
