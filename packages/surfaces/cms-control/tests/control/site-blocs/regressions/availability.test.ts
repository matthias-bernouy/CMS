import { describe, expect, test } from "bun:test";
import { saveSiteBloc } from "cms-control/core/content/siteBloc/service";
import { seedPublishedSiteBloc, seedSiteBloc, siteBlocHarness, siteSnapshot } from "../fixtures";

describe("site bloc authoring availability", () => {
    test("rejects unpublished and archived structure dependencies", async () => {
        const { cms, repository } = siteBlocHarness();
        await seedSiteBloc(repository, "site-owner");
        await seedSiteBloc(repository, "site-unpublished");
        await seedPublishedSiteBloc(repository, "site-archived");
        await repository.archiveSiteBloc("site-archived", 1);

        for (const dependency of ["site-unpublished", "site-archived"]) {
            const snapshot = siteSnapshot({
                structure: [{ kind: "bloc", tag: dependency, attributes: {}, children: [] }],
            });
            await expect(saveSiteBloc(cms, "site-owner", saveInput(snapshot))).rejects.toThrow(
                dependency === "site-unpublished" ? /is not published/ : /is archived/,
            );
        }
    });

    test("excludes archived site blocs from slot contracts and default content", async () => {
        const { cms, repository } = siteBlocHarness();
        await seedSiteBloc(repository, "site-owner");
        await seedPublishedSiteBloc(repository, "site-archived-card");
        await repository.archiveSiteBloc("site-archived-card", 1);

        const archivedContract = siteSnapshot({
            structure: [{ kind: "slot", slotId: "body" }],
            slots: [
                {
                    id: "body",
                    label: "Body",
                    accepts: [{ kind: "component", tag: "site-archived-card" }],
                },
            ],
        });
        await expect(saveSiteBloc(cms, "site-owner", saveInput(archivedContract))).rejects.toThrow(/is archived/);

        const archivedDefault = siteSnapshot({
            structure: [{ kind: "slot", slotId: "body" }],
            slots: [{ id: "body", label: "Body", accepts: [{ kind: "any-component" }] }],
            defaultContent: "<site-archived-card></site-archived-card>",
        });
        await expect(saveSiteBloc(cms, "site-owner", saveInput(archivedDefault))).rejects.toThrow(/is not accepted/);
    });
});

function saveInput(snapshot: ReturnType<typeof siteSnapshot>) {
    return {
        expectedDraftRevision: 1,
        name: snapshot.name,
        group: snapshot.group,
        description: snapshot.description,
        defaultContent: snapshot.defaultContent,
        snapshot,
    };
}
