import { Card } from '../components/Card/Card';
import { ICON_COMPONENT } from '../../../../icons';
import type { BlocMeta, OnPick, TagElement } from '../types';

export type RenderBlocsOptions = {
    grid: HTMLElement;
    items: TagElement[];
    blocMeta: Map<string, BlocMeta>;
    onPick: OnPick;
};

export function renderBlocs({ grid, items, blocMeta, onPick }: RenderBlocsOptions) {
    for (const item of items) {
        const card = Card.create({
            icon: ICON_COMPONENT,
            title: item.label,
            description: blocMeta.get(item.tag)?.description,
        });
        card.addEventListener('click', () => onPick({ type: 'bloc', id: item.tag }));
        grid.appendChild(card);
    }
}
