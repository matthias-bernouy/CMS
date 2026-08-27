import { expect, test } from "bun:test";
import { File } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { decodeDefaultContent } from "./source";

export function registerFileInputTest(): void {
    test("does not show a required file error before validation", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("basic-blocs");
        const artifact = definition?.artifacts?.find(
            (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "basic-file-input",
        );
        if (!artifact || artifact.type !== "bloc") {
            throw new Error("expected basic-file-input artifact");
        }
        const bloc = artifact.bloc;
        const built = await prepare_bloc(
            new File([bloc.viewJS ?? ""], "Bloc.js", { type: "application/javascript" }),
            new File([bloc.editorJS ?? ""], "BlocEditor.ts", { type: "application/typescript" }),
            bloc.name,
            bloc.group ?? "",
            bloc.description ?? "",
            bloc.tag,
            bloc.source,
            decodeDefaultContent(bloc.source),
        );
        new Function(built.viewJS)();

        const input = document.createElement("basic-file-input");
        input.setAttribute("name", "file");
        input.setAttribute("required", "");
        input.setAttribute("accent-color", "tomato");
        input.setAttribute("background-color", "ivory");
        input.setAttribute("border-color", "sienna");
        input.setAttribute("text-color", "navy");
        document.body.append(input);

        const error = input.shadowRoot?.querySelector(".error");
        expect(error?.textContent).toBe("");
        expect(error?.hasAttribute("hidden")).toBe(true);
        const fieldStyle = input.shadowRoot?.querySelector<HTMLElement>(".field")?.style;
        expect(fieldStyle?.getPropertyValue("--cms-focus-color")).toBe("tomato");
        expect(fieldStyle?.getPropertyValue("--cms-file-background")).toBe("ivory");
        expect(fieldStyle?.getPropertyValue("--cms-file-border-color")).toBe("sienna");
        expect(fieldStyle?.getPropertyValue("--cms-file-color")).toBe("navy");
        input.remove();
    });
}
