import { expect, test } from "bun:test";
import { File } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { executeEditorBundle } from "../catalog/support";
import { decodeDefaultContent, decodeSource } from "../source";

export function registerButtonTest(): void {
    test("button presents one direct native interactive control without owning its semantics", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("ulvia");
        const artifact = definition?.artifacts?.find(
            (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "basic-button",
        );
        if (!artifact || artifact.type !== "bloc") {
            throw new Error("expected basic-button artifact");
        }
        const bloc = artifact.bloc;
        const editorSource = decodeSource(bloc.source?.["BlocEditor.ts"]);
        expect(editorSource).toContain('attribute: "tone"');
        expect(editorSource).not.toContain("ColorSetting");
        expect(decodeDefaultContent(bloc.source)).toBe(
            '<basic-button tone="primary" appearance="filled"><button type="button">Button</button></basic-button>\n',
        );
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
        const registration = executeEditorBundle(built.editorJS);
        const editor = new registration.editor(document.createElement("basic-button"));
        const settings = editor.getSettings().flatMap((section) => section.settings);
        expect(settings.map(({ attribute }) => attribute)).toEqual(["tone", "appearance", "size", "width", "align"]);
        expect(editor.getContentSlots()).toEqual([
            {
                label: "Leading icon",
                slot: "icon-start",
                accepts: [{ kind: "media", accept: ["svg"] }],
                max: 1,
            },
            {
                label: "Interactive control",
                accepts: [
                    { kind: "component", tag: "a" },
                    { kind: "component", tag: "button" },
                ],
                min: 1,
                max: 1,
            },
            {
                label: "Trailing icon",
                slot: "icon-end",
                accepts: [{ kind: "media", accept: ["svg"] }],
                max: 1,
            },
        ]);
        new Function(built.viewJS)();

        const form = document.createElement("form");
        const wrapper = document.createElement("basic-button");
        wrapper.setAttribute("tone", "danger");
        wrapper.setAttribute("appearance", "soft");
        wrapper.setAttribute("size", "lg");
        wrapper.setAttribute("width", "full");
        wrapper.setAttribute("align", "left");
        const nativeButton = document.createElement("button");
        nativeButton.type = "submit";
        nativeButton.name = "subscribed";
        nativeButton.value = "true";
        nativeButton.textContent = "Save";
        const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        icon.setAttribute("slot", "icon-end");
        wrapper.append(nativeButton, icon);
        form.append(wrapper);
        document.body.append(form);

        expect(wrapper.shadowRoot?.querySelectorAll("button, a")).toHaveLength(0);
        expect(wrapper.shadowRoot?.querySelector('slot[name="icon-start"]')).not.toBeNull();
        expect(wrapper.shadowRoot?.querySelector('slot[name="icon-end"]')).not.toBeNull();
        expect(wrapper.querySelector(":scope > button")).toBe(nativeButton);
        expect(wrapper.querySelector(':scope > svg[slot="icon-end"]')).toBe(icon);
        expect(icon.getAttribute("aria-hidden")).toBe("true");
        expect(icon.getAttribute("focusable")).toBe("false");
        expect(nativeButton.type).toBe("submit");
        expect(nativeButton.name).toBe("subscribed");
        expect(nativeButton.value).toBe("true");
        nativeButton.disabled = true;
        expect(nativeButton.disabled).toBeTrue();

        const styles = wrapper.shadowRoot?.querySelector("style")?.textContent ?? "";
        for (const tone of ["primary", "secondary", "neutral", "info", "success", "warning", "danger"]) {
            expect(styles).toContain(`:host([tone="${tone}"])`);
        }
        expect(styles).toContain("::slotted(a)");
        expect(styles).toContain("::slotted(button)");
        expect(styles).toContain("::slotted(button:disabled)");
        expect(styles).toContain("color: var(--cms-button-color, var(--_button-color)) !important");
        expect(styles).toContain("font-weight: var(--cms-button-font-weight, 700) !important");
        expect(styles).toContain("line-height: 1.2 !important");
        expect(styles).toContain("text-decoration: none !important");
        expect(styles).toContain("var(--cms-button-background, var(--_tone-base)) 88%");
        expect(styles).toContain("var(--cms-button-color, var(--_button-color)) 10%");
        expect(styles).toContain(
            "var(--cms-button-min-height, var(--integration-ulvia-basic-blocs-action-min-height, 2.5rem))",
        );
        expect(styles).toContain(':host([appearance="soft"])');
        expect(styles).toContain("prefers-reduced-motion: reduce");
        expect(styles).toContain('::slotted(svg[slot="icon-start"])');
        expect(styles).toContain(":host([has-icon-end]) ::slotted(button)");
        expect(styles).not.toContain("--primary-base");
        form.remove();
    });
}
