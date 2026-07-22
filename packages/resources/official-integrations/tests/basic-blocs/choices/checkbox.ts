import { expect, test } from "bun:test";
import { File } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { decodeDefaultContent } from "../source";

export function registerCheckboxTest(): void {
    test("checkbox supports bound boolean state and themeable custom visuals", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("basic-blocs");
        const artifact = definition?.artifacts?.find(
            (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "basic-checkbox",
        );
        if (!artifact || artifact.type !== "bloc") {
            throw new Error("expected basic-checkbox artifact");
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

        const checkbox = document.createElement("basic-checkbox") as HTMLElement & { checked: boolean };
        checkbox.setAttribute("name", "notifications");
        checkbox.setAttribute("value", "true");
        checkbox.setAttribute("unchecked-value", "false");
        checkbox.setAttribute("checked-state", "false");
        checkbox.setAttribute("background-color", "#ffffff");
        checkbox.setAttribute("border-color", "#dddddd");
        checkbox.setAttribute("accent-color", "#a85424");
        checkbox.setAttribute("check-color", "#ffffff");
        checkbox.setAttribute("required", "");
        const form = document.createElement("form");
        form.append(checkbox);
        document.body.append(form);

        const control = checkbox.shadowRoot?.querySelector<HTMLInputElement>("input");
        const label = checkbox.shadowRoot?.querySelector<HTMLElement>("label");
        expect(checkbox.checked).toBe(false);
        expect(control?.checked).toBe(false);
        expect(label?.style.getPropertyValue("--cms-checkbox-background")).toBe("#ffffff");
        expect(label?.style.getPropertyValue("--cms-checkbox-border")).toBe("#dddddd");
        expect(label?.style.getPropertyValue("--cms-checkbox-check-color")).toBe("#ffffff");
        expect(checkbox.shadowRoot?.querySelector(".error")?.textContent).toBe("");

        checkbox.setAttribute("checked-state", "true");
        expect(checkbox.checked).toBe(true);
        expect(control?.checked).toBe(true);

        const switchControl = document.createElement("basic-checkbox") as HTMLElement & {
            checked: boolean;
            formDisabledCallback(disabled: boolean): void;
        };
        Object.defineProperty(switchControl, "checked", {
            configurable: true,
            value: true,
            writable: true,
        });
        switchControl.setAttribute("appearance", "switch");
        switchControl.setAttribute("accessible-label", "Enable notifications");
        document.body.append(switchControl);
        const internalSwitch = switchControl.shadowRoot?.querySelector<HTMLInputElement>("input");
        expect(switchControl.checked).toBe(true);
        expect(internalSwitch?.checked).toBe(true);
        expect(internalSwitch?.getAttribute("role")).toBe("switch");
        expect(internalSwitch?.getAttribute("aria-label")).toBe("Enable notifications");
        switchControl.formDisabledCallback(true);
        expect(switchControl.hasAttribute("disabled")).toBe(true);
        switchControl.remove();
        form.remove();
    });
}
