import { expect, test } from "bun:test";
import { migratePageContent } from "cms-content/application/migrations/transforms/page";
import { migrateThemeTokens } from "cms-content/application/migrations/transforms/siteData";
import { defaultSystem } from "cms-content/settings/core/system";

const operation = { kind: "rename-theme-token", from: "primary", to: "brand" } as const;

test("theme-token migration replaces only the exact CSS variable", () => {
    const system = defaultSystem();
    system.theme.themes[0]!.values.light.accent = "linear-gradient(var(--atlas-primary), var(--atlas-primary-hover))";

    const migrated = migrateThemeTokens(system, [{ collectionId: "atlas", operations: [operation] }]);
    expect(migrated.theme.themes[0]!.values.light.accent).toBe(
        "linear-gradient(var(--atlas-brand), var(--atlas-primary-hover))",
    );

    const page = migratePageContent(
        '<atlas-card tone="var(--atlas-primary)" hover="var(--atlas-primary-hover)"></atlas-card>',
        [operation],
        "atlas",
    );
    expect(page.content).toContain('tone="var(--atlas-brand)"');
    expect(page.content).toContain('hover="var(--atlas-primary-hover)"');
});
