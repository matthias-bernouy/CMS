import { expect, test } from "bun:test";
import { assertAccountPage, assertPatListing } from "./oracles";

const member = (index: number) => ({
    sub: `owned-${index}`,
    email: `owned-${index}@performance.test`,
    administrator: false,
    administratorRevision: index === 0 ? 8 : 0,
    createdAt: new Date(1_700_000_000_000 + index).toISOString(),
    lastSeenAt: new Date(1_700_000_000_000 + index).toISOString(),
});

test("member pagination rejects stale authority, foreign or duplicate rows, truncation and incorrect totals", () => {
    const expected = Array.from({ length: 100 }, (_, index) => member(index));
    const valid = { users: expected.slice(0, 25), total: 100, page: 1, limit: 25, hasMore: true };
    expect(() => assertAccountPage(valid, expected, 1, 25)).not.toThrow();
    expect(() =>
        assertAccountPage({ users: [], total: 100, page: 5, limit: 25, hasMore: false }, expected, 5, 25),
    ).not.toThrow();
    for (const change of [
        { users: valid.users.slice(1) },
        { total: 99 },
        { page: 2 },
        { limit: 100 },
        { hasMore: false },
        { users: [member(1), ...valid.users.slice(1)] },
        { users: [{ ...member(0), administratorRevision: 0 }, ...valid.users.slice(1)] },
        { users: [{ ...member(0), administrator: true }, ...valid.users.slice(1)] },
        { users: [{ ...member(0), email: "foreign@performance.test" }, ...valid.users.slice(1)] },
    ]) {
        expect(() => assertAccountPage({ ...valid, ...change }, expected, 1, 25)).toThrow();
    }
});

test("PAT lists compare the complete public metadata set without accepting a leaked secret or revoked record", () => {
    const expected = Array.from({ length: 32 }, (_, index) => ({
        id: `owned-${index}`,
        name: `Owned ${index}`,
        createdAt: new Date(1_700_000_000_000).toISOString(),
        expiresAt: null,
    }));
    expect(() => assertPatListing({ tokens: expected.toReversed() }, expected)).not.toThrow();
    for (const tokens of [
        expected.slice(1),
        [...expected, { ...expected[0]!, id: "foreign" }],
        [{ ...expected[0]!, token: "must-not-be-disclosed" }, ...expected.slice(1)],
        [{ ...expected[0]!, name: "stale" }, ...expected.slice(1)],
        [expected[1]!, ...expected.slice(1)],
    ]) {
        expect(() => assertPatListing({ tokens }, expected)).toThrow();
    }
});
