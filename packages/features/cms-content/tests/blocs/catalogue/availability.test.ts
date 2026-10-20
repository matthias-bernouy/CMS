import { describe, expect, test } from "bun:test";
import { InMemoryCmsRepository } from "@bernouy/cms-content";

describe("bloc catalogue availability", () => {
    test("hides catalogue resources while retaining their rendering artifact", async () => {
        const repository = new InMemoryCmsRepository();
        await repository.createBloc({
            id: "collection-card",
            name: "Collection card",
            group: "Content",
            description: "",
            catalogue: "hidden",
            viewJS: "cmsRuntime.registerBloc('collection-card', { mount() {} });",
            kind: "component",
            markupHTML: "<slot></slot>",
            ownership: { kind: "code-managed" },
        });

        expect(await repository.getBlocsList()).toEqual([]);
        expect((await repository.getBlocsList({ includeHidden: true })).map(({ id }) => id)).toEqual([
            "collection-card",
        ]);
        expect(await repository.getBlocViewJS("collection-card")).toContain("cmsRuntime.registerBloc");
        expect(await repository.getBlocRecord("collection-card")).not.toBeNull();
    });
});
