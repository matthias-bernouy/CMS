import { defaultSystem, generateStyleEntry, type ContentReader } from "@bernouy/cms-content";

describe("Theme style entry", () => {
    test("composes integration defaults without mutating persisted settings", async () => {
        const system = defaultSystem();
        const reader = { getSystem: async () => system } as ContentReader;

        const entry = await generateStyleEntry(reader, [
            {
                integrationId: "brand-kit",
                label: "Brand Kit",
                categories: [
                    {
                        id: "gallery",
                        label: "Gallery",
                        tokens: [
                            {
                                id: "accent",
                                label: "Accent",
                                type: "color",
                                defaults: { light: "var(--primary-base)", dark: "#ffffff" },
                            },
                        ],
                    },
                ],
            },
        ]);
        const css = new TextDecoder().decode(entry.raw);

        expect(css).toContain("@layer cms-foundation");
        expect(css).toContain(":where(body) {\n    margin: 0;\n    min-block-size: 100%;");
        expect(css).toContain(":where([hidden]) {\n    display: none !important;");
        expect(css).not.toContain(":where(h1, h2, h3, h4, h5, h6)");
        expect(css).not.toContain(":where(a:any-link)");
        expect(css).not.toContain(":where(button, input, select, textarea)");
        expect(css).not.toContain(":where(img, picture, video, canvas, svg, iframe)");
        expect(css).not.toContain(":where(:focus-visible)");
        expect(css).not.toContain("min-block-size: 100dvh");
        expect(css).not.toContain("font-family: var(--ulvia-font-body");
        expect(css).not.toContain("background: var(--ulvia-page-background");
        expect(css).toContain("--brand-kit-accent: var(--primary-base);");
        expect(css).toContain("--brand-kit-accent: #ffffff;");
        expect(css.indexOf("@layer cms-foundation")).toBeLessThan(css.indexOf(":root {"));
        expect(system.theme.sources.some((source) => source.id === "integration-brand-kit")).toBeFalse();
    });
});
