import { Component, type ComponentMetadata } from 'src/control/core/editorSystem/Component';
import html from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export type EmptyStateOptions = {
    icon: string;
    message: string;
};

const Metadata: ComponentMetadata = {
    css,
    template: html as unknown as string,
};

export class EmptyState extends Component {
    constructor() {
        super(Metadata);
    }

    static create(opts: EmptyStateOptions): EmptyState {
        const el = document.createElement('cms-bloc-library-empty-state') as EmptyState;

        const iconFragment = document.createRange().createContextualFragment(opts.icon);
        const iconRoot = iconFragment.firstElementChild;
        if (iconRoot) {
            iconRoot.setAttribute('slot', 'icon');
            el.appendChild(iconRoot);
        }

        const messageSpan = document.createElement('span');
        messageSpan.slot = 'message';
        messageSpan.textContent = opts.message;
        el.appendChild(messageSpan);

        return el;
    }
}

if (!customElements.get('cms-bloc-library-empty-state')) {
    customElements.define('cms-bloc-library-empty-state', EmptyState);
}
