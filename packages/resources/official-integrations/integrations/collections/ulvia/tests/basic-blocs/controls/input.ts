import { expect, test } from "bun:test";
import { File } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { decodeDefaultContent } from "../source";

export function registerInputTest(): void {
    test("submits Basic inputs and preserves field-level visual overrides", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("ulvia");
        const artifacts =
            definition?.artifacts?.filter(
                (artifact) => artifact.type === "bloc" && ["basic-input", "basic-textarea"].includes(artifact.bloc.tag),
            ) ?? [];
        expect(artifacts).toHaveLength(2);
        for (const artifact of artifacts) {
            if (artifact.type !== "bloc") {
                continue;
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
        }

        const form = document.createElement("form");
        const input = document.createElement("basic-input");
        input.setAttribute("name", "query");
        input.setAttribute("tone", "danger");
        input.setAttribute("appearance", "soft");
        input.setAttribute("accent-color", "tomato");
        input.setAttribute("background-color", "ivory");
        input.setAttribute("border-color", "sienna");
        input.setAttribute("text-color", "navy");
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
        const styles = input.shadowRoot?.querySelector("style")?.textContent;
        expect(styles).toContain(':host([tone="danger"])');
        expect(styles).toContain(':host([appearance="soft"])');
        expect(styles).toContain("--_field-background: var(--_tone-muted)");
        expect(styles).toContain(':host([appearance="outlined"])');
        expect(styles).toContain("--_field-border: var(--_tone-border)");
        expect(styles).toContain("--_field-color: var(--_tone-contrasted)");
        const fieldStyle = input.shadowRoot?.querySelector<HTMLElement>(".field")?.style;
        expect(fieldStyle?.getPropertyValue("--cms-focus-color")).toBe("tomato");
        expect(fieldStyle?.getPropertyValue("--cms-input-background")).toBe("ivory");
        expect(fieldStyle?.getPropertyValue("--cms-input-border-color")).toBe("sienna");
        expect(fieldStyle?.getPropertyValue("--cms-input-color")).toBe("navy");

        const textarea = document.createElement("basic-textarea");
        textarea.setAttribute("accent-color", "gold");
        textarea.setAttribute("background-color", "linen");
        textarea.setAttribute("border-color", "brown");
        textarea.setAttribute("text-color", "maroon");
        form.append(textarea);
        const textareaStyle = textarea.shadowRoot?.querySelector<HTMLElement>(".field")?.style;
        expect(textareaStyle?.getPropertyValue("--cms-focus-color")).toBe("gold");
        expect(textareaStyle?.getPropertyValue("--cms-input-background")).toBe("linen");
        expect(textareaStyle?.getPropertyValue("--cms-input-border-color")).toBe("brown");
        expect(textareaStyle?.getPropertyValue("--cms-input-color")).toBe("maroon");

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
