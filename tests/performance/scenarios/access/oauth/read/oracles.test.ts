import { expect, test } from "bun:test";
import { assertGrantPage, orderedGrants, verifyGrantPages } from "./oracles";
import { assertInvalidToken } from "./cases";
import type { GrantEvidence } from "./oracles";
const actor = { sub: "owned" };
const envelope = (value: unknown) => ({ resultJson: JSON.stringify(value) });

function grants(): GrantEvidence[] {
    return Array.from({ length: 129 }, (_, index) => ({
        id: index.toString().padStart(43, "0"),
        subjectId: actor.sub,
        clientName: "Owned client",
        token: "private-unit-token",
        createdAfter: 1000,
        createdBefore: 1001,
        revoked: index < 128,
    }));
}
function page(expected: readonly GrantEvidence[], cursor?: string, limit = 25) {
    const rows = orderedGrants(expected).filter((row) => !cursor || row.id > cursor);
    return {
        items: rows.slice(0, limit).map((row) => ({
            id: row.id,
            clientName: row.clientName,
            createdAt: new Date(1000).toISOString(),
            expiresAt: new Date(1000 + 30 * 86400000).toISOString(),
            revoked: row.revoked,
            mode: "full_access",
        })),
        nextCursor: rows.length > limit ? rows[limit - 1]!.id : null,
    };
}

test("OAuth pagination proves all 129 records, bounded pages, exact ordering and exhausted cursor", async () => {
    const expected = grants();
    let requests = 0;
    await verifyGrantPages(async (input) => {
        requests++;
        return envelope(page(expected, input.cursor as string | undefined, Number(input.limit)));
    }, expected);
    expect(requests).toBe(7);
    expect(() => assertGrantPage(envelope(page(expected)), expected)).not.toThrow();
    const duplicate = page(expected);
    duplicate.items[1] = duplicate.items[0]!;
    expect(() => assertGrantPage(envelope(duplicate), expected)).toThrow();
    expect(() => assertGrantPage(envelope({ ...page(expected), nextCursor: null }), expected)).toThrow();
    expect(() => assertGrantPage(envelope({ ...page(expected), token: "private" }), expected)).toThrow();
    const leaked = page(expected);
    Object.assign(leaked.items[0]!, { token: "private" });
    expect(() => assertGrantPage(envelope(leaked), expected)).toThrow();
    const stale = page(expected);
    stale.items[0]!.revoked = false;
    expect(() => assertGrantPage(envelope(stale), expected)).toThrow();
});

test("revocation coverage requires the exact expected protocol refusal, never an arbitrary OAuth failure", () => {
    expect(() => assertInvalidToken(envelope({ error: "invalid_token", status: 401 }))).not.toThrow();
    for (const value of [
        { subjectId: actor.sub },
        { error: "access_denied", status: 403 },
        { error: "invalid_token", status: 500 },
        { error: "invalid_token", status: 401, token: "private" },
    ]) {
        expect(() => assertInvalidToken(envelope(value))).toThrow();
    }
});
