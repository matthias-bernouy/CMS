import { defaultThemeSettings, organizeThemeSettings, type ThemeSource } from "@bernouy/cms-content";

test("turns legacy site and core ownership into independent catalogs without losing data", () => {
    const settings = defaultThemeSettings();
    const colors: ThemeSource = {
        id: "colors",
        label: "Colors",
        supportsModes: true,
        categories: [
            {
                id: "brand",
                label: "Brand",
                description: "Legacy brand variables.",
                tokens: [
                    {
                        id: "primary-base",
                        variable: "primary-base",
                        label: "Primary",
                        description: "Legacy primary color",
                        type: "color",
                    },
                ],
            },
        ],
    };
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
    settings.sources.push(colors, legacy);
    settings.themes[0]!.values.light["primary-base"] = "#16634d";
    settings.themes[0]!.values.light["editorial-accent"] = "#123456";

    const organized = organizeThemeSettings(settings);
    const migrated = organized.sources.find((source) => source.id === "custom")!;

    expect(colors.owner).toEqual({ kind: "core" });
    expect(organized.sources.some((source) => source.id === "colors" || source.id === "site-tokens")).toBeFalse();
    expect(migrated).toMatchObject({
        id: "custom",
        label: "Site variables",
        categories: [
            {
                id: "variables",
                tokens: [
                    { id: "primary-base", label: "Primary" },
                    { id: "editorial-accent", label: "Editorial accent" },
                ],
            },
        ],
    });
    expect(migrated.owner).toBeUndefined();
    expect(organized.themes[0]!.values.light["primary-base"]).toBe("#16634d");
    expect(organized.themes[0]!.values.light["editorial-accent"]).toBe("#123456");
});

function setLegacyOwner(source: ThemeSource, kind: "core" | "site"): void {
    (source as unknown as { owner?: { kind: string } }).owner = { kind };
}
