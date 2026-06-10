import { Card } from '../components/Card/Card';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { ICON_SNIPPET, ICON_SNIPPET_MUTED } from '../../../../icons';
import type { OnPick, SnippetItem } from '../types';

export type RenderSnippetsOptions = {
    grid: HTMLElement;
    snippets: SnippetItem[];
    category: string | null;
    onPick: OnPick;
};

export function renderSnippets({ grid, snippets, category, onPick }: RenderSnippetsOptions) {
    const filtered = snippets.filter(s => (s.category || 'Default') === category);

    if (filtered.length === 0) {
        grid.appendChild(EmptyState.create({
            icon: ICON_SNIPPET_MUTED,
            message: 'No snippets in this category',
        }));
        return;
    }

    for (const snippet of filtered) {
        const card = Card.create({
            icon: ICON_SNIPPET,
            title: snippet.name,
            description: snippet.description,
        });
        card.addEventListener('click', () => onPick({ type: 'snippet', identifier: snippet.identifier }));
        grid.appendChild(card);
    }
}
