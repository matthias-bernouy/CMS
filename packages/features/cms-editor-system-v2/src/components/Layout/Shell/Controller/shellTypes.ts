import type { TopBarViewport } from "../../TopBar/TopBar";

export type EditorV2PageConfig = {
    id: string;
    title: string;
    path: string;
    description: string;
    tags: string[];
    published: boolean;
    defaultTemplateCategory?: string;
};

export type EditorV2SaveDocumentDetail = {
    page: EditorV2PageConfig;
    content: string;
};

export type SelectOptions = {
    scrollFrameIntoView?: boolean;
    scrollStructureIntoView?: boolean;
};

export type EditorPreviewMode = "mirrored" | "external";

export type EditorFrameUrls = {
    editor?: string | null;
    view?: string | null;
};

export type ViewportConfig = {
    label: string;
    width: number | "100%";
    height: number | "100%";
    padding: "normal" | "none";
    fit: "fixed" | "fluid";
};

export type ViewportMap = Record<TopBarViewport, ViewportConfig>;
