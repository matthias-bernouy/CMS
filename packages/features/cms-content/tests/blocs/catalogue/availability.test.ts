import { describe, expect, test } from "bun:test";
import { InMemoryCmsRepository } from "@bernouy/cms-content";

describe("bloc catalogue availability", () => {
    test("hides inactive collection blocs while retaining their rendering artifact", async () => {
        const repository = new InMemoryCmsRepository();
        await repository.createBloc({
            id: "collection-card",
            name: "Collection card",
            group: "Content",
            description: "",
            catalogue: "inactive",
            viewJS: "cmsRuntime.registerBloc('collection-card', { mount() {} });",
            ownership: { kind: "code-managed" },
        });

        expect(await repository.getBlocsList()).toEqual([]);
        expect((await repository.getBlocsList({ includeInactive: true })).map(({ id }) => id)).toEqual([
            "collection-card",
        ]);
        expect(await repository.getBlocViewJS("collection-card")).toContain("cmsRuntime.registerBloc");
        expect(await repository.getBlocRecord("collection-card")).not.toBeNull();
    });
});
