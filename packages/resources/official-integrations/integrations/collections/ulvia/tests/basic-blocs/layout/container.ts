import { expect, test } from "bun:test";
import { File } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { executeEditorBundle } from "../catalog/support";
import { decodeDefaultContent } from "../source";

export function registerContainerTest(): void {
    test("container constrains content with theme widths and responsive gutters", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("ulvia");
        const artifact = definition?.artifacts?.find(
            (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "basic-container",
        );
        if (!artifact || artifact.type !== "bloc") {
            throw new Error("expected basic-container artifact");
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
        );
        new Function(built.viewJS)();

        const container = document.createElement("basic-container");
        container.append(document.createElement("p"));
        document.body.append(container);
        const styles = container.shadowRoot?.textContent ?? "";
        expect(container.shadowRoot?.querySelector("slot")).not.toBeNull();
        expect(styles).toContain("max-inline-size: var(--basic-container-max-width)");
        expect(styles).toContain("margin-inline: auto");
        expect(styles).toContain("var(--ulvia-content-width, var(--content-width, 68rem))");
        expect(styles).toContain("var(--ulvia-wide-width, var(--wide-width, 82rem))");
        expect(styles).toContain("var(--ulvia-space-md, var(--space-md, 1rem))");
        expect(styles).toContain("var(--wide-width, 82rem)");
        expect(styles).toContain("var(--space-md, 1rem)");
        expect(styles).toContain(':host([width="full"])');

        const registration = executeEditorBundle(built.editorJS);
        const editor = new registration.editor!(container);
        expect(editor.getSettings()).toEqual([
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "segmented",
                        label: "Width",
                        attribute: "width",
                        defaultValue: "content",
                        options: [
                            { label: "Content", value: "content" },
                            { label: "Wide", value: "wide" },
                            { label: "Full", value: "full" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Inline gutter",
                        attribute: "gutter",
                        defaultValue: "md",
                        options: [
                            { label: "None", value: "none" },
                            { label: "S", value: "sm" },
                            { label: "M", value: "md" },
                            { label: "XL", value: "xl" },
                        ],
                    },
                ],
            },
        ]);
        expect(editor.getContentSlots()).toEqual([{ label: "Content", accepts: [{ kind: "any-component" }] }]);
        container.remove();
    });
}
