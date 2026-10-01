import { getMetaBasePath } from "cms-control/core/dom/meta/getMetaBasePath";
import type { ProviderManifestLinks } from "@bernouy/cms-repository/providers";
import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };

type Preview = {
    ticket: string;
    providerName: string;
    accountLabel: string;
    accountId: string;
    endpoint: string;
    manifestVersion: string;
    manifestDigest: string;
    contracts: { contractId: string; version: string; status: string }[];
    check: string;
};

export class ProviderManagement extends HTMLElement {
    private providerId = "";
    private version = "";
    private preview?: Preview;

    connectedCallback(): void {
        if (this.shadowRoot) {
            return;
        }
        const root = this.attachShadow({ mode: "open" });
        root.innerHTML = `<style>${css}</style>${template}`;
        root.querySelector("[data-form]")!.addEventListener("submit", (event) => {
            event.preventDefault();
            void this.check();
        });
        root.querySelector("[data-approve]")!.addEventListener("click", () => void this.approve());
    }

    open(providerId: string, version: string, endpoint: string, links?: ProviderManifestLinks): void {
        this.dispatchEvent(new CustomEvent("provider-connection-opened", { bubbles: true, composed: true }));
        this.providerId = providerId;
        this.version = version;
        this.preview = undefined;
        const root = this.shadowRoot!;
        root.querySelector("[data-connection]")!.removeAttribute("hidden");
        root.querySelector("[data-review]")!.setAttribute("hidden", "");
        root.querySelector("[data-target]")!.textContent = `${providerId} · manifest ${version}`;
        (root.querySelector('[name="endpoint"]') as HTMLElement & { value: string }).value = endpoint;
        (root.querySelector('[name="token"]') as HTMLElement & { value: string }).value = "";
        const setup = root.querySelector("[data-setup-link]") as HTMLAnchorElement;
        setup.toggleAttribute("hidden", !links?.setup);
        if (links?.setup) {
            setup.href = links.setup;
        } else {
            setup.removeAttribute("href");
        }
    }

    private async check(): Promise<void> {
        const root = this.shadowRoot!;
        const form = root.querySelector("[data-form]") as HTMLFormElement;
        const fields = new FormData(form);
        this.status("Checking provider report…");
        try {
            this.preview = (await this.request("provider-preview", {
                providerId: this.providerId,
                version: this.version,
                endpoint: String(fields.get("endpoint") ?? ""),
                token: String(fields.get("token") ?? ""),
            })) as Preview;
            (root.querySelector('[name="token"]') as HTMLElement & { value: string }).value = "";
            root.querySelector("[data-review]")!.removeAttribute("hidden");
            root.querySelector("[data-review-summary]")!.textContent =
                `${this.preview.providerName} · ${this.preview.accountLabel} (${this.preview.accountId}) · ${this.preview.endpoint} · ${this.preview.manifestDigest}`;
            root.querySelector("[data-review-check]")!.textContent = this.preview.check;
            const list = root.querySelector("[data-review-contracts]")!;
            list.replaceChildren(
                ...this.preview.contracts.map((item) => {
                    const row = document.createElement("li");
                    row.textContent = `${item.contractId}@${item.version} · ${item.status}`;
                    return row;
                }),
            );
            this.status("Review the installation before approving it.");
        } catch (error) {
            this.status(String(error));
        }
    }

    private async approve(): Promise<void> {
        if (!this.preview) {
            return;
        }
        const button = this.shadowRoot!.querySelector("[data-approve]") as HTMLElement & { disabled: boolean };
        button.disabled = true;
        try {
            const result = (await this.request("provider-approve", { ticket: this.preview.ticket })) as {
                installationId: string;
            };
            this.preview = undefined;
            this.shadowRoot!.querySelector("[data-connection]")!.setAttribute("hidden", "");
            this.dispatchEvent(
                new CustomEvent("provider-connected", { bubbles: true, composed: true, detail: result }),
            );
        } catch (error) {
            this.status(String(error));
        } finally {
            button.disabled = false;
        }
    }

    private async request(path: string, body: unknown): Promise<unknown> {
        const response = await fetch(`${getMetaBasePath()}/api/${path}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            throw new Error(`${path} failed (${response.status}): ${await response.text()}`);
        }
        return response.json();
    }

    private status(message: string): void {
        this.shadowRoot!.querySelector("[role=status]")!.textContent = message;
    }
}

customElements.define("cms-provider-management", ProviderManagement);
