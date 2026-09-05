import {
    composeThemeSettings,
    defaultThemeSettings,
    integrationThemeTokenId,
    reconcileSubmittedThemeSettings,
    type IntegrationThemeContribution,
} from "@bernouy/cms-content";

test("restores provider catalogs and filters stale integration overrides from submitted settings", () => {
    const contribution = brandTheme();
    const current = composeThemeSettings(defaultThemeSettings(), [contribution]);
    const submitted = structuredClone(current);
    const tokenId = integrationThemeTokenId("brand-kit", "accent");
    submitted.themes[0]!.values.light[tokenId] = "var(--danger-base)";
    submitted.themes[0]!.values.light["integration-retired-value"] = "red";

    const submittedSource = submitted.sources.find((source) => source.id === "integration-brand-kit")!;
    submittedSource.label = "Forged label";
    setLegacyOwner(submittedSource, "site");
    submittedSource.categories[0]!.tokens[0]!.variable = "primary-base";
    setLegacyOwner(submitted.sources.find((source) => source.id === "custom")!, "core");

    const result = reconcileSubmittedThemeSettings(current, submitted, [contribution]);
    const source = result.sources.find((item) => item.id === "integration-brand-kit")!;

    expect(source.label).toBe("Brand Kit");
    expect(source.owner).toEqual({ kind: "integration", integrationId: "brand-kit" });
    expect(source.categories[0]!.tokens[0]!.variable).toBe(tokenId);
    expect(result.sources.find((item) => item.id === "custom")?.owner).toBeUndefined();
    expect(result.themes[0]!.values.light[tokenId]).toBe("var(--danger-base)");
    expect(result.themes[0]!.values.light["integration-retired-value"]).toBeUndefined();
    expect(submittedSource.label).toBe("Forged label");
});

function setLegacyOwner(source: object, kind: "core" | "site"): void {
    (source as { owner?: { kind: string } }).owner = { kind };
}

function brandTheme(): IntegrationThemeContribution {
    return {
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
                        defaults: { light: "var(--primary-base)" },
                    },
                ],
            },
        ],
    };
}
