import { expect, test } from "bun:test";
import { File } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { decodeDefaultContent } from "../source";

export function registerButtonTest(): void {
    test("button preserves submitter data and exposes generic layout and icon controls", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("basic-blocs");
        const artifact = definition?.artifacts?.find(
            (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "basic-button",
        );
        if (!artifact || artifact.type !== "bloc") {
            throw new Error("expected basic-button artifact");
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

        const form = document.createElement("form");
        const button = document.createElement("basic-button");
        button.setAttribute("type", "submit");
        button.setAttribute("name", "subscribed");
        button.setAttribute("value", "true");
        button.setAttribute("appearance", "outlined");
        button.setAttribute("size", "lg");
        button.setAttribute("width", "full");
        button.setAttribute("align", "left");
        button.setAttribute("disabled", "no");
        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("slot", "icon-left");
        button.append(icon);
        form.append(button);
        document.body.append(form);

        let submitCount = 0;
        const formValues: unknown[] = [];
        button.internals.setFormValue = (value) => formValues.push(value);
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            submitCount++;
        });
        button.shadowRoot?.querySelector<HTMLButtonElement>("button")?.click();

        expect(button.hasAttribute("disabled")).toBe(false);
        expect((button as HTMLElement & { name: string }).name).toBe("subscribed");
        expect(submitCount).toBe(1);
        expect(formValues).toEqual(["true", null]);
        expect(form.querySelector("[data-basic-button-submitter]")).toBeNull();
        expect(button.shadowRoot?.querySelector('[part="icon-left"]')?.hasAttribute("hidden")).toBe(false);
        expect(button.shadowRoot?.textContent).toContain(':host([width="full"])');
        expect(button.shadowRoot?.textContent).toContain(':host([appearance="outlined"])');
        form.remove();
    });
}
