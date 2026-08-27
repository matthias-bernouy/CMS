import { collectIntegrationInstallationThemeContributions } from "@bernouy/cms-integrations";
import type { IntegrationInstallation, IntegrationInstallationStatus } from "@bernouy/cms-integrations";

describe("integration Theme contributions", () => {
    test("collects only successful snapshotted themes in deterministic order", () => {
        const installations = [
            installation("zeta", "success"),
            installation("failed", "failed"),
            installation("pending", "pending"),
            installation("without-theme", "success", false),
            installation("alpha", "success"),
        ];

        const contributions = collectIntegrationInstallationThemeContributions(installations);

        expect(contributions.map((item) => item.integrationId)).toEqual(["alpha", "zeta"]);
        expect(contributions[0]).toMatchObject({
            integrationId: "alpha",
            label: "alpha definition",
            dependencies: ["basic-blocs"],
            categories: [{ id: "appearance", tokens: [{ id: "accent" }] }],
        });
    });

    test("does not expose mutable installation snapshot objects", () => {
        const source = installation("gallery", "success");
        const contributions = collectIntegrationInstallationThemeContributions([source]);

        contributions[0]!.categories[0]!.tokens[0]!.label = "Changed";

        expect(source.definitionSnapshot?.theme?.categories[0]?.tokens[0]?.label).toBe("Accent");
    });
});

function installation(id: string, status: IntegrationInstallationStatus, withTheme = true): IntegrationInstallation {
    return {
        id,
        label: `${id} installation`,
        definitionVersion: "1.0.0",
        definitionSnapshot: {
            kind: id,
            label: `${id} definition`,
            inputs: [],
            dependencies: [{ name: "basicBlocs", kind: "basic-blocs", versionRange: "^1.0.0" }],
            ...(withTheme
                ? {
                      theme: {
                          categories: [
                              {
                                  id: "appearance",
                                  label: "Appearance",
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
                      },
                  }
                : {}),
        },
        status,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        runCount: 1,
        answersSnapshot: {},
        secretRefs: {},
        secretInputs: [],
        artifacts: [],
        runs: [],
    };
}
