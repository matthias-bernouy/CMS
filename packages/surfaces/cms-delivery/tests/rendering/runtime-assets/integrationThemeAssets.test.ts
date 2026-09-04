import { defaultSystem, P9R_CACHE, type ContentReader } from "@bernouy/cms-content";
import type { IntegrationInstallation, IntegrationInstallationRepository } from "@bernouy/cms-integrations";
import { compress, InMemoryCache } from "@bernouy/http-runner";
import { componentJsCacheKey } from "cms-delivery/core/assets/buildComponent";
import { resolveRuntimeAssets } from "cms-delivery/core/assets/resolveAssets";
import type DeliveryCms from "cms-delivery/DeliveryCms";

describe("integration Theme delivery assets", () => {
    test("uses successful installation contributions for the hashed stylesheet", async () => {
        const cache = new InMemoryCache();
        cache.set(
            componentJsCacheKey("/.cms/assets/component.js", { public: false, private: false }),
            compress("component", "text/javascript"),
        );
        cache.set(P9R_CACHE.js("/.cms/assets/cms-binding-core.js"), compress("binding", "text/javascript"));
        const delivery = {
            cmsPathPrefix: "/.cms",
            cache,
            repository: repository(),
            responsiveSourceImageRollout: { public: false, private: false },
            integrationInstallations: {
                list: async () => [successfulThemeInstallation()],
            } as IntegrationInstallationRepository,
        } as unknown as DeliveryCms;

        const assets = await resolveRuntimeAssets(delivery, []);
        const entry = cache.get(P9R_CACHE.STYLE);
        const css = new TextDecoder().decode(entry!.raw);

        expect(css).toContain("--photo-albums-accent: var(--primary-base);");
        expect(assets.styleUrl).toBe(`/.cms/style?v=${entry!.hash}`);
    });
});

function repository(): ContentReader {
    const system = defaultSystem();
    return {
        getSystem: async () => system,
        getAllPages: async () => [],
        getBlocsList: async () => [],
        getBlocViewJS: async () => null,
    } as unknown as ContentReader;
}

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
