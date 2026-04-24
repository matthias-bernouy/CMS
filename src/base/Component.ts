/**
 * Minimal Web Component base for the UI toolkit shipped by `@bernouy/socle`.
 *
 * Intentionally tiny: wires up an open Shadow Root, optionally injects the
 * caller's CSS (as a `<style>`) and HTML template (via `<template>`) at
 * construction time, and exits. No reactive lifecycle, no attribute helpers,
 * no CSS-variable rewriting — consumers that need more add it in their own
 * subclasses.
 *
 * The CMS (`@bernouy/cms/component`) provides its own richer `Component`
 * class for bloc runtime. The two are deliberately kept separate so that a
 * simple admin UI dialog doesn't drag in bloc-editor concerns.
 */
export type ComponentMetadata = {
    css: string;
    template: string;
};

export abstract class Component extends HTMLElement {

    constructor(metadata?: ComponentMetadata) {
        super();
        const shadow = this.attachShadow({ mode: "open" });
        if (metadata) {
            const style = document.createElement("style");
            style.innerHTML = metadata.css;
            shadow.appendChild(style);
            const template = document.createElement("template");
            template.innerHTML = metadata.template;
            shadow.appendChild(template.content.cloneNode(true));
        }
    }

    /** Invoked by the browser once the element is appended to the DOM.
     *  Subclasses override this to wire DOM references and listeners. */
    connectedCallback() { /* override in subclasses */ }
}
