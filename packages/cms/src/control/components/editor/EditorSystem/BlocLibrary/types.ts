import type { TagElement } from '../ObserverManager';

export type TemplateItem = {
    id: string;
    name: string;
    description?: string;
    category: string;
};

export type SnippetItem = {
    id: string;
    identifier: string;
    name: string;
    description?: string;
    category: string;
};

export type BlocMeta = { description?: string };

export type InsertDetail =
    | { type: 'bloc'; id: string }
    | { type: 'template'; html: string }
    | { type: 'snippet'; identifier: string };

export type OnPick = (detail: InsertDetail) => void;

export type Section = 'blocs' | 'templates' | 'snippets';

export type { TagElement };
