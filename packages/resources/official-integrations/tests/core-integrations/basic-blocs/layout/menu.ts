import { File } from "node:buffer";
import { expect, test } from "bun:test";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { Component } from "@bernouy/components/base";
import { executeEditorBundle } from "../catalog/support";
import { decodeDefaultContent, decodeSource } from "../source";

export function registerMenuTest(): void {
    test("menu resolves an editable button and owns its accessible state", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("basic-blocs");
        const artifact = definition?.artifacts?.find(
            (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "basic-menu",
        );
        if (!artifact || artifact.type !== "bloc") {
            throw new Error("expected basic-menu artifact");
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
        const runtime = window as typeof window & { p9r?: { Component?: typeof Component } };
        runtime.p9r ??= {};
        runtime.p9r.Component = Component;
        if (!customElements.get("basic-menu")) {
            new Function(built.viewJS)();
        }

        const menu = document.createElement("basic-menu") as HTMLElement & { open: boolean };
        menu.id = "test-menu";
        menu.innerHTML = `
            <basic-button slot="trigger"><button type="button">Open menu</button></basic-button>
            <a slot="navigation" href="#menu">Menu</a>
        `;
        document.body.append(menu);
        const trigger = menu.querySelector("button")!;

        expect(trigger.getAttribute("aria-controls")).toBe("test-menu");
        expect(trigger.getAttribute("aria-expanded")).toBe("false");
        expect(trigger.getAttribute("aria-haspopup")).toBe("dialog");
        trigger.click();
        expect(menu.open).toBe(true);
        expect(trigger.getAttribute("aria-expanded")).toBe("true");
        expect(menu.shadowRoot?.querySelector('[part="panel"]')?.getAttribute("aria-hidden")).toBe("false");
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        expect(menu.open).toBe(false);
        expect(trigger.getAttribute("aria-expanded")).toBe("false");
        expect(document.activeElement).toBe(trigger);

        const registration = executeEditorBundle(built.editorJS);
        const editor = new registration.editor!(menu);
        expect(editor.getContentSlots()[0]).toMatchObject({
            slot: "trigger",
            min: 1,
            max: 1,
            accepts: [
                { kind: "component", tag: "basic-button" },
                { kind: "component", tag: "button" },
            ],
        });
        expect(decodeSource(bloc.source?.["styles/base.css"])).not.toContain("--cms-button-");
        menu.remove();
    });
}
