import { CustomHTMLElement } from "../../CustomHTMLElement";
import { onKeyboardEvent } from "./events/onKeyboardEvent";
import onSubmit from "./events/onSubmit";


export default class CmsForm extends CustomHTMLElement {

    private _nativeForm: HTMLFormElement | null = null;

    static override get observedAttributes(): string[] {
        return [ "redirect", "target", "method", "emit" ]
    }

    private _handleInternalSubmit = (e: Event) => {
        onSubmit(e as SubmitEvent, this);
    }

    connectedCallback() {
        requestAnimationFrame(() => {
            // Sécurité si déjà initialisé
            if (this._nativeForm) return;

            this._nativeForm = document.createElement('form');

            const id = this.getAttribute("id");
            if (id) {
                this._nativeForm.id = id;
                this.removeAttribute("id");
            }

            while (this.firstChild) {
                this._nativeForm.appendChild(this.firstChild);
            }

            this.appendChild(this._nativeForm);
            this._nativeForm.addEventListener("submit", this._handleInternalSubmit);
            this.addEventListener("keydown", (e) => onKeyboardEvent(e, this._nativeForm!));
        });
    }

    override disconnectedCallback(): void {
        this.removeEventListener("submit",  (e) => onSubmit(e, this));
        this.removeEventListener("keydown", (e) => onKeyboardEvent(e, this._nativeForm!));
    }

    override attributeChangedCallback(name: any, oldValue: any, newValue: any): void {
        // throw new Error("Method not implemented.");
    }

    get redirect() { return this.getAttribute("redirect");  }
    get target  () { 
        const val = this.getAttribute("target")
        if ( !val ) throw new Error("CmsForm target attribute should be set")
        return val;  
    }
    get method  () { return this.getAttribute("method"  );  }
    get emit () { return this.getAttribute("emit") }

}

if ( !customElements.get("cms-form") ){
    customElements.define("cms-form", CmsForm);
}