export type ComponentMetadata = {
    css: string;
    template: string;
}

export abstract class Component extends HTMLElement {

    private _rawStyles: string = "";
    private _styles: HTMLStyleElement | null = null;
    private _template: HTMLTemplateElement | null = null;

    constructor(metadata?: ComponentMetadata) {
        super();
        const shadow = this.attachShadow({ mode: "open" });
        if (metadata){
            this._rawStyles = metadata.css;
            this._styles = document.createElement("style") as HTMLStyleElement;
            this._styles.innerHTML = metadata.css;
            shadow.appendChild(this._styles);
            this._template = document.createElement("template");
            this._template.innerHTML = metadata ? metadata.template : "";
            shadow.appendChild(this._template.content.cloneNode(true));
        }
    }

    registerCSSVariables(items: Record<string, string>) {
        if ( !this._styles ) return;
        let src = this._rawStyles; 
        Object.entries(items).forEach(([key, value]) => {
            src = src.replaceAll("var(--" + key + ")", value); 
        });
        
        this._styles.innerHTML = src;
    }

    connectedCallback() {
    }


}