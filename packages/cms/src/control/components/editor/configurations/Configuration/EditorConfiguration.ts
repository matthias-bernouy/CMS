import { CustomHTMLElement } from "src/control/components/CustomHTMLElement";

import html from "./template.html" with { type: "text" }
import css  from "./style.css"     with { type: "text" }
import getClosestEditorSystem from "src/control/core/dom/editor/getClosestEditorSystem";
import type { LateralDialog } from "@bernouy/webcomponents";
import { getFormData } from "../../../../core/dom/getFormData";

/**
 * This class is used to add the "content" key from the editorSystem to the fetch.
 * And add the id resource.
 */
export default class EditorConfiguration extends CustomHTMLElement {

    static override get observedAttributes(): string[] {
        return [ "url", "method" ]
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
        })
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