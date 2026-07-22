import { expect, test } from "bun:test";
import { File } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { decodeDefaultContent } from "../source";

export function registerInputTest(): void {
    test("submits the parent form when Enter is pressed in a Basic input", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("basic-blocs");
        const artifact = definition?.artifacts?.find(
            (artifact) => artifact.type === "bloc" && artifact.bloc.tag === "basic-input",
        );
        if (!artifact || artifact.type !== "bloc") {
            throw new Error("expected basic-input artifact");
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
        const input = document.createElement("basic-input");
        input.setAttribute("name", "query");
        input.setAttribute("text-color", "#123456");
        input.setAttribute("accent-color", "var(--theme-focus)");
        form.append(input);
        document.body.append(form);

        let submitCount = 0;
        form.addEventListener("submit", (event) => {
            event.preventDefault();
            submitCount++;
        });
        const internalInput = input.shadowRoot?.querySelector("input");
        expect(internalInput).not.toBeNull();
        internalInput?.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "Enter",
                bubbles: true,
                cancelable: true,
            }),
        );

        expect(submitCount).toBe(1);
        const field = input.shadowRoot?.querySelector<HTMLElement>(".field");
        expect(field?.style.getPropertyValue("--cms-input-color")).toBe("#123456");
        expect(field?.style.getPropertyValue("--cms-focus-color")).toBe("var(--theme-focus)");

        const dateInput = document.createElement("basic-input");
        dateInput.setAttribute("name", "birthDate");
        dateInput.setAttribute("type", "date");
        dateInput.setAttribute("date-format", "day-month-year");
        dateInput.setAttribute("value", "1992-04-18");
        form.append(dateInput);
        const internalDateInput = dateInput.shadowRoot?.querySelector<HTMLInputElement>("input");
        expect(internalDateInput?.type).toBe("text");
        expect(internalDateInput?.inputMode).toBe("numeric");
        expect(internalDateInput?.value).toBe("18/04/1992");
        expect((dateInput as HTMLElement & { value: string }).value).toBe("1992-04-18");

        if (internalDateInput) {
            internalDateInput.value = "19/05/1993";
            internalDateInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
        expect((dateInput as HTMLElement & { value: string }).value).toBe("1993-05-19");

        if (internalDateInput) {
            internalDateInput.value = "31/02/1993";
            internalDateInput.dispatchEvent(new Event("input", { bubbles: true }));
        }
        dateInput.dispatchEvent(new Event("invalid"));
        expect(dateInput.shadowRoot?.querySelector(".error")?.textContent).toBe(
            "Enter a valid date in DD/MM/YYYY format.",
        );

        const requiredInput = document.createElement("basic-input");
        requiredInput.setAttribute("required", "");
        document.body.append(requiredInput);
        const error = requiredInput.shadowRoot?.querySelector(".error");
        expect(error?.textContent).toBe("");
        expect(error?.hasAttribute("hidden")).toBe(true);
        requiredInput.dispatchEvent(new Event("invalid"));
        expect((requiredInput as HTMLElement & { showValidation: boolean }).showValidation).toBe(true);
        requiredInput.remove();
        form.remove();
    });
}
