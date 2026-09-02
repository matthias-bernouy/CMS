import { expect, test } from "bun:test";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { decodeSource } from "../source";

export function registerHydrationTest(): void {
    test("loads from the official integration catalog with hydrated bloc sources", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("basic-blocs");

        expect(definition?.kind).toBe("basic-blocs");
        expect(definition?.version).toBe("2.0.0");

        const artifacts = definition?.artifacts ?? [];
        const button = artifacts.find((artifact) => artifact.type === "bloc" && artifact.bloc.tag === "basic-button");
        const card = artifacts.find((artifact) => artifact.type === "bloc" && artifact.bloc.tag === "basic-card");
        const grid = artifacts.find((artifact) => artifact.type === "bloc" && artifact.bloc.tag === "basic-grid");
        const stack = artifacts.find((artifact) => artifact.type === "bloc" && artifact.bloc.tag === "basic-stack");
        const toast = artifacts.find((artifact) => artifact.type === "bloc" && artifact.bloc.tag === "basic-toast");
        const skeleton = artifacts.find(
            (artifact) => artifact.type === "bloc" && artifact.bloc.tag === "basic-skeleton",
        );
        const image = artifacts.find((artifact) => artifact.type === "bloc" && artifact.bloc.tag === "img");
        const pagination = artifacts.find(
            (artifact) => artifact.type === "bloc" && artifact.bloc.tag === "basic-pagination",
        );

        expect(button?.type).toBe("bloc");
        expect(card?.type).toBe("bloc");
        if (button?.type !== "bloc" || card?.type !== "bloc") {
            throw new Error("expected bloc artifacts");
        }

        expect(button.bloc.viewJS).toContain("BE5_TAG_TO_BE_REPLACED");
        expect(button.bloc.source?.["manifest.json"]).toBeTruthy();
        expect(button.bloc.source?.["default.html"]).toBeTruthy();
        expect(card.bloc.editorJS).toContain("BasicCardEditor");
        expect(card.bloc.viewJS).toContain('slot name="media"');
        expect(card.bloc.viewJS).toContain('slot name="actions"');
        expect(card.bloc.editorJS).toContain('attribute: "tone"');
        expect(card.bloc.editorJS).toContain('attribute: "appearance"');
        expect(card.bloc.editorJS).not.toContain("ColorSetting");
        expect(card.bloc.source?.["BlocEditor.ts"]).toBeTruthy();
        expect(grid?.type === "bloc" ? grid.bloc.source?.["template.html"] : undefined).toBeTruthy();
        expect(grid?.type === "bloc" ? grid.bloc.source?.["style.css"] : undefined).toBeTruthy();
        expect(grid?.type === "bloc" ? grid.bloc.editorJS : "").toContain('attribute: "min"');
        expect(grid?.type === "bloc" ? grid.bloc.editorJS : "").toContain('attribute: "max"');
        expect(grid?.type === "bloc" ? grid.bloc.editorJS : "").toContain('attribute: "tone"');
        expect(grid?.type === "bloc" ? grid.bloc.editorJS : "").toContain('attribute: "appearance"');
        expect(grid?.type === "bloc" ? grid.bloc.editorJS : "").not.toContain("Column count");
        expect(stack?.type === "bloc" ? stack.bloc.source?.["style.css"] : undefined).toBeTruthy();
        expect(stack?.type === "bloc" ? stack.bloc.editorJS : "").toContain('attribute: "tone"');
        expect(stack?.type === "bloc" ? stack.bloc.editorJS : "").toContain('attribute: "appearance"');
        expect(stack?.type === "bloc" ? decodeSource(stack.bloc.source?.["style.css"]) : "").toContain(
            ':host([justify-content="space-between"])',
        );
        expect(stack?.type === "bloc" ? stack.bloc.editorJS : "").toContain('attribute: "direction"');
        expect(stack?.type === "bloc" ? stack.bloc.editorJS : "").toContain('attribute: "justify-content"');
        expect(stack?.type === "bloc" ? stack.bloc.editorJS : "").toContain('attribute: "wrap"');
        expect(toast?.type === "bloc" ? toast.bloc.source?.["template.html"] : undefined).toBeTruthy();
        expect(toast?.type === "bloc" ? toast.bloc.source?.["style.css"] : undefined).toBeTruthy();
        expect(toast?.type === "bloc" ? toast.bloc.viewJS : "").not.toContain('setAttribute("aria-live"');
        expect(toast?.type === "bloc" ? toast.bloc.viewJS : "").not.toContain('getAttribute("type")');
        expect(toast?.type === "bloc" ? toast.bloc.viewJS : "").toContain('CustomEvent("basic-toast:dismissed"');
        expect(toast?.type === "bloc" ? toast.bloc.editorJS : "").toContain('attribute: "tone"');
        expect(toast?.type === "bloc" ? toast.bloc.editorJS : "").toContain('attribute: "appearance"');
        expect(toast?.type === "bloc" ? toast.bloc.editorJS : "").toContain('attribute: "position"');
        expect(toast?.type === "bloc" ? toast.bloc.editorJS : "").toContain('attribute: "shadow"');
        expect(toast?.type === "bloc" ? toast.bloc.editorJS : "").toContain('slot: "icon"');
        expect(skeleton?.type === "bloc" ? skeleton.bloc.viewJS : "").toContain("prefers-reduced-motion");
        expect(skeleton?.type === "bloc" ? skeleton.bloc.viewJS : "").toContain('part="surface"');
        expect(skeleton?.type === "bloc" ? skeleton.bloc.editorJS : "").toContain('attribute: "animation"');
        expect(skeleton?.type === "bloc" ? skeleton.bloc.editorJS : "").toContain('attribute: "tone"');
        expect(skeleton?.type === "bloc" ? skeleton.bloc.editorJS : "").toContain('attribute: "appearance"');
        expect(image?.type === "bloc" ? decodeSource(image.bloc.source?.["manifest.json"]) : "").toContain(
            '"runtime": "native"',
        );
        expect(image?.type === "bloc" ? decodeSource(image.bloc.source?.["default.html"]) : "").toContain(
            '<img src="" alt="" loading="lazy" decoding="async">',
        );
        expect(image?.type === "bloc" ? image.bloc.editorJS : "").toContain('attribute: "src"');
        expect(pagination?.type === "bloc" ? decodeSource(pagination.bloc.source?.["template.html"]) : "").toContain(
            "<nav",
        );
        expect(pagination?.type === "bloc" ? decodeSource(pagination.bloc.source?.["style.css"]) : "").toContain(
            ":host",
        );
        expect(pagination?.type === "bloc" ? pagination.bloc.viewJS : "").toContain(
            'CustomEvent("basic-pagination:change"',
        );
        expect(pagination?.type === "bloc" ? pagination.bloc.editorJS : "").toContain('attribute: "tone"');
        expect(pagination?.type === "bloc" ? pagination.bloc.editorJS : "").toContain('attribute: "appearance"');

        const input = artifacts.find((artifact) => artifact.type === "bloc" && artifact.bloc.tag === "basic-input");
        const textarea = artifacts.find(
            (artifact) => artifact.type === "bloc" && artifact.bloc.tag === "basic-textarea",
        );
        const select = artifacts.find((artifact) => artifact.type === "bloc" && artifact.bloc.tag === "basic-select");
        const checkbox = artifacts.find(
            (artifact) => artifact.type === "bloc" && artifact.bloc.tag === "basic-checkbox",
        );
        const fileInput = artifacts.find(
            (artifact) => artifact.type === "bloc" && artifact.bloc.tag === "basic-file-input",
        );
        const form = artifacts.find((artifact) => artifact.type === "bloc" && artifact.bloc.tag === "form");
        const redirect = artifacts.find(
            (artifact) => artifact.type === "bloc" && artifact.bloc.tag === "basic-redirect",
        );
        expect(input?.type === "bloc" ? input.bloc.viewJS : "").toContain("static formAssociated = true");
        expect(input?.type === "bloc" ? input.bloc.viewJS : "").toContain('part="label"');
        expect(input?.type === "bloc" ? input.bloc.viewJS : "").toContain("form.requestSubmit()");
        expect(input?.type === "bloc" ? input.bloc.viewJS : "").toContain(
            ":host([hidden]) { display: none !important; }",
        );
        expect(input?.type === "bloc" ? input.bloc.viewJS : "").toContain("--_field-background");
        expect(input?.type === "bloc" ? input.bloc.viewJS : "").toContain(
            ".field { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; min-inline-size: 0;",
        );
        expect(input?.type === "bloc" ? input.bloc.viewJS : "").toContain(
            "input { box-sizing: border-box; width: auto; inline-size: auto; min-width: 0; min-inline-size: 0; max-width: 100%; max-inline-size: 100%; justify-self: stretch;",
        );
        expect(input?.type === "bloc" ? input.bloc.editorJS : "").toContain("visibleWhen");
        expect(input?.type === "bloc" ? input.bloc.editorJS : "").toContain('attribute: "autocomplete"');
        expect(input?.type === "bloc" ? input.bloc.editorJS : "").toContain('attribute: "tone"');
        expect(input?.type === "bloc" ? input.bloc.editorJS : "").toContain('attribute: "appearance"');
        expect(input?.type === "bloc" ? input.bloc.editorJS : "").not.toContain('type: "color"');
        expect(textarea?.type === "bloc" ? textarea.bloc.viewJS : "").toContain("formDisabledCallback(disabled)");
        expect(textarea?.type === "bloc" ? textarea.bloc.viewJS : "").toContain(':host([appearance="outlined"])');
        expect(textarea?.type === "bloc" ? textarea.bloc.viewJS : "").toContain("--_field-border: var(--_tone-border)");
        expect(select?.type === "bloc" ? select.bloc.viewJS : "").toContain("formDisabledCallback(disabled)");
        expect(select?.type === "bloc" ? select.bloc.viewJS : "").toContain('part="error"');
        expect(select?.type === "bloc" ? select.bloc.viewJS : "").toContain('role="listbox"');
        expect(select?.type === "bloc" ? select.bloc.viewJS : "").toContain('<select class="native-control"');
        expect(select?.type === "bloc" ? select.bloc.viewJS : "").toContain("(hover: none) and (pointer: coarse)");
        expect(select?.type === "bloc" ? select.bloc.viewJS : "").toContain("data-resolved-presentation");
        expect(select?.type === "bloc" ? select.bloc.editorJS : "").toContain('attribute: "accessible-label"');
        expect(select?.type === "bloc" ? select.bloc.editorJS : "").toContain('attribute: "placeholder"');
        expect(select?.type === "bloc" ? select.bloc.editorJS : "").toContain('attribute: "presentation"');
        expect(checkbox?.type === "bloc" ? checkbox.bloc.viewJS : "").toContain(':host([presentation="switch"])');
        expect(checkbox?.type === "bloc" ? checkbox.bloc.viewJS : "").toContain("formDisabledCallback(disabled)");
        expect(checkbox?.type === "bloc" ? checkbox.bloc.viewJS : "").toContain(
            "this.checked ? this.value : this.uncheckedValue",
        );
        expect(checkbox?.type === "bloc" ? checkbox.bloc.editorJS : "").toContain(
            '{ label: "Switch", value: "switch" }',
        );
        expect(fileInput?.type === "bloc" ? fileInput.bloc.viewJS : "").toContain("static formAssociated = true");
        expect(fileInput?.type === "bloc" ? fileInput.bloc.viewJS : "").toContain("data.append(this.name, file)");
        expect(fileInput?.type === "bloc" ? fileInput.bloc.viewJS : "").toContain('slot name="preview"');
        expect(fileInput?.type === "bloc" ? fileInput.bloc.viewJS : "").toContain('className = "selected-preview"');
        expect(fileInput?.type === "bloc" ? fileInput.bloc.viewJS : "").toContain("URL.createObjectURL(file)");
        expect(fileInput?.type === "bloc" ? fileInput.bloc.viewJS : "").toContain(':host([preview-shape="circle"])');
        expect(fileInput?.type === "bloc" ? fileInput.bloc.viewJS : "").toContain("this.showValidation");
        expect(fileInput?.type === "bloc" ? fileInput.bloc.editorJS : "").toContain('attribute: "accept"');
        expect(fileInput?.type === "bloc" ? fileInput.bloc.editorJS : "").toContain('slot: "preview"');
        expect(form?.type === "bloc" ? form.bloc.editorJS : "").toContain("BasicFormEditor");
        expect(form?.type === "bloc" ? form.bloc.editorJS : "").toContain("cms-source-success-redirect");
        expect(form?.type === "bloc" ? form.bloc.editorJS : "").not.toContain('label: "Method"');
        expect(form?.type === "bloc" ? decodeSource(form.bloc.source?.["default.html"]) : "").toContain(
            '<basic-button><button type="submit">Envoyer</button></basic-button>',
        );
        expect(redirect?.type === "bloc" ? redirect.bloc.editorJS : "").toContain('type: "page-link"');
        expect(redirect?.type === "bloc" ? redirect.bloc.viewJS : "").toContain("anchor.click()");
        expect(button.bloc.editorJS).not.toContain('attribute: "href"');
        expect(button.bloc.editorJS).not.toContain('attribute: "type"');
        expect(button.bloc.editorJS).toContain('{ kind: "component", tag: "a" }');
        expect(button.bloc.editorJS).toContain('{ kind: "component", tag: "button" }');
        expect(button.bloc.editorJS).toContain('attribute: "tone"');
        expect(button.bloc.editorJS).toContain('attribute: "appearance"');
        expect(button.bloc.editorJS).toContain('slot: "icon-start"');
        expect(button.bloc.editorJS).toContain('slot: "icon-end"');
        expect(decodeSource(button.bloc.source?.["colorSchemes.ts"])).toContain('role("action-background"');
        expect(decodeSource(button.bloc.source?.["style.css"])).toContain("--_button-background: var(--_tone-base)");
        expect(button.bloc.viewJS).not.toContain("requestFormSubmit");
        expect(button.bloc.viewJS).not.toContain("formAssociated");

        const chip = artifacts.find((artifact) => artifact.type === "bloc" && artifact.bloc.tag === "basic-chip");
        const chipGroup = artifacts.find(
            (artifact) => artifact.type === "bloc" && artifact.bloc.tag === "basic-chip-group",
        );
        expect(chip?.type === "bloc" ? chip.bloc.viewJS : "").toContain("var(--primary-base, CanvasText)");
        expect(chip?.type === "bloc" ? chip.bloc.viewJS : "").toContain(
            "var(--primary-foreground, var(--primary-contrasted, Canvas))",
        );
        expect(chipGroup?.type === "bloc" ? chipGroup.bloc.viewJS : "").toContain("formDisabledCallback(disabled)");
        expect(chipGroup?.type === "bloc" ? chipGroup.bloc.viewJS : "").toContain('part="error"');
        expect(chipGroup?.type === "bloc" ? chipGroup.bloc.editorJS : "").toContain('attribute: "accessible-label"');
        expect(chipGroup?.type === "bloc" ? chipGroup.bloc.editorJS : "").toContain('attribute: "tone"');
        expect(chipGroup?.type === "bloc" ? chipGroup.bloc.editorJS : "").toContain('attribute: "appearance"');
    });
}
