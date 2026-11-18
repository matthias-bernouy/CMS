import { expect, test } from "bun:test";
import { InMemoryContentRepository, ValidatingContentRepository } from "@bernouy/content";
import { validateFavicon } from "content/settings/core/favicon";

test("favicon validation accepts permanent public references and explicit clearing", () => {
    for (const value of [
        "",
        "/logo.svg",
        "/.cms/call/ulvia/cms.files/files/file_test/" + "a".repeat(64),
        "https://cdn.example/icon.png",
        "http://localhost/icon.ico",
    ]) {
        expect(validateFavicon(value)).toBe(value);
    }
});
test.each([
    "javascript:alert(1)",
    "data:image/svg+xml,test",
    "file:///tmp/icon.svg",
    "//another.example/icon.svg",
    "https://user:secret@example.com/icon.svg",
    "/\\example.com/icon.svg",
    "/icon\u0000.svg",
    "x".repeat(4097),
    42,
    null,
])("unsafe favicon %j refuses without changing settings", async (favicon) => {
    const repository = new ValidatingContentRepository(new InMemoryContentRepository());
    const before = await repository.getSystem();
    await expect(repository.updateSystem({ site: { favicon } } as never, 0)).rejects.toThrow();
    expect(await repository.getSystem()).toEqual(before);
    expect(await repository.getSystemRevision()).toBe(0);
});
