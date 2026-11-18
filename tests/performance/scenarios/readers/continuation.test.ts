import { expect, test } from "bun:test";
import { assertTextChunk, consumeText } from "./continuation";

test("continued readers require exact bytes, progress, total and terminal cursor", async () => {
    const text = "verified metadata";
    const chunk = (offset: number) => ({
        content: text.slice(offset, offset + 4),
        offset,
        total: text.length,
        ...(offset + 4 < text.length ? { nextOffset: offset + 4 } : {}),
    });
    const visited: number[] = [];
    await consumeText(chunk(0), text, 4, false, async (offset) => {
        visited.push(offset);
        return chunk(offset);
    });
    expect(visited).toEqual([4, 8, 12, 16]);
    for (const row of [
        { ...chunk(0), content: "fake" },
        { ...chunk(0), nextOffset: 0 },
        { ...chunk(0), total: 99 },
        { ...chunk(0), offset: 1 },
        { ...chunk(0), content: "", nextOffset: 0 },
        { ...chunk(0), content: text },
    ]) {
        expect(() => assertTextChunk(row, text, 0, 4, false)).toThrow();
    }
    expect(() => assertTextChunk({ offset: 0, content: "doc", nextOffset: null }, "doc", 0, 16384, true)).not.toThrow();
    expect(() => assertTextChunk({ offset: 0, content: "doc" }, "doc", 0, 16384, true)).toThrow();
});
