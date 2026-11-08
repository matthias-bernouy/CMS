import { expect, test } from "bun:test";
import { InMemoryContentRepository, createContentReader } from "@bernouy/content";
import { RenderingResourceReads } from "@bernouy/content/rendering";
import type { TBlocWrite, TPage } from "@bernouy/content";

const a = { contractId: "ulvia/cms.files", capabilityId: "files.list", versionRange: "^1.0.0" };
const b = { contractId: "ulvia/cms.secrets", capabilityId: "secrets.list", versionRange: "^1.0.0" };
const page: TPage = {
    id: "page",
    revision: 1,
    path: "/view",
    title: "View",
    description: "",
    visible: true,
    tags: [],
    content: '<div cms-bloc="outer-panel"></div>',
};

async function graph() {
    const repository = new InMemoryContentRepository();
    const artifact = (id: string, requires: TBlocWrite["requires"], uses: string[] = []): TBlocWrite => ({
        id,
        kind: "component",
        name: id,
        group: "Base",
        description: "",
        viewJS: "",
        markupHTML: "<slot></slot>",
        root: { accepts: ["div"] },
        requires,
        uses,
    });
    await repository.createBloc(artifact("outer-panel", [a], ["inner-card", "side-card", "last-card"]));
    await repository.createBloc(artifact("inner-card", [b]));
    await repository.createBloc(artifact("side-card", [b]));
    await repository.createBloc(artifact("last-card", [a]));
    await repository.createBloc(artifact("unused-panel", [{ ...a, capabilityId: "files.delete" }]));
    return repository;
}

test("ordinary Pages retain used Bloc constraints with two batched frontier reads and no scalar loads", async () => {
    const repository = await graph();
    const reads: string[][] = [];
    const load = repository.getBlocViewsJS.bind(repository);
    repository.getBlocViewsJS = async (tags) => {
        reads.push([...tags]);
        return load(tags);
    };
    repository.getBlocViewJS = async () => {
        throw new Error("Unexpected scalar load");
    };
    expect(await repository.getPageRequirements(page)).toEqual([a, b]);
    expect(reads.map((tags) => [...tags].sort())).toEqual([["outer-panel"], ["inner-card", "last-card", "side-card"]]);
    expect(await repository.getPageRequirements({ ...page, content: "<p>Public</p>" })).toEqual([]);
    expect(reads).toHaveLength(2);
});

test("one rendering scope shares catalogue reads without sharing mutable results or instance data", async () => {
    const repository = await graph();
    const other = await graph();
    let loads = 0;
    const original = repository.getBlocRecords.bind(repository);
    repository.getBlocRecords = async () => {
        loads++;
        return original();
    };
    const reads = new RenderingResourceReads();
    const [first, second] = await Promise.all([
        repository.getBlocsList({ includeHidden: true, projection: "rendering" }, reads),
        repository.getBlocsList({ includeHidden: true, projection: "rendering" }, reads),
    ]);
    expect(loads).toBe(1);
    first[0]!.name = "Changed";
    expect(second[0]!.name).not.toBe("Changed");
    await other.replaceBloc({ ...(await other.getBlocRecord("outer-panel"))!.artifact!, requires: [b] });
    expect((await other.getBlocsList({ includeHidden: true, projection: "rendering" }, reads))[0]?.requires).toEqual([
        b,
    ]);
    expect(
        (await repository.getBlocsList({ includeHidden: true, projection: "rendering" }, reads))[0]?.requires,
    ).toEqual([a]);
    reads.close();
    await expect(repository.getBlocsList({ includeHidden: true, projection: "rendering" }, reads)).rejects.toThrow(
        "closed",
    );
});

test("render input assembly reads stored Bloc records once for both access constraints and rendering", async () => {
    const repository = await graph();
    await repository.insertPage(page.path, page.title, page.content);
    const stored = (await repository.getPage(page.path))!;
    await repository.updatePage({ id: stored.id, visible: true });
    let loads = 0;
    const load = repository.getBlocRecords.bind(repository);
    repository.getBlocRecords = async () => {
        loads++;
        return load();
    };
    const inputs = await createContentReader(repository).getPageRenderInputs(page.path);
    expect(inputs.route?.kind).toBe("current");
    if (inputs.route?.kind === "current") {
        expect(inputs.route.page.requirements).toEqual([a, b]);
    }
    expect(loads).toBe(1);
});
