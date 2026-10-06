import { expect, test } from "bun:test";
import { DefaultCoreCapabilityDispatcher, defaultSystem } from "@bernouy/cms-content";
import { registerAccessCapabilities } from "../../src/runtime/core-contracts/access";
import { registerDesignCapabilities } from "../../src/runtime/core-contracts/design";

const context = {
    requestId: "00000000-0000-4000-8000-000000000001",
    siteId: "default",
    installationId: "official",
    origin: "control" as const,
    actorKind: "administrator" as const,
};

test("access overview retries until settings and revision belong to one snapshot", async () => {
    const dispatcher = new DefaultCoreCapabilityDispatcher();
    const oldSystem = defaultSystem();
    oldSystem.site.name = "Old";
    const currentSystem = defaultSystem();
    currentSystem.site.name = "Current";
    const revisions = [1, 2, 2, 2];
    const systems = [oldSystem, currentSystem];
    registerAccessCapabilities(
        dispatcher,
        {
            repo: {
                getSystemRevision: async () => revisions.shift() ?? 2,
                getSystem: async () => structuredClone(systems.shift() ?? currentSystem),
            },
            users: { list: async () => ({ users: [], total: 0, page: 1, limit: 50, hasMore: false }) },
            identityProviders: { list: async () => [] },
        } as never,
        { administrators: { list: async () => [] } } as never,
    );

    const output = await dispatcher.invoke("ulvia.cms.access", "overview", {}, context);
    expect(output.site).toMatchObject({ name: "Current", revision: 2 });
});

test("settings commands return the revision committed by their own compare-and-swap", async () => {
    const dispatcher = new DefaultCoreCapabilityDispatcher();
    const system = defaultSystem();
    const repo = {
        getSystemRevision: async () => {
            throw new Error("a successful command must not re-read a later revision");
        },
        updateSystem: async (update: Record<string, unknown>, expectedRevision: number) => {
            if (expectedRevision === 4) {
                system.site.name = (update.site as { name: string }).name;
            } else {
                const site = update.site as {
                    language: string;
                    additionalLanguages: string[];
                    activeLanguages: string[];
                };
                Object.assign(system.site, site);
            }
            return structuredClone(system);
        },
    };
    const core = { repo } as never;
    registerAccessCapabilities(dispatcher, core, undefined);
    registerDesignCapabilities(dispatcher, core);

    const site = await dispatcher.invoke(
        "ulvia.cms.access",
        "update-site",
        { expectedRevision: 4, name: "Renamed" },
        context,
    );
    expect(site).toMatchObject({ revision: 5, name: "Renamed" });

    const languages = await dispatcher.invoke(
        "ulvia.cms.design",
        "update-languages",
        { expectedRevision: 5, language: "fr", additionalLanguages: ["en"], activeLanguages: ["fr", "en"] },
        context,
    );
    expect(languages).toMatchObject({ revision: 6, language: "fr", activeLanguages: ["fr", "en"] });
});
