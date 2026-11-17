import { expect, test } from "bun:test";
import { InMemoryContentRepository } from "@bernouy/content";
import type { ContentRepository } from "@bernouy/content";
import { previewRepository } from "../../../src/runtime/stores/collections/preview/repository";

function fixture() {
    let calls = 0;
    let fail = false;
    const repository = new InMemoryContentRepository();
    const metadata = [
        { id: "fixture-visible", root: { accepts: ["div"] } },
        { id: "fixture-hidden", root: { accepts: ["div"] }, catalogue: "hidden" },
    ];
    repository.getBlocsList = (async () => {
        calls++;
        if (fail) {
            throw new Error("Failed preview metadata load");
        }
        return structuredClone(metadata);
    }) as ContentRepository["getBlocsList"];
    return { repository, calls: () => calls, fail: (value: boolean) => (fail = value) };
}

test("a private preview shares its fixed Bloc metadata while Page reads and writes remain live", async () => {
    const f = fixture();
    const preview = previewRepository(f.repository);
    const [visible, complete] = await Promise.all([
        preview.getBlocsList(),
        preview.getBlocsList({ includeHidden: true }),
    ]);
    expect(visible.map(({ id }) => id)).toEqual(["fixture-visible"]);
    expect(complete).toHaveLength(2);
    expect(Object.isFrozen(complete[0]!.root)).toBe(true);
    for (let page = 0; page < 42; page++) {
        await preview.getBlocsList();
        await preview.getBlocsList({ includeHidden: true });
    }
    expect(f.calls()).toBe(1);
    await preview.insertPage("/new", "New");
    expect(await preview.getPage("/new")).not.toBeNull();
    expect(await f.repository.getPage("/new")).not.toBeNull();
    await preview.getBlocsList({ projection: "rendering" });
    expect(f.calls()).toBe(2);
    await previewRepository(f.repository).getBlocsList();
    expect(f.calls()).toBe(3);
});

test("oversized and failed preview metadata loads are not retained", async () => {
    const f = fixture();
    const preview = previewRepository(f.repository, 1);
    f.fail(true);
    await expect(preview.getBlocsList()).rejects.toThrow("Failed preview metadata load");
    f.fail(false);
    const first = await preview.getBlocsList();
    expect(first).toHaveLength(1);
    await preview.getBlocsList();
    expect(f.calls()).toBe(3);
    expect(() => previewRepository(f.repository, -1)).toThrow("budget");
});

test("separate preview instances cannot share Bloc metadata", async () => {
    const a = fixture();
    const b = fixture();
    const left = await previewRepository(a.repository).getBlocsList({ includeHidden: true });
    const right = await previewRepository(b.repository).getBlocsList({ includeHidden: true });
    expect(left).not.toBe(right);
    expect(left[0]).not.toBe(right[0]);
    expect(a.calls()).toBe(1);
    expect(b.calls()).toBe(1);
});
