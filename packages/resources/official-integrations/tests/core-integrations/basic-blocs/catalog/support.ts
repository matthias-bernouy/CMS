import { Editor, type EditorCatalogRegistration, type EditorCatalogRuntime } from "@bernouy/cms-content/editor";

export function defaultRoot(content: string | undefined): string | undefined {
    const template = document.createElement("template");
    template.innerHTML = content ?? "";
    return template.content.firstElementChild?.localName;
}

export function executeEditorBundle(
    editorJS: string,
): EditorCatalogRegistration & { editor: NonNullable<EditorCatalogRegistration["editor"]> } {
    const editorWindow = window as typeof window & { p9rEditor?: EditorCatalogRuntime };
    const previous = editorWindow.p9rEditor;
    let registration: EditorCatalogRegistration | undefined;
    editorWindow.p9rEditor = {
        Editor,
        registerEditor: (entry) => {
            registration = entry;
        },
        getCatalog: () => [],
    };
    try {
        new Function(editorJS)();
    } finally {
        if (previous) {
            editorWindow.p9rEditor = previous;
        } else {
            delete editorWindow.p9rEditor;
        }
    }
    if (!registration?.editor) {
        throw new Error("editor bundle did not register an editor constructor");
    }
    return registration as EditorCatalogRegistration & {
        editor: NonNullable<EditorCatalogRegistration["editor"]>;
    };
}
