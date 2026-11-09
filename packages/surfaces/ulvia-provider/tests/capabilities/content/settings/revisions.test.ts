import { expect, test } from "bun:test";
import { defaultSystem } from "@bernouy/content";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { mountContentForTest } from "../mount";

const context = {
    requestId: "00000000-0000-4000-8000-000000000001",
    contractVersion: "1.1.0",
    siteId: "default",
    providerId: "ulvia/primary-provider",
};

test("content site reads retry until settings and revision belong to one snapshot", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    const oldSystem = defaultSystem();
    oldSystem.site.name = "Old";
    const currentSystem = defaultSystem();
    currentSystem.site.name = "Current";
    const revisions = [1, 2, 2, 2];
    const systems = [oldSystem, currentSystem];
    await mountContentForTest(dispatcher, {
        repo: {
            getSystemRevision: async () => revisions.shift() ?? 2,
            getSystem: async () => structuredClone(systems.shift() ?? currentSystem),
        } as never,
    } as never);

    const output = await dispatcher.invoke("ulvia/cms.content", "site.get", {}, context);
    expect(output).toMatchObject({ name: "Current", revision: 2 });
});

test("settings commands return the revision committed by their own compare-and-swap", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
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
    await mountContentForTest(dispatcher, core);

    const site = await dispatcher.invoke(
        "ulvia/cms.content",
        "site.update",
        { expectedRevision: 4, name: "Renamed" },
        context,
    );
    expect(site).toMatchObject({ revision: 5, name: "Renamed" });

    const languages = await dispatcher.invoke(
        "ulvia/cms.content",
        "localization.update",
        { expectedRevision: 5, language: "fr", additionalLanguages: ["en"], activeLanguages: ["fr", "en"] },
        context,
    );
    expect(languages).toMatchObject({ revision: 6, language: "fr", activeLanguages: ["fr", "en"] });
});
