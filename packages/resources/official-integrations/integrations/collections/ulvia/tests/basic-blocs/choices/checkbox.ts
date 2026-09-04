import { expect, test } from "bun:test";
import { File } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { decodeDefaultContent } from "../source";

export function registerCheckboxTest(): void {
    test("checkbox supports bound boolean state and themeable custom visuals", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("ulvia");
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
        checkbox.setAttribute("tone", "warning");
        checkbox.setAttribute("appearance", "soft");
        checkbox.setAttribute("required", "");
        checkbox.setAttribute("accent-color", "tomato");
        checkbox.setAttribute("background-color", "ivory");
        checkbox.setAttribute("border-color", "sienna");
        checkbox.setAttribute("check-color", "white");
        checkbox.setAttribute("text-color", "navy");
        const form = document.createElement("form");
        form.append(checkbox);
        document.body.append(form);

        const control = checkbox.shadowRoot?.querySelector<HTMLInputElement>("input");
        expect(checkbox.checked).toBe(false);
        expect(control?.checked).toBe(false);
        const styles = checkbox.shadowRoot?.querySelector("style")?.textContent;
        expect(styles).toContain(':host([tone="warning"])');
        expect(styles).toContain(':host([appearance="soft"])');
        expect(styles).toContain("--_checkbox-checked-background: var(--_tone-muted)");
        expect(checkbox.shadowRoot?.querySelector(".error")?.textContent).toBe("");
        expect(checkbox.style.getPropertyValue("--cms-accent-color")).toBe("tomato");
        expect(checkbox.style.getPropertyValue("--cms-checkbox-background")).toBe("ivory");
        expect(checkbox.style.getPropertyValue("--cms-checkbox-border")).toBe("sienna");
        expect(checkbox.style.getPropertyValue("--cms-checkbox-check-color")).toBe("white");
        expect(checkbox.style.getPropertyValue("--cms-input-color")).toBe("navy");

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
        switchControl.setAttribute("presentation", "switch");
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
