import type { EditorDocument } from "@bernouy/cms-content/editor";

export type ShellControllerHost = HTMLElement & {
    loadDocument(document: EditorDocument, selectedTarget?: HTMLElement | null): void;
};
