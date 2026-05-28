import template from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };
import { Component } from '@bernouy/cms-control/component';

/**
 * Button bloc — visually a styled "button"-shaped surface, semantically a
 * link. The shadow DOM hosts an `<a>` overlay sized to the host; the host
 * carries the visual styling (`:host(...)` rules) while the overlay
 * routes clicks through native browser navigation. Authors configure
 * `href` / `target` / `disabled` via `<p9r-link>` and `<p9r-attr-sync>`
 * in `configuration.html`.
 *
 * No JS-driven navigation: assigning `location.href` from a bloc bypasses
 * the editor's link interceptor (Location members are
 * `[[LegacyUnforgeable]]` per WebIDL — browsers refuse our override).
 * `cms-bloc-development.md` rule 9 documents the constraint.
 */
export class Bloc extends Component {

    static observedAttributes = ['href', 'target', 'disabled'];

    constructor() {
        super({ css, template: template as unknown as string });
    }

    override connectedCallback(): void {
        this._syncLink();
    }

    attributeChangedCallback(): void {
        this._syncLink();
    }

    private _syncLink(): void {
        const a = this.shadowRoot?.querySelector('a');
        if (!a) return;

        const href     = this.getAttribute('href');
        const target   = this.getAttribute('target');
        const disabled = this.hasAttribute('disabled');

        if (href && !disabled) a.setAttribute('href', href);
        else                   a.removeAttribute('href');

        if (target) a.setAttribute('target', target);
        else        a.removeAttribute('target');

        // `target="_blank"` without `rel` leaves the new window with access
        // to `window.opener` on legacy browsers and may leak the referrer.
        if (target === '_blank') a.setAttribute('rel', 'noopener noreferrer');
        else                     a.removeAttribute('rel');

        a.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    }
}
