import { expect, test } from "bun:test";
import { InMemoryContentRepository, ValidatingContentRepository, pageDocument } from "@bernouy/cms-content";

test("Pages store independent documents and reject obsolete provenance", async () => {
    const repo = new ValidatingContentRepository(new InMemoryContentRepository());
    await repo.insertPage("/about", "About", "");
    const page = (await repo.getPage("/about"))!;
    expect(pageDocument(page)).toEqual({ html: "" });
    expect(Object.hasOwn(page, "origin")).toBe(false);
    await expect(repo.updatePage({ id: page.id, origin: {} } as never, page.revision)).rejects.toThrow(
        "unsupported Page property",
    );
});
