import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import type { ImportedProvider } from "../rows";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

const MAX_MANIFEST_BYTES = 512 * 1024;

export class CustomProviderImport extends HTMLElement {
    connectedCallback(): void {
        if (this.shadowRoot) {
            return;
        }
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML = `<style>${css}</style>${template}`;
        root.querySelector("[data-form]")!.addEventListener("submit", (event) => {
            event.preventDefault();
            void this.import();
        });
    }

    reset(): void {
        const root = this.shadowRoot;
        if (!root) {
            return;
        }
        (root.querySelector('[name="manifestUrl"]') as HTMLElement & { value: string }).value = "";
        this.status("");
    }

    private async import(): Promise<void> {
        const root = this.shadowRoot!;
        const button = root.querySelector("[data-submit]") as HTMLElement & { disabled: boolean };
        button.disabled = true;
        this.status("Loading and validating the provider manifest…");
        try {
            const manifest = await this.readManifest();
            const response = await fetch(`${getMetaBasePath()}/api/provider-custom-import`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ manifest }),
            });
            if (!response.ok) {
                throw new Error(`Manifest import failed (${response.status}): ${await response.text()}`);
            }
            const provider = (await response.json()) as ImportedProvider;
            this.dispatchEvent(
                new CustomEvent("provider-manifest-imported", {
                    bubbles: true,
                    composed: true,
                    detail: provider,
                }),
            );
        } catch (error) {
            this.status(error instanceof Error ? error.message : String(error));
        } finally {
            button.disabled = false;
        }
    }

    private async readManifest(): Promise<string> {
        const value = (this.shadowRoot!.querySelector('[name="manifestUrl"]') as HTMLElement & { value: string }).value;
        const url = publicManifestUrl(value);
        const response = await fetch(url, {
            credentials: "omit",
            headers: { Accept: "application/json" },
            redirect: "error",
            cache: "no-store",
        });
        if (!response.ok) {
            throw new Error(`Manifest download failed (${response.status})`);
        }
        const manifest = await response.text();
        if (new TextEncoder().encode(manifest).byteLength > MAX_MANIFEST_BYTES) {
            throw new Error("The manifest exceeds 512 KiB");
        }
        return manifest;
    }

    private status(message: string): void {
        this.shadowRoot!.querySelector("[role=status]")!.textContent = message;
    }
}

function publicManifestUrl(value: string): URL {
    const url = new URL(value);
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) || url.username || url.password) {
        throw new Error("Manifest URL must use HTTPS or loopback HTTP without credentials");
    }
    return url;
}

customElements.define("cms-custom-provider-import", CustomProviderImport);
