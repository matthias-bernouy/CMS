import {
    composeThemeSettings,
    defaultThemeSettings,
    integrationThemeTokenId,
    reconcileSubmittedThemeSettings,
    type IntegrationThemeContribution,
} from "@bernouy/cms-content";

test("restores provider catalogs and filters stale integration overrides from submitted settings", () => {
    const contribution = photoTheme();
    const current = composeThemeSettings(defaultThemeSettings(), [contribution]);
    const submitted = structuredClone(current);
    const tokenId = integrationThemeTokenId("photo-albums", "accent");
    submitted.themes[0]!.values.light[tokenId] = "var(--danger-base)";
    submitted.themes[0]!.values.light["integration-retired-value"] = "red";

    const submittedSource = submitted.sources.find((source) => source.id === "integration-photo-albums")!;
    submittedSource.label = "Forged label";
    submittedSource.owner = { kind: "site" };
    submittedSource.categories[0]!.tokens[0]!.variable = "primary-base";
    submitted.sources.find((source) => source.id === "colors")!.owner = { kind: "site" };

    const result = reconcileSubmittedThemeSettings(current, submitted, [contribution]);
    const source = result.sources.find((item) => item.id === "integration-photo-albums")!;

    expect(source.label).toBe("Photo Albums");
    expect(source.owner).toEqual({ kind: "integration", integrationId: "photo-albums" });
    expect(source.categories[0]!.tokens[0]!.variable).toBe(tokenId);
    expect(result.sources.find((item) => item.id === "colors")?.owner).toEqual({ kind: "core" });
    expect(result.themes[0]!.values.light[tokenId]).toBe("var(--danger-base)");
    expect(result.themes[0]!.values.light["integration-retired-value"]).toBeUndefined();
    expect(submittedSource.label).toBe("Forged label");
});

function photoTheme(): IntegrationThemeContribution {
    return {
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
                        defaults: { light: "var(--primary-base)" },
                    },
                ],
            },
        ],
    };
}
