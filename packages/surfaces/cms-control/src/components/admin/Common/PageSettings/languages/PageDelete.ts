import css from "./delete.css" with { type: "text" };
import type { P9rSelect } from "@bernouy/components";
import type { PageListResponse } from "cms-control/api/_content/page/list.get";

type AlternativePage = Pick<PageListResponse[number], "id" | "title" | "path">;

/** Waits for the bound page ID, then loads eligible replacements before enabling deletion. */
export class PageDelete extends HTMLElement {
    private deleting = false;
    private requestVersion = 0;

    static get observedAttributes(): string[] {
        return ["page-id", "base-path"];
    }

    connectedCallback(): void {
        this.render();
    }

    disconnectedCallback(): void {
        this.requestVersion += 1;
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            this.render();
        }
    }

    private render(): void {
        const ownId = this.getAttribute("page-id")?.trim();
        const basePath = this.getAttribute("base-path") ?? "";
        const version = ++this.requestVersion;
        this.innerHTML = `<style>${css as unknown as string}</style>`;
        const form = document.createElement("form");
        form.className = "page-delete-form";
        const explanation = document.createElement("p");
        explanation.textContent =
            "Old URLs redirect to the replacement, or return 410 Gone if none is selected. They stay reserved.";
        const select = document.createElement("p9r-select") as P9rSelect;
        select.setAttribute("name", "alternativeId");
        select.setAttribute("label", "Alternative page");
        select.append(this.option("None — return 410 Gone", ""));
        const message = document.createElement("p");
        message.className = "page-path-error";
        message.setAttribute("role", "alert");
        const submit = document.createElement("p9r-button");
        submit.setAttribute("type", "submit");
        submit.setAttribute("color", "danger");
        submit.setAttribute("disabled", "");
        submit.textContent = "Delete page";
        form.append(explanation, select, message, submit);
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            void this.deletePage(select.value, message, submit);
        });
        this.append(form);
        if (ownId && !ownId.includes("{{") && !basePath.includes("{{")) {
            void this.loadAlternatives(ownId, basePath, version, select, submit, message);
        }
    }

    private async loadAlternatives(
        ownId: string,
        basePath: string,
        version: number,
        select: P9rSelect,
        submit: HTMLElement,
        message: HTMLElement,
    ): Promise<void> {
        try {
            const response = await fetch(`${basePath}/api/page/list?visible=published`);
            if (!response.ok) {
                throw new Error("Could not load alternative pages.");
            }
            const pages = (await response.json()) as AlternativePage[];
            if (!this.isConnected || version !== this.requestVersion) {
                return;
            }
            for (const page of pages) {
                if (page.id !== ownId) {
                    select.append(this.option(`${page.title} (${page.path})`, page.id));
                }
            }
            submit.removeAttribute("disabled");
        } catch {
            if (this.isConnected && version === this.requestVersion) {
                message.textContent = "Could not load alternative pages. Reopen this panel to try again.";
            }
        }
    }

    private option(label: string, value: string): HTMLOptionElement {
        const option = document.createElement("option");
        option.textContent = label;
        option.value = value;
        return option;
    }

    private async deletePage(alternativeId: string, message: HTMLElement, submit: HTMLElement): Promise<void> {
        if (this.deleting || submit.hasAttribute("disabled")) {
            return;
        }
        this.deleting = true;
        submit.setAttribute("disabled", "");
        const basePath = this.getAttribute("base-path") ?? "";
        const id = this.getAttribute("page-id") ?? "";
        const url = new URL(`${basePath}/api/page`, document.baseURI);
        url.searchParams.set("id", id);
        if (alternativeId) {
            url.searchParams.set("alternativeId", alternativeId);
        }
        try {
            const response = await fetch(url, { method: "DELETE" });
            if (!response.ok) {
                throw new Error("Delete failed.");
            }
            window.location.assign(`${basePath}/admin/pages`);
        } catch {
            message.textContent = "Could not delete this page.";
            this.deleting = false;
            submit.removeAttribute("disabled");
        }
    }
}
