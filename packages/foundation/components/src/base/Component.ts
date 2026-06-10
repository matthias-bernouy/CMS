/**
 * Minimal custom element base for the UI toolkit of the `@bernouy/components` package.
 *
 * Intentionally tiny: wires up an open Shadow Root, optionally injects the
 * caller's CSS (as a `<style>`) and HTML template (via `<template>`) at
 * construction time, and exits. No reactive lifecycle or attribute helpers.
 */
export type ComponentMetadata = {
    css: string;
    template: string;
};

export abstract class Component extends HTMLElement {
    private _rawStyles = "";
    private _styles: HTMLStyleElement | null = null;

    constructor(metadata?: ComponentMetadata) {
        super();
        const shadow = this.attachShadow({ mode: "open" });
        if (metadata) {
            this._rawStyles = metadata.css;
            this._styles = document.createElement("style");
            this._styles.innerHTML = metadata.css;
            shadow.appendChild(this._styles);
            const template = document.createElement("template");
            template.innerHTML = metadata.template;
            shadow.appendChild(template.content.cloneNode(true));
        }
    }

    registerCSSVariables(items: Record<string, string>) {
        if (!this._styles) return;

        let src = this._rawStyles;
        Object.entries(items).forEach(([key, value]) => {
            src = src.replaceAll("var(--" + key + ")", value);
        });

        this._styles.innerHTML = src;
    }

    /** Invoked by the browser once the element is appended to the DOM.
     *  Subclasses override this to wire DOM references and listeners. */
    connectedCallback() { /* override in subclasses */ }
}

/**
 * "Upgrade" a property that may have been assigned on the element instance
 * BEFORE its class definition ran (e.g. `el.checked = true` while the bundle is
 * still loading). Such a value sits as an own-property shadowing the prototype
 * accessor and is silently lost; deleting then re-assigning routes it through
 * the setter. Shared by every custom element in the toolkit — call once per
 * observed property in `connectedCallback`.
 */
export function upgradeProperty(host: HTMLElement, prop: string): void {
    if (Object.prototype.hasOwnProperty.call(host, prop)) {
        const value = (host as any)[prop];
        delete (host as any)[prop];
        (host as any)[prop] = value;
    }
}
