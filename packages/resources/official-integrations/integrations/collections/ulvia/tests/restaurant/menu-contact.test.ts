import { describe, expect, test } from "bun:test";
import { decodeDefaultContent, decodeSource, loadDefinition, loadRestaurantBloc } from "./source";

describe("restaurant menu and contact blocs", () => {
    test("keeps menu content semantic, editable, and progressively enhanced", async () => {
        const catalog = await loadRestaurantBloc("restaurant-menu-catalog");
        const section = await loadRestaurantBloc("restaurant-menu-section");
        const item = await loadRestaurantBloc("restaurant-menu-item");
        const catalogEditor = decodeSource(catalog.source?.["BlocEditor.ts"]);
        const catalogController = decodeSource(catalog.source?.["internals/controller.ts"]);
        const catalogCss = decodeSource(catalog.source?.["styles/base.css"]);
        const presentationCss = decodeSource(catalog.source?.["styles/presentation.css"]);
        const sectionEditor = decodeSource(section.source?.["BlocEditor.ts"]);
        const sectionCss = decodeSource(section.source?.["style.css"]);
        const itemEditor = decodeSource(item.source?.["BlocEditor.ts"]);
        const itemCss = decodeSource(item.source?.["style.css"]);
        const defaultContent = decodeDefaultContent(catalog.source) ?? "";

        expect(catalogEditor).toContain('{ label: "Categories", value: "tabs" }');
        expect(catalogEditor).toContain('{ label: "All sections", value: "stacked" }');
        expect(catalogEditor).toContain('tag: "restaurant-menu-section"');
        expect(sectionEditor).toContain('tag: "restaurant-menu-item"');
        expect(sectionEditor).toContain('tag: "svg"');
        expect(sectionEditor).toContain('attribute: "icon"');
        expect(sectionEditor).toContain('{ label: "Hide", value: "hide" }');
        expect(itemEditor).toContain('label: "Availability"');
        expect(itemEditor).toContain('attribute: "media-position"');
        expect(itemEditor).toContain('attribute: "media-ratio"');
        expect(itemEditor).toContain('{ label: "With image", value: "media" }');
        expect(itemEditor).toContain('slot: "media"');
        expect(itemEditor).toContain('tag: "img"');
        expect(itemEditor).toContain('tag: "h3"');
        expect(catalogController).toContain('setAttribute("role", "tablist")');
        expect(catalogController).toContain('setAttribute("role", "tab")');
        expect(catalogController).toContain('setAttribute("role", "tabpanel")');
        expect(catalogController).toContain('["ArrowLeft", "ArrowRight", "Home", "End"]');
        expect(catalogController).toContain("prefers-reduced-motion: reduce");
        expect(catalogController).toContain("new MutationObserver(this.refresh)");
        expect(catalogCss).toContain("scroll-snap-type: inline proximity");
        expect(catalogCss).toContain("min-height: 5.5rem");
        expect(presentationCss).toContain('[presentation="stacked"]');
        expect(presentationCss).toContain("width: min(100%, 68rem)");
        expect(sectionCss).toContain(':host([icon="hide"])');
        expect(itemCss).toContain('[media-position="end"]');
        expect(itemCss).toContain('[media-ratio="landscape"]');
        expect(itemCss).toContain('[media-ratio="portrait"]');
        expect(itemCss).toContain("object-fit: cover");
        expect(defaultContent.match(/<restaurant-menu-section\b/g)).toHaveLength(3);
        expect(defaultContent.match(/<restaurant-menu-item\b/g)).toHaveLength(6);
        expect(defaultContent).toContain('<h1 slot="title">The menu</h1>');
        expect(defaultContent).toContain('<h2 slot="title">Starters</h2>');
        expect(defaultContent).toContain('<h3 slot="name">Sea bream crudo</h3>');
        expect(defaultContent).not.toContain("<script");
    });

    test("composes contact details from restaurant and Basic Blocs responsibilities", async () => {
        const card = await loadRestaurantBloc("restaurant-contact-card");
        const item = await loadRestaurantBloc("restaurant-contact-item");
        const cardEditor = decodeSource(card.source?.["BlocEditor.ts"]);
        const itemEditor = decodeSource(item.source?.["BlocEditor.ts"]);
        const cardCss = decodeSource(card.source?.["styles/base.css"]);
        const responsiveCss = decodeSource(card.source?.["styles/responsive.css"]);
        const defaultContent = decodeDefaultContent(card.source) ?? "";

        expect(cardEditor).toContain('{ label: "Split", value: "split" }');
        expect(cardEditor).toContain('{ label: "Stacked", value: "stacked" }');
        expect(cardEditor).toContain('{ label: "Compact", value: "sidebar" }');
        expect(cardEditor).toContain('tag: "basic-badge"');
        expect(cardEditor).toContain('tag: "basic-table"');
        expect(cardEditor).toContain('tag: "restaurant-contact-item"');
        expect(itemEditor).toContain('tag: "svg"');
        expect(itemEditor).toContain('tag: "a"');
        expect(cardCss).toContain("--integration-ulvia-basic-blocs-table-font-size: 1rem");
        expect(cardCss).toContain("--integration-ulvia-basic-blocs-surface-border: var(--_border)");
        expect(cardCss).toContain("width: min(100%, 68rem)");
        expect(responsiveCss).toContain("@media (max-width: 820px)");
        expect(responsiveCss).toContain("grid-template-columns: minmax(0, 1fr)");
        expect(defaultContent).toContain('<basic-badge slot="status"');
        expect(defaultContent).toContain('<basic-table slot="hours" accessible-label="Weekly opening hours">');
        expect(defaultContent.match(/<basic-table-row>/g)).toHaveLength(7);
        expect(defaultContent).toContain('href="tel:+33123456789"');
        expect(defaultContent).not.toContain("<script");
    });

    test("provides editable light and dark editorial theme tokens", async () => {
        const definition = await loadDefinition();
        const foundations = definition.theme?.categories.find((category) => category.id === "restaurant-foundations");
        const tokens = new Map(foundations?.tokens.map((token) => [token.id, token.defaults]));

        expect(tokens.get("restaurant-content-background")).toEqual({ light: "#f5f1e9", dark: "#15171a" });
        expect(tokens.get("restaurant-content-surface")).toEqual({ light: "#fffaf2", dark: "#1d2124" });
        expect(tokens.get("restaurant-content-text")).toEqual({ light: "#202421", dark: "#fffaf0" });
        expect(tokens.get("restaurant-content-muted-text")).toEqual({ light: "#60665f", dark: "#d0cbc1" });
        expect(tokens.get("restaurant-content-border")).toEqual({ light: "#ddd8cf", dark: "#4c4e4f" });
    });
});
