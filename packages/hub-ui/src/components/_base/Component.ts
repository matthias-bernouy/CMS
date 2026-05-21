/**
 * Minimal shadow-DOM base for hub-ui custom elements — same shape as
 * `@bernouy/webcomponents`'s `Component`, vendored here so each hub-ui
 * component bundles independently (the webcomponents `Component` class
 * lives behind the IIFE-only `.` export and isn't importable as a module).
 *
 * Open shadow root + optional `<style>` / template injection at
 * construction. Theme tokens (`--primary-*`, `--text-*`, …) pierce the
 * shadow boundary, so component CSS uses ONLY `var(--token)` — never a
 * hardcoded color.
 */
export type ComponentMetadata = { css: string; template: string };

export abstract class Component extends HTMLElement {
    constructor(metadata?: ComponentMetadata) {
        super();
        const shadow = this.attachShadow({ mode: "open" });
        if (metadata) {
            const style = document.createElement("style");
            style.textContent = metadata.css;
            shadow.appendChild(style);
            const tpl = document.createElement("template");
            tpl.innerHTML = metadata.template;
            shadow.appendChild(tpl.content.cloneNode(true));
        }
    }
    connectedCallback() { /* override */ }
}
