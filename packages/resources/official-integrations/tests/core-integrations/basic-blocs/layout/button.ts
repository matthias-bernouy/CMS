import { expect, test } from "bun:test";
import { File } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { executeEditorBundle } from "../catalog/support";
import { decodeDefaultContent, decodeSource } from "../source";

export function registerButtonTest(): void {
    test("button combines semantic tones with appearance recipes and preserves its behavior", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("basic-blocs");
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
            '<basic-button tone="primary" appearance="filled">Button</basic-button>\n',
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
        const actionSettings = editor.getSettings().find(({ label }) => label === "Action")?.settings ?? [];
        const action = actionSettings.find(({ attribute }) => attribute === "action");
        const target = actionSettings.find(({ attribute }) => attribute === "href");
        expect(action).toMatchObject({
            type: "segmented",
            label: "Action",
            options: [
                { label: "Button", value: "button" },
                { label: "Submit", value: "submit" },
                { label: "Reset", value: "reset" },
                { label: "Link", value: "link" },
            ],
        });
        expect(target).toMatchObject({
            type: "page-link",
            label: "Target",
            allowPage: true,
            allowExternal: true,
            allowMedia: true,
            visibleWhen: { attribute: "action", equals: "link" },
        });
        expect(actionSettings.some(({ attribute }) => attribute === "type")).toBeFalse();
        new Function(built.viewJS)();

        const form = document.createElement("form");
        const button = document.createElement("basic-button");
        button.setAttribute("action", "submit");
        button.setAttribute("name", "subscribed");
        button.setAttribute("value", "true");
        button.setAttribute("tone", "danger");
        button.setAttribute("appearance", "soft");
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
        expect(button.shadowRoot?.querySelector("button")?.type).toBe("submit");
        expect(submitCount).toBe(1);
        expect(formValues).toEqual(["true", null]);
        expect(form.querySelector("[data-basic-button-submitter]")).toBeNull();
        expect(button.shadowRoot?.querySelector('[part="icon-left"]')?.hasAttribute("hidden")).toBe(false);
        expect(button.shadowRoot?.textContent).toContain(':host([width="full"])');
        const styles = button.shadowRoot?.querySelector("style")?.textContent ?? "";
        for (const tone of ["primary", "secondary", "neutral", "info", "success", "warning", "danger"]) {
            expect(styles).toContain(`:host([tone="${tone}"])`);
        }
        expect(styles).toContain("--_tone-base: var(--integration-basic-blocs-danger-base, CanvasText)");
        expect(styles).toContain(':host([appearance="soft"])');
        expect(styles).toContain("--_button-background: var(--_tone-muted)");
        expect(styles).not.toContain("--primary-base");
        form.remove();
    });
}
