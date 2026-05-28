import { Card } from '../components/Card/Card';
import { EmptyState } from '../components/EmptyState/EmptyState';
import { ICON_COMPONENT, ICON_SNIPPET, ICON_TEMPLATE } from '../../../../icons';
import { fetchTemplateContent } from '../api';
import type { BlocMeta, OnPick, SnippetItem, TagElement, TemplateItem } from '../types';

export type RenderSearchOptions = {
    grid: HTMLElement;
    query: string;
    blocs: TagElement[];
    blocMeta: Map<string, BlocMeta>;
    templates: TemplateItem[];
    snippets: SnippetItem[];
    onPick: OnPick;
};

export function renderSearch({ grid, query, blocs, blocMeta, templates, snippets, onPick }: RenderSearchOptions) {
    const q = query.trim().toLowerCase();

    const matchingBlocs = blocs.filter(b => {
        const desc = blocMeta.get(b.tag)?.description ?? '';
        return b.label.toLowerCase().includes(q)
            || b.tag.toLowerCase().includes(q)
            || desc.toLowerCase().includes(q);
    });
    const matchingTemplates = templates.filter(t =>
        t.name.toLowerCase().includes(q)
        || (t.description ?? '').toLowerCase().includes(q)
        || (t.category ?? '').toLowerCase().includes(q)
    );
    const matchingSnippets = snippets.filter(s =>
        s.name.toLowerCase().includes(q)
        || (s.description ?? '').toLowerCase().includes(q)
        || s.identifier.toLowerCase().includes(q)
        || (s.category ?? '').toLowerCase().includes(q)
    );

    const total = matchingBlocs.length + matchingTemplates.length + matchingSnippets.length;
    if (total === 0) {
        grid.appendChild(EmptyState.create({
            icon: ICON_COMPONENT,
            message: `No results for "${query}"`,
        }));
        return;
    }

    if (matchingBlocs.length > 0) {
        appendSectionHeader(grid, 'Blocs');
        for (const item of matchingBlocs) {
            const card = Card.create({
                icon: ICON_COMPONENT,
                title: item.label,
                description: blocMeta.get(item.tag)?.description,
            });
            card.addEventListener('click', () => onPick({ type: 'bloc', id: item.tag }));
            grid.appendChild(card);
        }
    }
    if (matchingTemplates.length > 0) {
        appendSectionHeader(grid, 'Templates');
        for (const tpl of matchingTemplates) {
            const card = Card.create({
                icon: ICON_TEMPLATE,
                title: tpl.name,
                description: tpl.description,
            });
            card.addEventListener('click', async () => {
                const html = await fetchTemplateContent(tpl.id);
                onPick({ type: 'template', html });
            });
            grid.appendChild(card);
        }
    }
    if (matchingSnippets.length > 0) {
        appendSectionHeader(grid, 'Snippets');
        for (const snippet of matchingSnippets) {
            const card = Card.create({
                icon: ICON_SNIPPET,
                title: snippet.name,
                description: snippet.description,
            });
            card.addEventListener('click', () => onPick({ type: 'snippet', identifier: snippet.identifier }));
            grid.appendChild(card);
        }
    }
}

function appendSectionHeader(grid: HTMLElement, label: string) {
    const header = document.createElement('div');
    header.className = 'section-header';
    header.textContent = label;
    grid.appendChild(header);
}
