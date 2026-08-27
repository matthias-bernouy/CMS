import { expect, test } from "bun:test";
import { File } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { decodeDefaultContent } from "../source";

export function registerChipTest(): void {
    test("keeps user chip selections after applying a dynamic default value", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("basic-blocs");
        const artifacts =
            definition?.artifacts?.filter(
                (artifact) =>
                    artifact.type === "bloc" && ["basic-chip", "basic-chip-group"].includes(artifact.bloc.tag),
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

        const group = document.createElement("basic-chip-group") as HTMLElement & {
            value: string[];
            formDisabledCallback(disabled: boolean): void;
        };
        group.setAttribute("name", "level");
        group.setAttribute("mode", "multiple");
        group.setAttribute("accessible-label", "Playing level");
        Object.defineProperty(group, "value", {
            configurable: true,
            value: ["club"],
            writable: true,
        });
        group.setAttribute("tone", "success");
        group.setAttribute("appearance", "soft");
        group.setAttribute("accent-color", "tomato");
        group.setAttribute("background-color", "ivory");
        group.setAttribute("border-color", "sienna");
        group.setAttribute("selected-background-color", "gold");
        group.setAttribute("selected-text-color", "maroon");
        group.setAttribute("text-color", "navy");
        const club = document.createElement("basic-chip");
        club.setAttribute("value", "club");
        const professional = document.createElement("basic-chip");
        professional.setAttribute("value", "pro");
        group.append(club, professional);
        document.body.append(group);

        professional.shadowRoot?.querySelector("button")?.click();
        await Promise.resolve();

        expect(group.value).toEqual(["club", "pro"]);
        expect(professional.hasAttribute("selected")).toBe(true);
        const choices = group.shadowRoot?.querySelector<HTMLElement>(".choices");
        const styles = group.shadowRoot?.querySelector("style")?.textContent;
        expect(styles).toContain(':host([tone="success"])');
        expect(styles).toContain(':host([appearance="soft"])');
        expect(styles).toContain("--cms-chip-selected-background: var(--_tone-muted)");
        expect(choices?.getAttribute("aria-label")).toBe("Playing level");
        expect(group.style.getPropertyValue("--cms-chip-background")).toBe("ivory");
        expect(group.style.getPropertyValue("--cms-chip-border-color")).toBe("sienna");
        expect(group.style.getPropertyValue("--cms-chip-color")).toBe("navy");
        expect(group.style.getPropertyValue("--cms-chip-selected-background")).toBe("gold");
        expect(group.style.getPropertyValue("--cms-chip-selected-border")).toBe("gold");
        expect(group.style.getPropertyValue("--cms-chip-selected-color")).toBe("maroon");
        expect(group.style.getPropertyValue("--cms-focus-color")).toBe("tomato");
        group.formDisabledCallback(true);
        expect(group.hasAttribute("disabled")).toBe(true);

        const requiredGroup = document.createElement("basic-chip-group") as HTMLElement & {
            showValidation: boolean;
        };
        requiredGroup.setAttribute("name", "required-choice");
        requiredGroup.setAttribute("required", "");
        const requiredChip = document.createElement("basic-chip");
        requiredChip.setAttribute("value", "one");
        requiredChip.textContent = "One";
        requiredGroup.append(requiredChip);
        document.body.append(requiredGroup);
        const error = requiredGroup.shadowRoot?.querySelector(".error");
        expect(error?.textContent).toBe("");
        expect(error?.hasAttribute("hidden")).toBe(true);
        requiredGroup.dispatchEvent(new Event("invalid"));
        expect(requiredGroup.showValidation).toBe(true);
        expect(error?.textContent).toBe("Select at least one option.");
        requiredGroup.remove();
        group.remove();
    });
}
