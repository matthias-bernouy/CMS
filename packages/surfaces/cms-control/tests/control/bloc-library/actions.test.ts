import { expect, test } from "bun:test";
import postComposition from "cms-control/api/_content/site-bloc/site-bloc.post";
import { jsonRequest } from "../site-blocs/fixtures";
import { libraryHarness } from "./fixtures";

test("native composition forms generate unique tags while preserving explicit tags", async () => {
    const { cms, repository, site } = await libraryHarness();
    const create = (name: string, tag?: string) =>
        postComposition(
            jsonRequest("https://cms.test/api/site-bloc", "POST", {
                name,
                collectionId: site.id,
                ...(tag ? { tag } : {}),
            }),
            cms,
        );
    const first = await (await create("Été hero")).json();
    const second = await (await create("Été hero")).json();
    expect(first.tag).toMatch(/^site-ete-hero-[0-9a-f-]{36}$/);
    expect(second.tag).not.toBe(first.tag);
    expect((await repository.getBlocRecord(first.tag))?.siteDefinition?.collectionId).toBe(site.id);
    expect((await (await create("Explicit", "site-explicit")).json()).tag).toBe("site-explicit");
});
