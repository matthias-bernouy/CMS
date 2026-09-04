import { describe, expect, mock, test } from "bun:test";
import { defaultSystem, P9R_CACHE, type TSystem } from "@bernouy/cms-content";
import { composeThemeSettings, integrationThemeTokenId } from "@bernouy/cms-content";
import type { IntegrationInstallation } from "@bernouy/cms-integrations";
import type { ControlCms } from "cms-control/ControlCms";
import { getSettings } from "cms-control/core/management/settings/getSettings";
import { updateSettings } from "cms-control/core/management/settings/updateSettings";

describe("settings runtime", () => {
    test("combines system settings with page choices", async () => {
        const system = defaultSystem();
        const pages = [{ path: "/about", title: "About" }];
        const getSystem = mock(async () => system);
        const getLinks = mock(async () => pages);
        const cms = {
            repository: { getSystem, getLinks },
        } as unknown as ControlCms;

        const settings = await getSettings(cms);

        expect(settings).toEqual({
            site: system.site,
            theme: system.theme,
            security: system.security,
            email: system.email,
            pages,
        });
        expect(getSystem).toHaveBeenCalledTimes(1);
        expect(getLinks).toHaveBeenCalledTimes(1);
    });

    test("composes successful installation Theme catalogs for the editor", async () => {
        const system = defaultSystem();
        const cms = {
            repository: {
                getSystem: async () => system,
                getLinks: async () => [],
            },
            configuredIntegrationInstallations: {
                list: async () => [successfulThemeInstallation()],
            },
        } as unknown as ControlCms;

        const settings = await getSettings(cms);
        const source = settings.theme.sources.find((item) => item.id === "integration-photo-albums");

        expect(source).toMatchObject({
            label: "Photo Albums",
            owner: { kind: "integration", integrationId: "photo-albums" },
            categories: [{ tokens: [{ id: "photo-albums-accent" }] }],
        });
        expect(system.theme.sources.some((item) => item.id === "integration-photo-albums")).toBeFalse();
    });

    test("persists updates and invalidates style and rendered page caches", async () => {
        const updateSystem = mock(async () => defaultSystem());
        const deleteKey = mock((_key: string) => {});
        const deleteMatching = mock((predicate: (key: string) => boolean) => {
            expect(predicate("page:/about")).toBe(true);
            expect(predicate("bloc:hero")).toBe(false);
        });
        const cms = {
            repository: { updateSystem },
            cache: { delete: deleteKey, deleteMatching },
        } as unknown as ControlCms;
        const update = { initializationStep: 2 };

        await updateSettings(cms, update);

        expect(updateSystem).toHaveBeenCalledWith(update);
        expect(deleteKey).toHaveBeenCalledWith(P9R_CACHE.STYLE);
        expect(deleteMatching).toHaveBeenCalledTimes(1);
    });

    test("restores installed provider catalogs before persisting Theme overrides", async () => {
        const system = defaultSystem();
        const installation = successfulThemeInstallation();
        const contribution = {
            integrationId: "photo-albums",
            label: "Photo Albums",
            categories: installation.definitionSnapshot!.theme!.categories,
        };
        const submitted = composeThemeSettings(system.theme, [contribution]);
        const tokenId = integrationThemeTokenId("photo-albums", "accent");
        submitted.themes[0]!.values.light[tokenId] = "var(--danger-base)";
        submitted.themes[0]!.values.light["photo-albums-retired"] = "red";
        const submittedSource = submitted.sources.find((source) => source.id === "integration-photo-albums")!;
        submittedSource.label = "Forged";
        delete submittedSource.owner;
        const updateSystem = mock(async (_update: Partial<TSystem>) => system);
        const cms = {
            repository: { getSystem: async () => system, updateSystem },
            configuredIntegrationInstallations: { list: async () => [installation] },
            cache: { delete: () => {}, deleteMatching: () => {} },
        } as unknown as ControlCms;

        await updateSettings(cms, { theme: submitted });

        const persisted = updateSystem.mock.calls[0]![0]!.theme!;
        const source = persisted.sources.find((item) => item.id === "integration-photo-albums")!;
        expect(source.label).toBe("Photo Albums");
        expect(source.owner).toEqual({ kind: "integration", integrationId: "photo-albums" });
        expect(persisted.themes[0]!.values.light[tokenId]).toBe("var(--danger-base)");
        expect(persisted.themes[0]!.values.light["photo-albums-retired"]).toBeUndefined();
    });
});

function successfulThemeInstallation(): IntegrationInstallation {
    return {
        id: "photo-albums",
        label: "Photo Albums",
        definitionVersion: "1.0.0",
        status: "success",
        definitionSnapshot: {
            kind: "photo-albums",
            label: "Photo Albums",
            inputs: [],
            theme: {
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
            },
        },
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
