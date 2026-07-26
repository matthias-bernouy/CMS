import { expect, test } from "bun:test";
import { File } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { decodeDefaultContent } from "../source";
import { executeEditorBundle } from "./support";

export function registerNativeLinkTest(): void {
    test("exposes safe authoring settings for native links", async () => {
        const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repository.get("basic-blocs");
        const artifact = definition?.artifacts?.find(
            (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "a",
        );
        if (!artifact || artifact.type !== "bloc") {
            throw new Error("expected native link artifact");
        }

        const bloc = artifact.bloc;
        const built = await prepare_bloc(
            new File([bloc.viewJS ?? ""], "Bloc.ts", { type: "application/typescript" }),
            new File([bloc.editorJS ?? ""], "BlocEditor.ts", { type: "application/typescript" }),
            bloc.name,
            bloc.group ?? "",
            bloc.description ?? "",
            bloc.tag,
            bloc.source,
            decodeDefaultContent(bloc.source),
            { native: true },
        );
        const registration = executeEditorBundle(built.editorJS);
        const editor = new registration.editor!(document.createElement("a"));
        expect(editor.getSettings()).toEqual([
            {
                kind: "self",
                label: "Link",
                settings: [
                    {
                        type: "page-link",
                        label: "Target",
                        attribute: "href",
                        allowPage: true,
                        allowExternal: true,
                        allowMedia: true,
                    },
                    {
                        type: "select",
                        label: "Open in",
                        attribute: "target",
                        defaultValue: "",
                        options: [
                            { label: "Same tab", value: "" },
                            { label: "New tab", value: "_blank" },
                        ],
                    },
                    {
                        type: "text",
                        label: "Relationship",
                        attribute: "rel",
                        help: "Optional space-separated values such as nofollow, sponsored, or noreferrer.",
                    },
                ],
            },
        ]);
    });
}
