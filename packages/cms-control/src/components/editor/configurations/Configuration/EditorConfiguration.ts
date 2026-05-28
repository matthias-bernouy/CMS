import { CustomHTMLElement } from "cms-control/components/CustomHTMLElement";

import html from "./template.html" with { type: "text" }
import css  from "./style.css"     with { type: "text" }
import getClosestEditorSystem from "cms-control/core/dom/editor/getClosestEditorSystem";
import type { LateralDialog } from "@bernouy/webcomponents";
import { getFormData } from "../../../../core/dom/getFormData";

/**
 * This class is used to add the "content" key from the editorSystem to the fetch.
 * And add the id resource.
 */
export default class EditorConfiguration extends CustomHTMLElement {

    static override get observedAttributes(): string[] {
        return [ "url", "method", "delete-redirect", "delete-label" ]
    }

    constructor(){
        super(html as unknown as string, css as unknown as string, true)
    }

    _handleSubmit = (e: SubmitEvent) => {
        e.preventDefault();
        const editorSystem = getClosestEditorSystem(this);
        const content = editorSystem.pageContent;
        const id = new URL(window.location.href).searchParams.get("id");
        if (!id) throw new Error("Id is missing");


        const formData = getFormData(
            e.target as HTMLFormElement,
            this.shadowRoot?.querySelector("form slot") as HTMLSlotElement
        )

        const data = Object.fromEntries(formData.entries())

        fetch(this.url, {
            method: this.method,
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({...data, content, id})
        })
    }
    
    override connectedCallback(): void {
        requestAnimationFrame(() => {
            const form = this.shadowRoot?.querySelector("form")!;
            form.addEventListener("submit", this._handleSubmit)
            this._setupDelete()
        })
    }

    /**
     * Wire the opt-in "Delete" button. Reused `cms-confirm-form` handles the
     * confirm → DELETE → 409-conflict → redirect/toast flow; we only feed it
     * the runtime values it can't template itself: the resource id (from the
     * URL) and the list page to return to (the `delete-redirect` attribute).
     */
    private _setupDelete(){
        const redirect = this.getAttribute("delete-redirect");
        const confirmForm = this.shadowRoot?.querySelector("#delete-form");
        if (!confirmForm || !redirect) return;

        const id = new URL(window.location.href).searchParams.get("id");
        if (!id) return;

        confirmForm.setAttribute("target", `${this.url}?id=${encodeURIComponent(id)}`);
        confirmForm.setAttribute("method", "DELETE");
        confirmForm.setAttribute("redirect", redirect);
        confirmForm.setAttribute("message", this.getAttribute("delete-message")
            || "Delete this permanently? This cannot be undone.");

        const label = this.getAttribute("delete-label");
        if (label) this.shadowRoot!.querySelector("#delete-btn")!.textContent = label;

        confirmForm.removeAttribute("hidden");
    }

    override disconnectedCallback(): void {
        const form = this.shadowRoot?.querySelector("form")!;
        form.addEventListener("submit", this._handleSubmit)
    }

    override attributeChangedCallback(name: any, oldValue: any, newValue: any): void {
        //throw new Error("Method not implemented.");
    }

    open(){
        const dialog = this.shadowRoot?.querySelector("w13c-lateral-dialog") as LateralDialog;
        dialog.showModal();
    }

    get url(){
        const url = this.getAttribute("url");
        if (!url) throw new Error("url should be set")
        return url;
    }

    get method(){
        return this.getAttribute("method") || "PUT";
    }
    
}

if ( !customElements.get("cms-editor-configuration") ){
    customElements.define("cms-editor-configuration", EditorConfiguration)
}