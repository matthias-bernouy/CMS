import { defaultThemeSettings, organizeThemeSettings, type ThemeSource } from "@bernouy/cms-content";

test("turns legacy site and core ownership into independent catalogs without losing data", () => {
    const settings = defaultThemeSettings();
    const colors = settings.sources.find((source) => source.id === "colors")!;
    setLegacyOwner(colors, "core");
    const legacy: ThemeSource = {
        id: "site-tokens",
        label: "Site tokens",
        supportsModes: true,
        categories: [
            {
                id: "general",
                label: "General",
                description: "Design tokens created for this site.",
                tokens: [
                    {
                        id: "editorial-accent",
                        variable: "editorial-accent",
                        label: "Editorial accent",
                        description: "A custom accent",
                        type: "color",
                    },
                ],
            },
        ],
    };
    setLegacyOwner(legacy, "site");
    settings.sources.push(legacy);
    settings.themes[0]!.values.light["editorial-accent"] = "#123456";

    const organized = organizeThemeSettings(settings);
    const migrated = organized.sources.find((source) => source.id === "site-tokens")!;

    expect(colors.owner).toEqual({ kind: "core" });
    expect(organized.sources.find((source) => source.id === "colors")?.owner).toBeUndefined();
    expect(migrated).toMatchObject({
        id: "site-tokens",
        label: "Theme tokens",
        categories: [
            {
                id: "general",
                description: "Theme design tokens.",
                tokens: [{ id: "editorial-accent", label: "Editorial accent" }],
            },
        ],
    });
    expect(migrated.owner).toBeUndefined();
    expect(organized.themes[0]!.values.light["editorial-accent"]).toBe("#123456");
});

function setLegacyOwner(source: ThemeSource, kind: "core" | "site"): void {
    (source as unknown as { owner?: { kind: string } }).owner = { kind };
}
