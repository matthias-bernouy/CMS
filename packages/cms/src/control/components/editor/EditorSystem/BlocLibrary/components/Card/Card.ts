import { Component, type ComponentMetadata } from 'src/control/core/editorSystem/Component';
import html from './template.html' with { type: 'text' };
import css from './style.css' with { type: 'text' };

export type CardOptions = {
    icon: string;
    title: string;
    description?: string;
};

const Metadata: ComponentMetadata = {
    css,
    template: html as unknown as string,
};

export class Card extends Component {
    constructor() {
        super(Metadata);
    }

    static create(opts: CardOptions): Card {
        const card = document.createElement('cms-bloc-library-card') as Card;

        const iconFragment = document.createRange().createContextualFragment(opts.icon);
        const iconRoot = iconFragment.firstElementChild;
        if (iconRoot) {
            iconRoot.setAttribute('slot', 'icon');
            card.appendChild(iconRoot);
        }

        const titleSpan = document.createElement('span');
        titleSpan.slot = 'title';
        titleSpan.textContent = opts.title;
        card.appendChild(titleSpan);

        if (opts.description) {
            const descSpan = document.createElement('span');
            descSpan.slot = 'description';
            descSpan.textContent = opts.description;
            card.appendChild(descSpan);
        }

        return card;
    }
}

if (!customElements.get('cms-bloc-library-card')) {
    customElements.define('cms-bloc-library-card', Card);
}
