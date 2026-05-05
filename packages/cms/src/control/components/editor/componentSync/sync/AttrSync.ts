import type { Component } from "src/control/core/editorSystem/Component";

export class AttrSync extends HTMLElement {

    private _component: Component | null = null;
    private _prepared = false;

    connectedCallback() {
        const componentIdentifier = this.getAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER);
        if (componentIdentifier && !this._component) {
            this._component = document.querySelector(`[${p9r.attr.EDITOR.IDENTIFIER}="${componentIdentifier}"]`);
        }
        requestAnimationFrame(() => {
            if (!this._prepared) this._sync();
            this.addEventListener('change', (e) => this.onChange(e));
        });
    }

    /**
     * Eager pass from Editor._initPanelFragment. Seeds component attrs from
     * the panel inputs' default values (so a freshly-created bloc gets its
     * configured defaults) without binding the change listener — that only
     * matters once the user opens the panel.
     */
    public prepare(component: Component) {
        this._component = component;
        this._sync();
        this._prepared = true;
    }

    private onChange(event: Event) {
        const target = event.target as HTMLElement & { name?: string; value?: any };
        if (target && target.name) {
            if (target.value === "" || target.value == null) {
                this._component?.removeAttribute(target.name);
            } else {
                this._component?.setAttribute(target.name, target.value);
            }
        }
    }

    private _sync() {
        const inputs = Array.from(this.querySelectorAll("[name]")) as any[];
        inputs.forEach(input => {
            const val = this._component?.getAttribute(input.name)
            if (val) {
                input.value = val;
            } else {
                if (input.value) {
                    this._component?.setAttribute(input.name, input.value);
                }
            }
        });
    }

}

if (!customElements.get("p9r-attr-sync")) {
    customElements.define("p9r-attr-sync", AttrSync)
}
