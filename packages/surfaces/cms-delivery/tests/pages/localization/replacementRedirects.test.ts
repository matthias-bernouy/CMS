import { expect, test } from "bun:test";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import { mountPublicPages } from "../publicPage.fixture";

test("a replaced URL follows its original language when that replacement translation is added", async () => {
    const repository = new InMemoryCmsRepository();
    await repository.updateSystem({
        site: { language: "fr", additionalLanguages: ["en"], activeLanguages: ["en"] } as never,
    });
    await repository.insertPage("/old", "Old");
    await repository.insertPage("/new", "New");
    const old = (await repository.getPage("/old"))!;
    const replacement = (await repository.getPage("/new"))!;
    await repository.updatePage({ id: old.id, visible: true });
    await repository.updatePage({ id: replacement.id, visible: true });
    await repository.setPagePaths(old.id, { fr: "/old", en: "/old" });
    await repository.deletePageWithAlternative(old.id, replacement.id);
    const mounted = mountPublicPages({ repository });

    const before = await mounted.get(new Request("https://example.test/en/old"));
    expect(before.status).toBe(301);
    expect(before.headers.get("location")).toBe("/new");
    expect(before.headers.get("cache-control")).toBe("no-store");

    await repository.setPagePaths(replacement.id, { fr: "/new", en: "/new" });
    const after = await mounted.get(new Request("https://example.test/en/old"));
    expect(after.status).toBe(301);
    expect(after.headers.get("location")).toBe("/en/new");
});
