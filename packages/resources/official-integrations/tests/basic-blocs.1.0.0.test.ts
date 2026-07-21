import { describe, expect, test } from "bun:test";
import { Buffer } from "node:buffer";
import { File } from "node:buffer";
import { isNativeBlocTag, prepare_bloc, validateBloc } from "@bernouy/cms-bloc-compile";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { Component } from "@bernouy/components/base";

describe("basic-blocs 1.0.0", () => {
    test("loads from the official integration catalog with hydrated bloc sources", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("basic-blocs");

        expect(definition?.kind).toBe("basic-blocs");
        expect(definition?.version).toBe("1.0.0");

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
        expect(card.bloc.editorJS).toContain('attribute: "appearance"');
        expect(card.bloc.editorJS).toContain('color("Background", "background-color")');
        expect(card.bloc.source?.["BlocEditor.ts"]).toBeTruthy();
        expect(grid?.type === "bloc" ? grid.bloc.source?.["template.html"] : undefined).toBeTruthy();
        expect(grid?.type === "bloc" ? grid.bloc.source?.["style.css"] : undefined).toBeTruthy();
        expect(grid?.type === "bloc" ? grid.bloc.editorJS : "").toContain('attribute: "min"');
        expect(grid?.type === "bloc" ? grid.bloc.editorJS : "").toContain('attribute: "max"');
        expect(grid?.type === "bloc" ? grid.bloc.editorJS : "").toContain('color("Background", "background-color")');
        expect(grid?.type === "bloc" ? grid.bloc.editorJS : "").not.toContain("Column count");
        expect(stack?.type === "bloc" ? stack.bloc.source?.["style.css"] : undefined).toBeTruthy();
        expect(stack?.type === "bloc" ? stack.bloc.editorJS : "").toContain('color("Text", "text-color")');
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
        expect(toast?.type === "bloc" ? toast.bloc.editorJS : "").toContain('color("Close button", "close-color")');
        expect(toast?.type === "bloc" ? toast.bloc.editorJS : "").toContain('attribute: "position"');
        expect(toast?.type === "bloc" ? toast.bloc.editorJS : "").toContain('attribute: "shadow"');
        expect(toast?.type === "bloc" ? toast.bloc.editorJS : "").toContain('slot: "icon"');
        expect(skeleton?.type === "bloc" ? skeleton.bloc.viewJS : "").toContain("prefers-reduced-motion");
        expect(skeleton?.type === "bloc" ? skeleton.bloc.viewJS : "").toContain('part="surface"');
        expect(skeleton?.type === "bloc" ? skeleton.bloc.editorJS : "").toContain('attribute: "animation"');
        expect(skeleton?.type === "bloc" ? skeleton.bloc.editorJS : "").toContain('color("Base", "base-color")');
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
        expect(input?.type === "bloc" ? input.bloc.viewJS : "").toContain(
            ":host { display: block; box-sizing: border-box; min-width: 0; min-inline-size: 0; max-width: 100%; max-inline-size: 100%;",
        );
        expect(input?.type === "bloc" ? input.bloc.viewJS : "").toContain(
            ".field { display: grid; grid-template-columns: minmax(0, 1fr); min-width: 0; min-inline-size: 0;",
        );
        expect(input?.type === "bloc" ? input.bloc.viewJS : "").toContain(
            "input { box-sizing: border-box; width: auto; inline-size: auto; min-width: 0; min-inline-size: 0; max-width: 100%; max-inline-size: 100%; justify-self: stretch;",
        );
        expect(input?.type === "bloc" ? input.bloc.editorJS : "").toContain("visibleWhen");
        expect(input?.type === "bloc" ? input.bloc.editorJS : "").toContain('attribute: "autocomplete"');
        expect(input?.type === "bloc" ? input.bloc.editorJS : "").toContain('type: "color"');
        expect(textarea?.type === "bloc" ? textarea.bloc.viewJS : "").toContain("formDisabledCallback(disabled)");
        expect(select?.type === "bloc" ? select.bloc.viewJS : "").toContain("formDisabledCallback(disabled)");
        expect(select?.type === "bloc" ? select.bloc.viewJS : "").toContain('part="error"');
        expect(select?.type === "bloc" ? select.bloc.viewJS : "").toContain('role="listbox"');
        expect(select?.type === "bloc" ? select.bloc.viewJS : "").toContain('<select class="native-control"');
        expect(select?.type === "bloc" ? select.bloc.viewJS : "").toContain("(hover: none) and (pointer: coarse)");
        expect(select?.type === "bloc" ? select.bloc.viewJS : "").toContain("data-resolved-presentation");
        expect(select?.type === "bloc" ? select.bloc.editorJS : "").toContain('attribute: "accessible-label"');
        expect(select?.type === "bloc" ? select.bloc.editorJS : "").toContain('attribute: "placeholder"');
        expect(select?.type === "bloc" ? select.bloc.editorJS : "").toContain('attribute: "presentation"');
        expect(checkbox?.type === "bloc" ? checkbox.bloc.viewJS : "").toContain(':host([appearance="switch"])');
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
        expect(redirect?.type === "bloc" ? redirect.bloc.editorJS : "").toContain('type: "page-link"');
        expect(redirect?.type === "bloc" ? redirect.bloc.viewJS : "").toContain("anchor.click()");
        expect(button.bloc.editorJS).toContain("visibleWhen");
        expect(button.bloc.editorJS).toContain('attribute: "appearance"');
        expect(button.bloc.editorJS).toContain('slot: "icon-left"');
        expect(button.bloc.viewJS).toContain("var(--primary-base, CanvasText)");
        expect(button.bloc.viewJS).toContain("var(--primary-foreground, var(--primary-contrasted, Canvas))");
        expect(button.bloc.viewJS).toContain("requestFormSubmit");

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
    });

    test("builds imported bloc artifacts", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("basic-blocs");
        const artifacts = definition?.artifacts?.filter((artifact) => artifact.type === "bloc") ?? [];

        expect(artifacts.map((artifact) => artifact.bloc.tag).sort()).toEqual([
            "basic-button",
            "basic-card",
            "basic-checkbox",
            "basic-chip",
            "basic-chip-group",
            "basic-file-input",
            "basic-grid",
            "basic-input",
            "basic-option",
            "basic-pagination",
            "basic-redirect",
            "basic-select",
            "basic-skeleton",
            "basic-stack",
            "basic-textarea",
            "basic-toast",
            "form",
            "img",
        ]);

        for (const artifact of artifacts) {
            const bloc = artifact.bloc;
            expect(bloc.viewJS).toBeTruthy();
            expect(
                validateBloc({
                    tag: bloc.tag,
                    native: isNativeBlocTag(bloc.tag),
                    viewSource: bloc.viewJS,
                    ...(bloc.editorJS ? { editorSource: bloc.editorJS } : {}),
                }).errors,
            ).toEqual([]);
            const built = await prepare_bloc(
                new File([bloc.viewJS ?? ""], "Bloc.js", { type: "application/javascript" }),
                bloc.editorJS ? new File([bloc.editorJS], "BlocEditor.ts", { type: "application/typescript" }) : null,
                bloc.name,
                bloc.group ?? "",
                bloc.description ?? "",
                bloc.tag,
                bloc.source,
                decodeDefaultContent(bloc.source),
                { native: isNativeBlocTag(bloc.tag) },
            );

            expect(built.id).toBe(bloc.tag);
            expect(built.editorJS).toContain("registerEditor");
            if (!isNativeBlocTag(bloc.tag)) {
                expect(built.viewJS).toContain(bloc.tag);
            }
        }
    });

    test("submits the parent form when Enter is pressed in a Basic input", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("basic-blocs");
        const artifact = definition?.artifacts?.find(
            (artifact) => artifact.type === "bloc" && artifact.bloc.tag === "basic-input",
        );
        if (!artifact || artifact.type !== "bloc") {
            throw new Error("expected basic-input artifact");
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

        const form = document.createElement("form");
        const input = document.createElement("basic-input");
        input.setAttribute("name", "query");
        input.setAttribute("text-color", "#123456");
        input.setAttribute("accent-color", "var(--theme-focus)");
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
        const field = input.shadowRoot?.querySelector<HTMLElement>(".field");
        expect(field?.style.getPropertyValue("--cms-input-color")).toBe("#123456");
        expect(field?.style.getPropertyValue("--cms-focus-color")).toBe("var(--theme-focus)");

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

    test("pagination emits stable page, limit, and offset details", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("basic-blocs");
        const artifacts = definition?.artifacts?.filter((artifact) => artifact.type === "bloc") ?? [];

        for (const tag of ["basic-pagination"]) {
            if (customElements.get(tag)) {
                continue;
            }
            const artifact = artifacts.find((candidate) => candidate.bloc.tag === tag);
            if (!artifact || artifact.type !== "bloc") {
                throw new Error(`expected ${tag} artifact`);
            }
            const built = await prepare_bloc(
                new File([artifact.bloc.viewJS ?? ""], "Bloc.js", { type: "application/javascript" }),
                artifact.bloc.editorJS
                    ? new File([artifact.bloc.editorJS], "BlocEditor.ts", { type: "application/typescript" })
                    : null,
                artifact.bloc.name,
                artifact.bloc.group ?? "",
                artifact.bloc.description ?? "",
                artifact.bloc.tag,
                artifact.bloc.source,
                decodeDefaultContent(artifact.bloc.source),
            );
            const runtime = window as typeof window & { p9r?: { Component?: typeof Component } };
            runtime.p9r ??= {};
            runtime.p9r.Component = Component;
            new Function(built.viewJS)();
        }

        const pagination = document.createElement("basic-pagination") as HTMLElement & {
            page: number;
            changePage(page: number): void;
        };
        pagination.setAttribute("page", "1");
        pagination.setAttribute("page-size", "12");
        pagination.setAttribute("total", "30");
        document.body.append(pagination);

        let detail: { page: number; limit: number; offset: number } | undefined;
        pagination.addEventListener("basic-pagination:change", (event) => {
            detail = (event as CustomEvent<typeof detail>).detail;
        });
        pagination.changePage(2);

        expect(pagination.page).toBe(2);
        expect(detail).toEqual({ page: 2, limit: 12, offset: 12 });
        expect(pagination.shadowRoot?.querySelector("[data-summary]")?.textContent).toBe("Page 2 sur 3");
        pagination.remove();
    });

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

    test("select adapts its native and custom presentations without duplicating state or events", async () => {
        if (!customElements.get("basic-select") || !customElements.get("basic-option")) {
            const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
            const definition = await repo.get("basic-blocs");
            const artifacts =
                definition?.artifacts?.filter(
                    (artifact) =>
                        artifact.type === "bloc" && ["basic-option", "basic-select"].includes(artifact.bloc.tag),
                ) ?? [];
            for (const artifact of artifacts) {
                if (artifact.type !== "bloc" || customElements.get(artifact.bloc.tag)) {
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
        }

        const matchMediaDescriptor = Object.getOwnPropertyDescriptor(window, "matchMedia");
        let matches = true;
        let changeListener: ((event: Event) => void) | undefined;
        const query = {
            get matches() {
                return matches;
            },
            media: "(hover: none) and (pointer: coarse)",
            onchange: null,
            addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
                if (type === "change" && typeof listener === "function") {
                    changeListener = listener;
                }
            },
            removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
                if (type === "change" && listener === changeListener) {
                    changeListener = undefined;
                }
            },
            addListener: (listener: (event: Event) => void) => {
                changeListener = listener;
            },
            removeListener: (listener: (event: Event) => void) => {
                if (listener === changeListener) {
                    changeListener = undefined;
                }
            },
            dispatchEvent: () => true,
        } as unknown as MediaQueryList;
        Object.defineProperty(window, "matchMedia", {
            configurable: true,
            writable: true,
            value: () => query,
        });

        type AdaptiveSelect = HTMLElement & {
            value: string | string[];
            internals: ElementInternals;
        };
        const select = document.createElement("basic-select") as AdaptiveSelect;
        const makeOption = (value: string, label: string) => {
            const option = document.createElement("basic-option");
            option.setAttribute("value", value);
            option.textContent = label;
            return option;
        };
        select.setAttribute("label", "Brand");
        select.setAttribute("name", "brand");
        select.setAttribute("required", "");
        select.append(makeOption("", "All brands"), makeOption("head", "Head"));

        try {
            document.body.append(select);
            await Promise.resolve();

            const root = select.shadowRoot;
            const customShell = root?.querySelector<HTMLElement>(".custom-shell");
            const nativeShell = root?.querySelector<HTMLElement>(".native-shell");
            const customControl = root?.querySelector<HTMLButtonElement>(".control");
            const nativeControl = root?.querySelector<HTMLSelectElement>(".native-control");
            expect(nativeControl?.tagName).toBe("SELECT");
            expect(nativeControl?.getAttribute("part")).toBe("control native-control");
            expect(select.getAttribute("data-resolved-presentation")).toBe("native");
            expect(customShell?.hidden).toBe(true);
            expect(nativeShell?.hidden).toBe(false);
            expect(customControl?.disabled).toBe(true);
            expect(nativeControl?.disabled).toBe(false);
            expect(nativeControl?.value).toBe("");

            let hostChanges = 0;
            let hostInputs = 0;
            select.addEventListener("change", () => hostChanges++);
            select.addEventListener("input", () => hostInputs++);
            if (nativeControl) {
                nativeControl.value = "head";
                nativeControl.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
                nativeControl.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
            }
            expect(hostInputs).toBe(0);
            expect(hostChanges).toBe(1);
            expect(select.value).toBe("head");
            expect(root?.querySelector(".value")?.textContent).toBe("Head");

            select.value = "future";
            expect(nativeControl?.options[0]?.hidden).toBe(true);
            expect(nativeControl?.options[0]?.disabled).toBe(true);
            expect(nativeControl?.options[1]?.textContent).toBe("All brands");
            expect(root?.querySelector(".value")?.textContent).toBe("Select an option");
            select.append(makeOption("future", "Future"));
            await Promise.resolve();
            await Promise.resolve();
            expect(select.value).toBe("future");
            expect(nativeControl?.value).toBe("future");
            expect(root?.querySelector(".value")?.textContent).toBe("Future");

            select.value = "missing";
            let validityAnchorClass = "";
            select.internals.setValidity = (_flags, _message, anchor) => {
                validityAnchorClass = anchor?.className || "";
            };
            nativeControl?.focus();
            matches = false;
            changeListener?.(new Event("change"));
            await Promise.resolve();
            expect(select.getAttribute("data-resolved-presentation")).toBe("custom");
            expect(customShell?.hidden).toBe(false);
            expect(nativeShell?.hidden).toBe(true);
            expect(root?.activeElement?.className).toBe("control");
            expect(validityAnchorClass).toBe("control");

            customControl?.focus();
            matches = true;
            changeListener?.(new Event("change"));
            await Promise.resolve();
            expect(select.getAttribute("data-resolved-presentation")).toBe("native");
            expect(root?.activeElement?.className).toBe("native-control");
            expect(validityAnchorClass).toBe("native-control");

            select.setAttribute("presentation", "custom");
            await Promise.resolve();
            expect(select.getAttribute("data-resolved-presentation")).toBe("custom");
            customControl?.click();
            root?.querySelector<HTMLButtonElement>(".option")?.focus();
            select.setAttribute("presentation", "native");
            await Promise.resolve();
            expect(select.getAttribute("data-resolved-presentation")).toBe("native");
            expect(root?.activeElement?.className).toBe("native-control");

            select.removeAttribute("presentation");
            select.setAttribute("multiple", "");
            await Promise.resolve();
            expect(select.getAttribute("data-resolved-presentation")).toBe("custom");
            expect(nativeControl?.multiple).toBe(true);
            select.setAttribute("presentation", "native");
            await Promise.resolve();
            expect(select.getAttribute("data-resolved-presentation")).toBe("native");
            expect(nativeControl?.multiple).toBe(true);
            let submittedValue: string | FormData | null = null;
            select.internals.setFormValue = (value) => {
                submittedValue = value;
            };
            if (nativeControl) {
                for (const option of nativeControl.options) {
                    option.selected = ["head", "future"].includes(option.value);
                }
                nativeControl.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
            }
            expect(select.value).toEqual(["head", "future"]);
            expect(submittedValue instanceof FormData).toBe(true);
            expect((submittedValue as FormData).getAll("brand")).toEqual(["head", "future"]);
        } finally {
            select.remove();
            if (matchMediaDescriptor) {
                Object.defineProperty(window, "matchMedia", matchMediaDescriptor);
            } else {
                Reflect.deleteProperty(window, "matchMedia");
            }
        }
    });

    test("grid derives its tracks from minimum and maximum item widths", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("basic-blocs");
        const artifact = definition?.artifacts?.find(
            (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "basic-grid",
        );
        if (!artifact || artifact.type !== "bloc") {
            throw new Error("expected basic-grid artifact");
        }

        const bloc = artifact.bloc;
        const encodedStyles = bloc.source?.["style.css"];
        const styles = encodedStyles ? Buffer.from(encodedStyles, "base64").toString("utf8") : "";
        expect(styles).toContain("repeat(auto-fill, minmax(min(var(--basic-grid-min), 100%), 1fr))");
        expect(styles).toContain("repeat(auto-fit, minmax(min(var(--basic-grid-min), 100%), 1fr))");
        expect(styles).not.toContain(':host([max]:not([max="none"])) { --basic-grid-justify: center; }');
        expect(styles).toContain(':host([packing="fit"])');
        expect(styles).toContain(':host([min="lg"])');
        expect(styles).toContain(':host([max="xl"])');
        expect(bloc.editorJS).toContain('attribute: "packing"');
        expect(bloc.editorJS).not.toContain('attribute: "columns"');
    });

    test("button preserves submitter data and exposes generic layout and icon controls", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("basic-blocs");
        const artifact = definition?.artifacts?.find(
            (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "basic-button",
        );
        if (!artifact || artifact.type !== "bloc") {
            throw new Error("expected basic-button artifact");
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

        const form = document.createElement("form");
        const button = document.createElement("basic-button");
        button.setAttribute("type", "submit");
        button.setAttribute("name", "subscribed");
        button.setAttribute("value", "true");
        button.setAttribute("appearance", "outlined");
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
        expect(submitCount).toBe(1);
        expect(formValues).toEqual(["true", null]);
        expect(form.querySelector("[data-basic-button-submitter]")).toBeNull();
        expect(button.shadowRoot?.querySelector('[part="icon-left"]')?.hasAttribute("hidden")).toBe(false);
        expect(button.shadowRoot?.textContent).toContain(':host([width="full"])');
        expect(button.shadowRoot?.textContent).toContain(':host([appearance="outlined"])');
        form.remove();
    });

    test("card exposes generic regions, appearances, density, and theme colors", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("basic-blocs");
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
        card.setAttribute("appearance", "elevated");
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
        expect(card.shadowRoot?.textContent).toContain(':host([appearance="elevated"])');
        expect(card.shadowRoot?.textContent).toContain(':host([density="spacious"])');
        expect(card.shadowRoot?.textContent).toContain(':host([stretch]:not([stretch="false"]))');
        expect(bloc.editorJS).toContain('attribute: "stretch"');
        card.remove();
    });

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
        group.setAttribute("accent-color", "#cedc50");
        group.setAttribute("selected-background-color", "#a85424");
        group.setAttribute("selected-text-color", "#ffffff");
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
        expect(choices?.style.getPropertyValue("--cms-chip-selected-background")).toBe("#a85424");
        expect(choices?.style.getPropertyValue("--cms-chip-selected-border")).toBe("#a85424");
        expect(choices?.style.getPropertyValue("--cms-chip-selected-color")).toBe("#ffffff");
        expect(group.style.getPropertyValue("--cms-chip-selected-background")).toBe("#a85424");
        expect(group.style.getPropertyValue("--cms-chip-selected-border")).toBe("#a85424");
        expect(group.style.getPropertyValue("--cms-chip-selected-color")).toBe("#ffffff");
        expect(choices?.style.getPropertyValue("--cms-focus-color")).toBe("#cedc50");
        expect(choices?.getAttribute("aria-label")).toBe("Playing level");
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

    test("does not show a required file error before validation", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("basic-blocs");
        const artifact = definition?.artifacts?.find(
            (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "basic-file-input",
        );
        if (!artifact || artifact.type !== "bloc") {
            throw new Error("expected basic-file-input artifact");
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

        const input = document.createElement("basic-file-input");
        input.setAttribute("name", "file");
        input.setAttribute("required", "");
        document.body.append(input);

        const error = input.shadowRoot?.querySelector(".error");
        expect(error?.textContent).toBe("");
        expect(error?.hasAttribute("hidden")).toBe(true);
        input.remove();
    });

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
});

function decodeDefaultContent(source: Record<string, string> | undefined): string | undefined {
    if (!source) {
        return undefined;
    }
    const manifestRaw = source["manifest.json"];
    if (!manifestRaw) {
        return undefined;
    }
    const manifest = JSON.parse(Buffer.from(manifestRaw, "base64").toString("utf-8")) as { defaultContent?: string };
    if (!manifest.defaultContent) {
        return undefined;
    }
    const path = manifest.defaultContent.replace(/^\.\//, "");
    const encoded = source[path];
    return encoded ? Buffer.from(encoded, "base64").toString("utf-8") : undefined;
}

function decodeSource(value: string | undefined): string {
    return value ? Buffer.from(value, "base64").toString("utf-8") : "";
}
