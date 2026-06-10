import { onKeyboardEvent } from "./events/onKeyboardEvent";
import onSubmit from "./events/onSubmit";


export class Form extends HTMLElement {

    private _nativeForm: HTMLFormElement | null = null;

    static get observedAttributes(): string[] {
        return [ "redirect", "target", "method", "emit" ]
    }

    private _handleInternalSubmit = (e: Event) => {
        onSubmit(e as SubmitEvent, this);
    }

    private _handleKeydown = (e: KeyboardEvent) => {
        onKeyboardEvent(e, this._nativeForm!);
    }

    connectedCallback() {
        requestAnimationFrame(() => {
            // guard: already initialized
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
            this.addEventListener("keydown", this._handleKeydown);
        });
    }

    disconnectedCallback(): void {
        this._nativeForm?.removeEventListener("submit", this._handleInternalSubmit);
        this.removeEventListener("keydown", this._handleKeydown);
    }

    attributeChangedCallback(name: any, oldValue: any, newValue: any): void {
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
