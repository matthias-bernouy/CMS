import { expect, test } from "bun:test";
import { File } from "node:buffer";
import { prepare_bloc } from "@bernouy/cms-bloc-compile";
import { Component } from "@bernouy/components/base";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { executeEditorBundle } from "../catalog/support";
import { decodeDefaultContent, decodeSource } from "../source";

type NavbarElement = HTMLElement & {
    open: boolean;
    measureLayout(): void;
};

export function registerNavbarTest(): void {
    test("navbar keeps literal links and provides an accessible responsive menu", async () => {
        const repo = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const definition = await repo.get("basic-blocs");
        const artifact = definition?.artifacts?.find(
            (candidate) => candidate.type === "bloc" && candidate.bloc.tag === "basic-navbar",
        );
        if (!artifact || artifact.type !== "bloc") {
            throw new Error("expected basic-navbar artifact");
        }
        const bloc = artifact.bloc;
        const defaultContent = decodeDefaultContent(bloc.source);
        const editorSource = decodeSource(bloc.source?.["BlocEditor.ts"]);

        expect(defaultContent.match(/<a\s/g)).toHaveLength(4);
        expect(defaultContent).toContain('<a slot="brand" href="/">');
        expect(defaultContent).toContain('<a slot="navigation" href="/about">');
        expect(defaultContent).toContain('<a slot="actions" href="/contact">');
        expect(defaultContent).not.toContain("<basic-link");
        expect(editorSource).not.toContain('attribute: "open"');

        const built = await prepare_bloc(
            new File([bloc.viewJS ?? ""], "Bloc.js", { type: "application/javascript" }),
            new File([bloc.editorJS ?? ""], "BlocEditor.ts", { type: "application/typescript" }),
            bloc.name,
            bloc.group ?? "",
            bloc.description ?? "",
            bloc.tag,
            bloc.source,
            defaultContent,
        );
        const registration = executeEditorBundle(built.editorJS);
        const editor = new registration.editor(document.createElement("basic-navbar"));
        expect(editor.getContentSlots()).toEqual([
            {
                label: "Brand",
                slot: "brand",
                accepts: [{ kind: "any-component" }],
                max: 1,
            },
            {
                label: "Navigation",
                slot: "navigation",
                accepts: [{ kind: "component", tag: "a" }],
                min: 1,
            },
            {
                label: "Actions",
                slot: "actions",
                accepts: [{ kind: "component", tag: "a" }],
                max: 2,
            },
        ]);

        const runtime = window as typeof window & { p9r?: { Component?: typeof Component } };
        runtime.p9r ??= {};
        runtime.p9r.Component = Component;
        new Function(built.viewJS)();

        const navbar = document.createElement("basic-navbar") as NavbarElement;
        navbar.setAttribute("navigation-label", "Main links");
        navbar.setAttribute("open-label", "Show links");
        navbar.setAttribute("close-label", "Hide links");
        const brand = document.createElement("span");
        brand.slot = "brand";
        brand.textContent = "Brand without a link";
        const link = document.createElement("a");
        link.slot = "navigation";
        link.href = "#content";
        const action = document.createElement("a");
        action.slot = "actions";
        action.href = "#contact";
        navbar.append(brand, link, action);
        navbar.addEventListener("click", (event) => event.preventDefault());
        document.body.append(navbar);

        const toggle = navbar.shadowRoot?.querySelector<HTMLButtonElement>("[data-toggle]");
        const navigation = navbar.shadowRoot?.querySelector("nav");
        expect(toggle?.getAttribute("aria-label")).toBe("Show links");
        expect(navigation?.getAttribute("aria-label")).toBe("Main links");

        navbar.setAttribute("collapsed", "");
        toggle?.click();
        expect(navbar.open).toBeTrue();
        expect(toggle?.getAttribute("aria-expanded")).toBe("true");
        expect(toggle?.getAttribute("aria-label")).toBe("Hide links");

        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        expect(navbar.open).toBeFalse();
        expect(navbar.shadowRoot?.activeElement).toBe(toggle);

        navbar.open = true;
        document.body.dispatchEvent(new Event("pointerdown", { bubbles: true, composed: true }));
        expect(navbar.open).toBeFalse();

        navbar.open = true;
        link.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
        expect(navbar.open).toBeFalse();

        const bar = navbar.shadowRoot?.querySelector('[part="bar"]');
        const brandRegion = navbar.shadowRoot?.querySelector('[part="brand"]');
        const linksRegion = navbar.shadowRoot?.querySelector('[part="links"]');
        const actionsRegion = navbar.shadowRoot?.querySelector('[part="actions"]');
        Object.defineProperties(bar, {
            clientWidth: { configurable: true, value: 300 },
        });
        Object.defineProperty(brandRegion, "scrollWidth", { configurable: true, value: 100 });
        Object.defineProperty(linksRegion, "scrollWidth", { configurable: true, value: 140 });
        Object.defineProperty(actionsRegion, "scrollWidth", { configurable: true, value: 90 });
        navbar.measureLayout();
        expect(navbar.hasAttribute("collapsed")).toBeTrue();
        navbar.open = true;
        Object.defineProperty(brandRegion, "scrollWidth", { configurable: true, value: 20 });
        Object.defineProperty(linksRegion, "scrollWidth", { configurable: true, value: 100 });
        Object.defineProperty(actionsRegion, "scrollWidth", { configurable: true, value: 20 });
        navbar.measureLayout();
        expect(navbar.hasAttribute("collapsed")).toBeFalse();
        expect(navbar.open).toBeFalse();
        const styles = navbar.shadowRoot?.querySelector("style")?.textContent ?? "";
        for (const appearance of ["soft", "filled", "outlined"]) {
            expect(styles).toContain(`:host([appearance="${appearance}"])`);
        }
        expect(styles).toContain(':host([collapsed]) [part="panel"]');
        expect(styles).toContain('[part="toggle"]:hover');
        expect(styles).toContain('a[slot="actions"]:hover');
        expect(styles).toContain("--cms-link-color: var(--_navbar-action-color)");
        expect(styles).toContain("translateY(-1px)");
        expect(styles).toContain("prefers-reduced-motion: reduce");
        expect(styles).not.toContain("48rem");
        navbar.remove();
    });
}
