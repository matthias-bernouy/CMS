import { expect, test } from "bun:test";
import { File } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { decodeDefaultContent } from "../source";
import { executeEditorBundle } from "./support";

export function registerNativeListTest(): void {
    test("restricts native lists to editable list items", async () => {
        const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repository.get("ulvia");

        for (const tag of ["ol", "ul"]) {
            const artifact = definition?.artifacts?.find(
                (candidate) => candidate.type === "bloc" && candidate.bloc.tag === tag,
            );
            if (!artifact || artifact.type !== "bloc") {
                throw new Error(`expected native ${tag} artifact`);
            }

            const bloc = artifact.bloc;
            const defaultContent = decodeDefaultContent(bloc.source);
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
            const registration = executeEditorBundle(built.editorJS);
            const editor = new registration.editor!(document.createElement(tag));
            expect(editor.getContentSlots()).toEqual([
                {
                    label: "Items",
                    min: 1,
                    accepts: [{ kind: "component", tag: "li" }],
                },
            ]);

            const template = document.createElement("template");
            template.innerHTML = defaultContent ?? "";
            expect(template.content.firstElementChild?.firstElementChild?.localName).toBe("li");
        }
    });
}
