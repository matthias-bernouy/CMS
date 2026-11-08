import { expect, test } from "bun:test";
import { RenderingResourceReads } from "@bernouy/content/rendering";
import { createMongoContentRepository } from "./contentMongoFixture";

test("Mongo Bloc lists consume bodyless metadata while preserving visibility, requirements and scoped revision reads", async () => {
    const { repository, db } = createMongoContentRepository("tenant_a_");
    const requirement = { contractId: "acme/files", capabilityId: "files.read", versionRange: "^1.0.0" };
    const artifact = {
        id: "site-card",
        kind: "component",
        name: "Card",
        group: "Base",
        description: "Card",
        markupHTML: "",
        root: { accepts: ["div"] },
        ownership: { kind: "site-builder", definitionId: "site-card" },
        requires: [requirement],
        uses: ["helper-card"],
        styleCSS: "scoped styles",
        browser: { frames: { origins: ["self"], sandbox: [] } },
    };
    const records = [
        {
            _id: "site-card",
            ownership: artifact.ownership,
            artifact,
            hasBehavior: true,
            siteDefinition: { publishedRevision: 4 },
        },
        {
            _id: "hidden-card",
            ownership: { kind: "code-managed" },
            artifact: { ...artifact, id: "hidden-card", catalogue: "hidden" },
            hasBehavior: false,
        },
        {
            _id: "draft-card",
            ownership: { kind: "site-builder", definitionId: "draft-card" },
            artifact: null,
            hasBehavior: false,
            siteDefinition: {},
        },
    ];
    const queries: { filter: unknown; projection: Record<string, unknown> }[] = [];
    Object.assign(db.get("tenant_a_blocs"), {
        find: (filter: unknown, options: { projection: Record<string, unknown> }) => {
            queries.push({ filter, projection: options.projection });
            return { toArray: async () => structuredClone(records) };
        },
    });
    repository.getBlocRecords = async () => {
        throw new Error("Full artifact reads are forbidden for metadata lists");
    };
    const reads = new RenderingResourceReads();
    const [first, second] = await Promise.all([
        repository.getBlocsList({ projection: "rendering" }, reads),
        repository.getBlocsList({ projection: "rendering" }, reads),
    ]);
    expect(queries).toHaveLength(1);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
        id: "site-card",
        requires: [requirement],
        uses: ["helper-card"],
        hasBehavior: true,
        styleCSS: "scoped styles",
        browser: artifact.browser,
    });
    expect(await repository.getSiteBlocsRevision(reads)).toBe('[["draft-card",null],["site-card",4]]');
    Object.assign(first[0]!.requires![0]!, { versionRange: "^2.0.0" });
    expect(second[0]!.requires).toEqual([requirement]);
    const hidden = await repository.getBlocsList({ projection: "rendering", includeHidden: true }, reads);
    expect(hidden.map((bloc) => [bloc.id, bloc.hasBehavior])).toEqual([
        ["site-card", true],
        ["hidden-card", false],
    ]);
    expect(queries).toHaveLength(2);
    const projection = queries[0]!.projection;
    for (const field of [
        "artifact",
        "artifact.viewJS",
        "artifact.source",
        "siteDefinition",
        "artifact.initialDocument",
        "artifact.defaultContent",
        "artifact.slots",
        "artifact.settings",
        "artifact.thumbnail",
    ]) {
        expect(Object.hasOwn(projection, field)).toBe(false);
    }
    expect(projection["artifact.requires"]).toBe(1);
    expect(projection["siteDefinition.publishedRevision"]).toBe(1);
    expect(projection.hasBehavior).toBeDefined();
    await repository.getBlocsList({ projection: "catalogue" }, reads);
    expect(queries).toHaveLength(3);
    expect(queries[2]!.projection["artifact.initialDocument"]).toBe(1);
    expect(queries[2]!.projection["artifact.slots"]).toBe(1);
    reads.close();
    await expect(repository.getBlocsList({}, reads)).rejects.toThrow("closed");
});
