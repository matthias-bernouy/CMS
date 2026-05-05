export abstract class CustomHTMLElement extends HTMLElement {
    
    constructor(html?: string, css?: string, shadow?: boolean) {
        super();
        if ( shadow ) {
            const ele = this.attachShadow({mode: "open"});
            ele.innerHTML = `<style>${css ?? ""}</style>${html ?? ""}`;
        }
    }

    static get observedAttributes(): string[] {
        return [];
    }

    abstract connectedCallback(): void;

    abstract disconnectedCallback(): void;

    abstract attributeChangedCallback(name: any, oldValue: any, newValue: any): void
}