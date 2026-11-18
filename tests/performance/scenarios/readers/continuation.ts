import { assertCondition, requireRecord } from "../queries/types";

/** Check every chunk against independently admitted text; never accept gaps or a looping cursor. */
export function assertTextChunk(
    output: unknown,
    expected: string,
    offset: number,
    maximum: number,
    nullableEnd: boolean,
) {
    const row = requireRecord(output);
    assertCondition(Number.isSafeInteger(offset) && offset >= 0 && offset <= expected.length);
    assertCondition(row.offset === offset && typeof row.content === "string" && row.content.length <= maximum);
    assertCondition(row.content === expected.slice(offset, offset + row.content.length));
    const end = offset + row.content.length;
    assertCondition(end <= expected.length && (end === expected.length || end > offset));
    assertCondition(
        end < expected.length ? row.nextOffset === end : row.nextOffset === (nullableEnd ? null : undefined),
    );
    if (!nullableEnd) {
        assertCondition(row.total === expected.length);
    }
    return end;
}

export async function consumeText(
    first: unknown,
    expected: string,
    maximum: number,
    nullableEnd: boolean,
    read: (offset: number) => Promise<unknown>,
) {
    let next = assertTextChunk(first, expected, 0, maximum, nullableEnd);
    const maximumPages = Math.ceil(expected.length / Math.max(1, maximum - 1)) + 1;
    for (let pages = 1; next < expected.length; pages++) {
        assertCondition(pages <= maximumPages);
        next = assertTextChunk(await read(next), expected, next, maximum, nullableEnd);
    }
    assertCondition(next === expected.length);
}
