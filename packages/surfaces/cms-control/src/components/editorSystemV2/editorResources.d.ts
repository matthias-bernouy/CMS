import type { PageIndexingConfiguration } from "@bernouy/cms-content";
import type { PageIndexingEditorModel } from "cms-control/core/content/page/pageIndexingEditor";

export type PageConfigDetailResponse = {
    id: string;
    title: string;
    description: string;
    path: string;
    tags: string[];
    published: boolean;
    indexing?: PageIndexingConfiguration;
    indexingEditor: PageIndexingEditorModel;
    defaultTemplateCategory?: string;
};

export type EditorSettingsResponse = {
    editor?: { layoutCategory?: string };
    theme?: {
        sources?: Array<{
            label: string;
            categories: Array<{
                label: string;
                tokens: Array<{ label: string; variable: string; type: "color" | "value" }>;
            }>;
        }>;
    };
};

export type TemplateListItem = {
    id: string;
    identifier: string;
    name: string;
    category: string;
};

export type TemplateDetail = TemplateListItem & {
    description?: string;
    content?: string;
};

export type EditorResource = "page" | "template";
