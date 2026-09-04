import { File } from "node:buffer";
import { describe, expect, test } from "bun:test";
import { prepare_bloc, validateBloc } from "@bernouy/cms-bloc-compile";
import { decodeDefaultContent, decodeSource, loadDefinition, loadRestaurantBloc } from "./source";

const restaurantTags = [
    "restaurant-header",
    "restaurant-menu",
    "restaurant-hero-gallery",
    "restaurant-hero-split",
    "restaurant-hero-cover",
    "restaurant-menu-catalog",
    "restaurant-menu-section",
    "restaurant-menu-item",
    "restaurant-contact-card",
    "restaurant-contact-item",
] as const;
const heroTags = ["restaurant-hero-gallery", "restaurant-hero-split", "restaurant-hero-cover"] as const;

describe("restaurant 1.0.0 bloc catalogue", () => {
    test("hydrates and builds every editable restaurant bloc", async () => {
        const definition = await loadDefinition();

        expect(definition.kind).toBe("ulvia");
        expect(definition.inputs).toEqual([]);
        expect(definition.dependencies).toBeUndefined();
        expect(
            definition.artifacts.filter(
                (artifact) =>
                    artifact.type === "bloc" && artifact.bloc.path?.startsWith("blocs/foundation/restaurant/"),
            ),
        ).toHaveLength(restaurantTags.length);
        const themeTokenIds = definition.theme?.categories.flatMap(({ tokens }) => tokens.map(({ id }) => id));
        expect(themeTokenIds).toEqual(expect.arrayContaining(["success-base", "warning-base", "surface-background"]));
        expect(themeTokenIds?.some((id) => id.startsWith("restaurant-"))).toBeFalse();

        for (const tag of restaurantTags) {
            const bloc = await loadRestaurantBloc(tag);
            expect(bloc.source?.["manifest.json"]).toBeTruthy();
            expect(bloc.source?.["default.html"]).toBeTruthy();
            expect(bloc.source?.["BlocEditor.ts"]).toBeTruthy();
            expect(
                validateBloc({
                    tag: bloc.tag,
                    native: false,
                    viewSource: bloc.viewJS,
                    editorSource: bloc.editorJS,
                }).errors,
            ).toEqual([]);

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

            expect(built.id).toBe(tag);
            expect(built.viewJS).toContain(`customElements.define("${tag}"`);
            expect(built.editorJS).toContain("registerEditor");
        }
    });

    test("keeps the header reusable and gives every hero a distinct media structure", async () => {
        const header = await loadRestaurantBloc("restaurant-header");
        const gallery = await loadRestaurantBloc("restaurant-hero-gallery");
        const split = await loadRestaurantBloc("restaurant-hero-split");
        const cover = await loadRestaurantBloc("restaurant-hero-cover");
        const headerEditor = decodeSource(header.source?.["BlocEditor.ts"]);
        const headerDefault = decodeDefaultContent(header.source);
        const headerBaseCss = decodeSource(header.source?.["styles/base.css"]);
        const headerResponsiveCss = decodeSource(header.source?.["styles/responsive.css"]);
        const galleryTemplate = decodeSource(gallery.source?.["template.html"]);
        const splitTemplate = decodeSource(split.source?.["template.html"]);
        const coverTemplate = decodeSource(cover.source?.["template.html"]);

        expect(headerEditor).toContain('{ label: "Utility", value: "utility" }');
        expect(headerEditor).toContain('{ label: "Compact", value: "compact" }');
        expect(headerEditor).toContain('{ kind: "component", tag: "basic-badge" }');
        expect(headerEditor).toContain('{ kind: "component", tag: "basic-select" }');
        expect(headerDefault).toContain(
            '<basic-badge slot="status" tone="success" appearance="outlined" size="lg" dot>Open until 11 pm</basic-badge>',
        );
        expect(headerDefault).toContain('<basic-select slot="locale"');
        expect(headerDefault).toContain('<basic-option value="en">🇬🇧 English</basic-option>');
        expect(headerDefault).toContain('<basic-option value="fr">🇫🇷 Français</basic-option>');
        expect(headerBaseCss).toContain("--_color: var(--ulvia-page-background, #fffaf0)");
        expect(headerBaseCss).toContain("--ulvia-action-min-height: 2.75rem");
        expect(headerBaseCss).toContain("--ulvia-surface-text: var(--ulvia-page-background, #fffaf0)");
        expect(headerBaseCss).not.toContain("--cms-button-");
        expect(headerResponsiveCss).toContain('[part="locale"] { display: none; }');
        expect(headerResponsiveCss).toContain("@media (max-width: 360px)");
        expect(galleryTemplate).toContain('slot name="gallery-start"');
        expect(galleryTemplate).toContain('slot name="gallery-end"');
        expect(splitTemplate).not.toContain('slot name="media-accent"');
        expect(splitTemplate).not.toContain('part="shade"');
        expect(coverTemplate).toContain('<div part="shade" aria-hidden="true"></div>');

        for (const tag of heroTags) {
            const bloc = await loadRestaurantBloc(tag);
            const editor = decodeSource(bloc.source?.["BlocEditor.ts"]);
            const defaultContent = decodeDefaultContent(bloc.source) ?? "";
            const controller = decodeSource(bloc.source?.["carousel.ts"]);
            const template = decodeSource(bloc.source?.["template.html"]);
            expect(editor).toContain('label: "Brand logo"');
            expect(editor).toContain('slot: "brand"');
            expect(editor).toContain('{ kind: "component", tag: "img" }');
            expect(editor).toContain('label: "Page title"');
            expect(editor).toContain('slot: "title"');
            expect(editor).toContain('label: "Actions"');
            expect(editor).toContain('label: "Details"');
            expect(editor).toContain('attribute: "autoplay"');
            expect(editor).toContain('attribute: "rotation-interval"');
            expect(editor).not.toContain('attribute: "height"');
            expect(editor).not.toContain('attribute: "emblem"');
            expect(editor).not.toContain('type: "color"');
            expect(template).toContain('<div part="title"><slot name="title"></slot></div>');
            expect(template).not.toContain("emblem");
            expect(template).toContain('part="progress-value"');
            expect(defaultContent).toContain('<img slot="brand"');
            expect(defaultContent).toContain('<h1 slot="title">');
            expect(defaultContent).not.toContain('height="screen"');
            expect(defaultContent).not.toContain("emblem");
            expect(controller).toContain("setTimeout(() => this.advance(), duration)");
            expect(controller).toContain('event.key !== "Enter"');
            expect(controller).toContain("prefers-reduced-motion: reduce");
        }
    });

    test("uses the unified Ulvia palette without a restaurant sub-theme", async () => {
        for (const tag of restaurantTags) {
            const bloc = await loadRestaurantBloc(tag);
            const source = Object.values(bloc.source ?? {})
                .map((value) => decodeSource(value))
                .join("\n");

            expect(source).not.toMatch(/--restaurant-(?:header|hero|menu)-(?:accent|background|color|muted)/);
            expect(source).not.toContain("--ulvia-restaurant-");
            expect(source).not.toContain('attribute: "text-color"');
            expect(source).not.toContain('attribute: "muted-color"');
            expect(source).not.toContain('attribute: "background-color"');
            expect(source).not.toContain('attribute: "accent-color"');
            expect(source).not.toContain("PALETTE_ATTRIBUTES");
        }
    });

    test("separates the menu trigger from the configurable overlay", async () => {
        const header = await loadRestaurantBloc("restaurant-header");
        const menu = await loadRestaurantBloc("restaurant-menu");
        const headerController = decodeSource(header.source?.["menu-trigger.ts"]);
        const menuController = decodeSource(menu.source?.["controller.ts"]);
        const menuEditor = decodeSource(menu.source?.["BlocEditor.ts"]);

        expect(headerController).toContain('new CustomEvent("restaurant-menu-request"');
        expect(headerController).toContain('includes("menu")');
        expect(headerController).toContain("trigger.focus?.()");
        expect(menuController).toContain('event.key === "Escape"');
        expect(menuController).toContain("lockScroll()");
        expect(menuEditor).toContain('{ label: "Curtain", value: "curtain" }');
        expect(menuEditor).toContain('{ label: "Drawer", value: "drawer" }');
        expect(menuEditor).toContain('{ label: "Panel", value: "panel" }');
    });

    test("keeps the gallery frame stable across viewport and image formats", async () => {
        const gallery = await loadRestaurantBloc("restaurant-hero-gallery");
        const controller = decodeSource(gallery.source?.["carousel.ts"]);
        const editor = decodeSource(gallery.source?.["BlocEditor.ts"]);
        const atmosphereCss = decodeSource(gallery.source?.["styles/atmosphere.css"]);
        const baseCss = decodeSource(gallery.source?.["styles/base.css"]);
        const responsiveCss = decodeSource(gallery.source?.["styles/responsive.css"]);
        const template = decodeSource(gallery.source?.["template.html"]);
        const defaultContent = decodeDefaultContent(gallery.source) ?? "";

        expect(baseCss).toContain("height: 100svh");
        expect(baseCss).toContain("height: 100%;\n    min-height: 0");
        expect(baseCss).toContain("width: 100vw");
        expect(baseCss).toContain("--_gallery-width: min(100%, 40rem)");
        expect(baseCss).toContain("--_media-height: max(20rem, calc(100svh - 14.5rem))");
        expect(baseCss).toContain("--_media-width: clamp(20rem, 52vw, 80rem)");
        expect(baseCss).toContain("width: min(100%, var(--_gallery-width))");
        expect(baseCss).toContain('[part~="gallery-start"]');
        expect(baseCss).toContain('[part~="gallery-end"]');
        expect(baseCss).toContain("object-fit: cover");
        expect(baseCss).toContain("min-width: 10.75rem");
        expect(baseCss).toContain("margin-block-start: 1.25rem");
        expect(baseCss).toContain("@media (min-width: 901px)");
        expect(responsiveCss).toContain("grid-template-rows: auto minmax(0, 1fr)");
        expect(responsiveCss).toContain('[part="content"] { margin-block-end: 1.25rem; }');
        expect(responsiveCss).toContain("height: min(var(--_media-height), calc(100% - .5rem))");
        expect(responsiveCss).toContain('::slotted(img[slot^="gallery-"])');
        expect(responsiveCss).toContain("flex: none; width: 5rem; height: 3.75rem");
        expect(responsiveCss).toContain("aspect-ratio: 1 / 1");
        expect(responsiveCss).toContain("@media (max-width: 900px)");
        expect(controller).toContain('"data-position"');
        expect(controller).toContain('setAttribute("aria-pressed"');
        expect(controller).toContain('transform: "scale(1.025)"');
        expect(controller).toContain("scroller.scrollTo({ left: centered");
        expect(controller).not.toContain("scrollIntoView");
        expect(atmosphereCss).toContain("--_botanical-art");
        expect(atmosphereCss).toContain('[aria-pressed="true"]');
        expect(responsiveCss).toContain("align-items: stretch");
        expect(responsiveCss).toContain("min-height: 2.75rem");
        expect(responsiveCss).toContain('::slotted(img[slot="media"]) { width: 100%; height: 100%');
        expect(editor).toContain('label: "Brand logo"');
        expect(editor).toContain('slot: "brand"');
        expect(editor).toContain('{ kind: "component", tag: "img" }');
        expect(editor).toContain('label: "Page title"');
        expect(editor).toContain('slot: "title"');
        expect(editor).not.toContain('attribute: "height"');
        expect(editor).not.toContain('attribute: "emblem"');
        expect(editor).not.toContain('attribute: "mobile-image-fit"');
        expect(template).toContain('<div part="title"><slot name="title"></slot></div>');
        expect(template).not.toContain("emblem");
        expect(defaultContent).toContain('<img slot="brand"');
        expect(defaultContent).toContain('<h1 slot="title">');
        expect(defaultContent).not.toContain('<restaurant-hero-gallery height="');
        expect(defaultContent).not.toContain("emblem");
        expect(defaultContent).not.toContain("mobile-image-fit");
        expect(baseCss).toContain("--ulvia-font-size-display");
        expect(responsiveCss).not.toContain(":host([height=");
        expect(responsiveCss).not.toContain('mobile-image-fit="contain"');
    });

    test("keeps alternate hero frames full-screen and crop-stable", async () => {
        for (const tag of ["restaurant-hero-split", "restaurant-hero-cover"] as const) {
            const bloc = await loadRestaurantBloc(tag);
            const editor = decodeSource(bloc.source?.["BlocEditor.ts"]);
            const baseCss = decodeSource(bloc.source?.["styles/base.css"]);
            const responsiveCss = decodeSource(bloc.source?.["styles/responsive.css"]);
            const allCss = Object.entries(bloc.source ?? {})
                .filter(([path]) => path.endsWith(".css"))
                .map(([, source]) => decodeSource(source))
                .join("\n");

            expect(editor).toContain('attribute: "image-position"');
            expect(baseCss).toContain("width: 100vw");
            expect(baseCss).toContain("height: 100svh");
            expect(baseCss).toContain("height: 100%");
            expect(allCss).toContain("object-fit: cover");
            expect(responsiveCss).not.toContain(":host([height=");
        }
    });

    test("keeps authored restaurant text at or above sixteen pixels", async () => {
        for (const tag of restaurantTags) {
            const bloc = await loadRestaurantBloc(tag);
            const css = Object.entries(bloc.source ?? {})
                .filter(([path]) => path.endsWith(".css"))
                .map(([, source]) => decodeSource(source))
                .join("\n");

            for (const declaration of css.matchAll(/font-size:\s*([^;]+)/g)) {
                const remValues = [...(declaration[1] ?? "").matchAll(/([\d.]+)rem/g)];
                for (const value of remValues) {
                    expect(Number(value[1])).toBeGreaterThanOrEqual(1);
                }
            }
        }
    });
});
