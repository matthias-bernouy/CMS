import type { ThemeSettings } from "@bernouy/cms-content";
import { seedBloc, seedPublishedSiteBloc, seedSiteBloc, siteBlocHarness, siteSnapshot } from "../site-blocs/fixtures";

function encodedSource(files: Record<string, string>): Record<string, string> {
    return Object.fromEntries(
        Object.entries(files).map(([path, content]) => [path, Buffer.from(content).toString("base64")]),
    );
}

export async function libraryHarness() {
    const harness = siteBlocHarness();
    const site = await harness.repository.createSiteBlocCollection({
        name: "Campaigns",
        description: "Seasonal content",
    });
    await seedSiteBloc(harness.repository, "site-legacy", siteSnapshot({ name: "Legacy draft", group: "Content" }));
    await seedPublishedSiteBloc(harness.repository, "site-header", siteSnapshot({ name: "Header", group: "Layout" }));
    await seedBloc(harness.repository, "gallery-card", {
        name: "Gallery card",
        group: "Content",
        thumbnail: { path: "assets/gallery-card.webp", alt: "Gallery card" },
        source: encodedSource({
            "manifest.json": JSON.stringify({ defaultContent: "default.html" }),
            "default.html": '<gallery-card tone="accent" compact></gallery-card>',
        }),
    });
    await seedBloc(harness.repository, "gallery-banner", {
        name: "Gallery banner",
        group: "Layout",
        catalogue: "inactive",
    });
    await seedBloc(harness.repository, "code-card", { name: "Code card", group: "Content" });
    return { ...harness, site };
}

export async function configureSiteTheme(harness: Awaited<ReturnType<typeof libraryHarness>>): Promise<void> {
    const system = await harness.repository.getSystem();
    const theme: ThemeSettings = {
        activeThemeId: "default",
        sources: [
            {
                id: "custom",
                label: "Site variables",
                supportsModes: true,
                categories: [
                    {
                        id: "interface",
                        label: "Interface",
                        description: "Site interface tokens",
                        tokens: [
                            token("page-background", "Page background", "#fafafa", "#111111"),
                            token("surface-background", "Surface background", "#ffffff", "#222222"),
                            token("surface-text", "Surface text", "#222222", "#f5f5f5"),
                            token("body-text", "Body text", "#444444", "#dddddd"),
                            token("primary-base", "Primary", "#16634d", "#66d3ad"),
                        ],
                    },
                ],
            },
        ],
        themes: [{ id: "default", name: "Default theme", values: { light: {}, dark: {} } }],
    };
    await harness.repository.updateSystem({ ...system, theme });
}

function token(id: string, label: string, light: string, dark: string) {
    return {
        id,
        variable: id,
        label,
        description: "",
        type: "color" as const,
        defaults: { light, dark },
    };
}
