import { expect, test } from "bun:test";
import { File } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import {
    Editor,
    type EditorCatalogRegistration,
    type EditorCatalogRuntime,
    type TextCapability,
} from "@bernouy/cms-content/editor";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { decodeDefaultContent, decodeSource } from "../source";

const headingCapability: TextCapability = {
    format: "richtext",
    bold: true,
    italic: true,
    underline: true,
    link: true,
    dynamic: true,
};

const nativeContentCases = [1, 2, 3, 4, 5, 6].map((level) => ({
    tag: `h${level}`,
    path: `blocs/content/headings/basic-heading-${level}`,
    capability: headingCapability,
}));

export function registerNativeContentTest(): void {
    test("hydrates native text artifacts as editable catalog entries", async () => {
        const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repository.get("basic-blocs");

        for (const testCase of nativeContentCases) {
            const artifact = definition?.artifacts?.find(
                (candidate) => candidate.type === "bloc" && candidate.bloc.tag === testCase.tag,
            );
            if (!artifact || artifact.type !== "bloc") {
                throw new Error(`expected ${testCase.tag} artifact`);
            }

            const bloc = artifact.bloc;
            const defaultContent = decodeDefaultContent(bloc.source);
            const manifest = JSON.parse(decodeSource(bloc.source?.["manifest.json"])) as {
                runtime?: string;
                "default-tag"?: string;
            };
            expect(bloc.path).toBe(testCase.path);
            expect(manifest).toMatchObject({ runtime: "native", "default-tag": testCase.tag });
            expect(defaultRoot(defaultContent)).toBe(testCase.tag);

            const built = await prepare_bloc(
                new File([bloc.viewJS ?? ""], "Bloc.ts", { type: "application/typescript" }),
                new File([bloc.editorJS ?? ""], "BlocEditor.ts", { type: "application/typescript" }),
                bloc.name,
                bloc.group ?? "",
                bloc.description ?? "",
                bloc.tag,
                bloc.source,
                defaultContent,
                { native: true },
            );
            expect(built.viewJS).toBe("");

            const registration = executeEditorBundle(built.editorJS);
            expect(registration.tag).toBe(testCase.tag);
            expect(registration.defaultContent).toBe(defaultContent);
            const editor = new registration.editor!(document.createElement(testCase.tag));
            expect(editor.getTextCapability()).toEqual(testCase.capability);
        }
    });
}

function defaultRoot(content: string | undefined): string | undefined {
    const template = document.createElement("template");
    template.innerHTML = content ?? "";
    return template.content.firstElementChild?.localName;
}

function executeEditorBundle(editorJS: string): EditorCatalogRegistration & { editor: NonNullable<EditorCatalogRegistration["editor"]> } {
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
