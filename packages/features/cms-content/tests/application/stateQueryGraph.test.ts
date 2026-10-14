import { describe, expect, test } from "bun:test";
import { InMemoryCmsRepository, ValidatingCmsRepository } from "@bernouy/cms-content";

describe("ValidatingCmsRepository — synchronized query graph", () => {
    test("rejects a cycle formed by sibling composition Blocs", async () => {
        const repo = new ValidatingCmsRepository(new InMemoryCmsRepository());
        const composition = (id: string, input: string, output: string) => ({
            id,
            name: id,
            group: "",
            description: "",
            viewJS: "",
            ownership: { kind: "code-managed" as const },
            compositionHTML: `<section cms-query="catalog:items.list as ${id.replaceAll("-", "_")}" cms-query-input='{"dependency":{"from":"state","key":"@page:${input}"}}' cms-query-listen="@page:${input}" cms-sync="@page:${output}"></section>`,
        });
        await repo.createBloc(composition("fixture-left-query", "fixture-right", "fixture-left"));
        await repo.createBloc(composition("fixture-right-query", "fixture-left", "fixture-right"));

        await expect(
            repo.insertPage(
                "/cycle",
                "Cycle",
                "<fixture-left-query></fixture-left-query><fixture-right-query></fixture-right-query>",
            ),
        ).rejects.toThrow("automatic state query cycle");

        await repo.insertPage("/acyclic", "Acyclic", "<fixture-left-query></fixture-left-query>");
        expect((await repo.getPage("/acyclic"))?.content).toContain("fixture-left-query");

        await repo.createBloc(composition("fixture-duplicate-query", "fixture-source", "fixture-left"));
        await expect(
            repo.insertPage(
                "/duplicate",
                "Duplicate",
                "<fixture-left-query></fixture-left-query><fixture-duplicate-query></fixture-duplicate-query>",
            ),
        ).rejects.toThrow("multiple automatic query producers");
    });

    test("rejects a cycle inside a composed Bloc artifact", async () => {
        const repo = new ValidatingCmsRepository(new InMemoryCmsRepository());

        await expect(
            repo.createBloc({
                id: "fixture-cyclic-query",
                name: "Cyclic query",
                group: "",
                description: "",
                viewJS: "",
                ownership: { kind: "code-managed" },
                compositionHTML: `<section>
                    <div cms-query="catalog:items.list as left" cms-query-input='{"right":{"from":"state","key":"@page:fixture-right"}}' cms-query-listen="@page:fixture-right" cms-sync="@page:fixture-left"></div>
                    <div cms-query="catalog:items.list as right" cms-query-input='{"left":{"from":"state","key":"@page:fixture-left"}}' cms-query-listen="@page:fixture-left" cms-sync="@page:fixture-right"></div>
                </section>`,
            }),
        ).rejects.toThrow("automatic state query cycle");
    });
});
