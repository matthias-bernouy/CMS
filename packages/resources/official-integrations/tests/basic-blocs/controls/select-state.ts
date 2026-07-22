import { expect, test } from "bun:test";
import { File } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { decodeDefaultContent } from "../source";

export function registerSelectStateTest(): void {
    test("select mirrors Basic options and participates in form state", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("basic-blocs");
        const artifacts =
            definition?.artifacts?.filter(
                (artifact) => artifact.type === "bloc" && ["basic-option", "basic-select"].includes(artifact.bloc.tag),
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

        const select = document.createElement("basic-select") as HTMLElement & {
            value: string;
            formDisabledCallback(disabled: boolean): void;
            showValidation: boolean;
        };
        Object.defineProperty(select, "value", {
            configurable: true,
            value: "good",
            writable: true,
        });
        select.setAttribute("label", "Condition");
        select.setAttribute("name", "condition");
        select.setAttribute("required", "");
        const placeholder = document.createElement("basic-option");
        placeholder.setAttribute("value", "");
        placeholder.textContent = "All conditions";
        const good = document.createElement("basic-option");
        good.setAttribute("value", "good");
        good.textContent = "Good";
        select.append(placeholder, good);
        document.body.append(select);
        await Promise.resolve();

        const control = select.shadowRoot?.querySelector<HTMLButtonElement>(".control");
        const listbox = select.shadowRoot?.querySelector<HTMLElement>(".listbox");
        const optionButtons = () => Array.from(select.shadowRoot?.querySelectorAll<HTMLButtonElement>(".option") ?? []);
        const error = select.shadowRoot?.querySelector(".error");
        const nativeControl = select.shadowRoot?.querySelector<HTMLSelectElement>(".native-control");
        expect(nativeControl?.tagName).toBe("SELECT");
        expect(select.getAttribute("data-resolved-presentation")).toBe("custom");
        expect(select.shadowRoot?.querySelector<HTMLElement>(".custom-shell")?.hidden).toBe(false);
        expect(select.shadowRoot?.querySelector<HTMLElement>(".native-shell")?.hidden).toBe(true);
        expect(nativeControl?.disabled).toBe(true);
        expect(optionButtons()).toHaveLength(2);
        expect(select.shadowRoot?.querySelector(".label")?.textContent).toBe("Condition");
        expect(error?.textContent).toBe("");
        expect(error?.hasAttribute("hidden")).toBe(true);

        expect(select.value).toBe("good");
        expect(select.shadowRoot?.querySelector(".value")?.textContent).toBe("Good");
        control?.click();
        expect(listbox?.hasAttribute("hidden")).toBe(false);
        expect(control?.getAttribute("aria-expanded")).toBe("true");
        optionButtons()[0]?.click();
        expect(select.value).toBe("");
        expect(select.shadowRoot?.querySelector(".value")?.textContent).toBe("All conditions");
        expect(listbox?.hasAttribute("hidden")).toBe(true);
        expect(control?.getAttribute("aria-invalid")).toBe("false");
        select.dispatchEvent(new Event("invalid"));
        expect(select.showValidation).toBe(true);
        expect(error?.textContent).toBe("Select an option.");
        expect(control?.getAttribute("aria-invalid")).toBe("true");
        control?.click();
        optionButtons()[1]?.click();
        expect(select.value).toBe("good");
        expect(error?.textContent).toBe("");
        select.formDisabledCallback(true);
        expect(select.hasAttribute("disabled")).toBe(true);
        expect(control?.disabled).toBe(true);
        expect(nativeControl?.disabled).toBe(true);

        const multipleSelect = document.createElement("basic-select") as HTMLElement & {
            value: string[];
        };
        multipleSelect.setAttribute("multiple", "");
        multipleSelect.setAttribute("name", "brands");
        for (const value of ["head", "wilson"]) {
            const option = document.createElement("basic-option");
            option.setAttribute("value", value);
            option.textContent = value;
            multipleSelect.append(option);
        }
        document.body.append(multipleSelect);
        multipleSelect.value = ["head", "wilson"];
        expect(multipleSelect.value).toEqual(["head", "wilson"]);
        multipleSelect.shadowRoot?.querySelector<HTMLButtonElement>(".control")?.click();
        multipleSelect.shadowRoot?.querySelector<HTMLButtonElement>(".option")?.click();
        expect(multipleSelect.value).toEqual(["wilson"]);
        expect(multipleSelect.shadowRoot?.querySelector(".listbox")?.hasAttribute("hidden")).toBe(false);
        multipleSelect.shadowRoot?.querySelector(".listbox")?.dispatchEvent(
            new KeyboardEvent("keydown", {
                key: "Escape",
                bubbles: true,
                cancelable: true,
            }),
        );
        expect(multipleSelect.shadowRoot?.querySelector(".listbox")?.hasAttribute("hidden")).toBe(true);
        multipleSelect.remove();
        select.remove();
    });
}
