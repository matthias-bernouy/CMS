import { defaultSystem, generateStyleEntry, type ContentReader } from "@bernouy/cms-content";

describe("Theme style entry", () => {
    test("composes integration defaults without mutating persisted settings", async () => {
        const system = defaultSystem();
        system.site.theme = ".site { display: block; }";
        const reader = { getSystem: async () => system } as ContentReader;

        const entry = await generateStyleEntry(reader, [
            {
                integrationId: "photo-albums",
                label: "Photo Albums",
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

        expect(css).toContain("@layer cms-theme-base");
        expect(css).toContain("font-family: var(--integration-basic-blocs-font-body, system-ui, sans-serif)");
        expect(css).toContain("color: var(--cms-link-color, var(--integration-basic-blocs-primary-base, LinkText))");
        expect(css).not.toContain("var(--font-body");
        expect(css.indexOf("@layer cms-theme-base")).toBeLessThan(css.indexOf(".site { display: block; }"));
        expect(css).toContain(".site { display: block; }");
        expect(css).toContain("--integration-photo-albums-accent: var(--primary-base);");
        expect(css).toContain("--integration-photo-albums-accent: #ffffff;");
        expect(system.theme.sources.some((source) => source.id === "integration-photo-albums")).toBeFalse();
    });
});
