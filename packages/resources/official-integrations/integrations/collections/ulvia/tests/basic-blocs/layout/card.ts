import { expect, test } from "bun:test";
import { File } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { decodeDefaultContent } from "../source";

export function registerCardTest(): void {
    test("card exposes generic regions, semantic styles, and scoped integration overrides", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("ulvia");
        const artifact = definition?.artifacts?.find(
            (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "basic-card",
        );
        if (!artifact || artifact.type !== "bloc") {
            throw new Error("expected basic-card artifact");
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

        const card = document.createElement("basic-card");
        card.setAttribute("tone", "danger");
        card.setAttribute("appearance", "soft");
        card.setAttribute("elevation", "elevated");
        card.setAttribute("density", "spacious");
        card.setAttribute("stretch", "true");
        card.setAttribute("text-color", "#201810");
        card.setAttribute("muted-text-color", "#75695f");
        card.setAttribute("background-color", "#ffffff");
        card.setAttribute("border-color", "#ded8d1");
        const title = document.createElement("h2");
        title.slot = "title";
        const action = document.createElement("button");
        action.slot = "actions";
        card.append(title, document.createElement("p"), action);
        document.body.append(card);

        const surface = card.shadowRoot?.querySelector<HTMLElement>('[part="card"]');
        expect(surface?.style.getPropertyValue("--cms-card-color")).toBe("#201810");
        expect(surface?.style.getPropertyValue("--cms-card-muted-color")).toBe("#75695f");
        expect(surface?.style.getPropertyValue("--cms-card-background")).toBe("#ffffff");
        expect(surface?.style.getPropertyValue("--cms-card-border-color")).toBe("#ded8d1");
        expect(card.shadowRoot?.querySelector('slot[name="title"]')).not.toBeNull();
        expect(card.shadowRoot?.querySelector('slot[name="actions"]')).not.toBeNull();
        expect(card.shadowRoot?.textContent).toContain(':host([tone="danger"])');
        expect(card.shadowRoot?.textContent).toContain(':host([appearance="soft"])');
        expect(card.shadowRoot?.textContent).toContain(':host([appearance="ghost"])');
        expect(card.shadowRoot?.textContent).toContain("--_card-color: var(--_tone-contrasted)");
        expect(card.shadowRoot?.textContent).toContain(':host([elevation="elevated"])');
        expect(card.shadowRoot?.textContent).toContain(':host([density="spacious"])');
        expect(card.shadowRoot?.textContent).toContain(':host([stretch]:not([stretch="false"]))');
        expect(bloc.editorJS).toContain('attribute: "stretch"');
        expect(bloc.editorJS).toContain('attribute: "tone"');
        expect(bloc.editorJS).not.toContain("background-color");
        card.remove();
    });
}
