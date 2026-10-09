import { expect, test } from "bun:test";
import { migratePageContent } from "cms-repository/collections/installations/migrations/transforms/page";
import { migrateThemeTokens } from "cms-repository/collections/installations/migrations/transforms/siteData";
import { defaultSystem } from "@bernouy/cms-content";

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
