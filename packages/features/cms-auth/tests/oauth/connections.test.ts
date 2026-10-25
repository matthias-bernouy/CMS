import { expect, test } from "bun:test";
import { oauthFixture } from "./fixture";

test("connection pages preserve every active and revoked grant beyond 256, exclude foreign and expired records, and support revocation", async () => {
    const f = await oauthFixture();
    const original = await f.exchange(await f.code());
    const principal = await f.authorization.resolve(original.access_token);
    const prototype = (await f.store.get(`grant:${principal.connectionId}`))!;
    for (let i = 0; i < 260; i++) {
        await f.store.create({
            ...prototype,
            id: `grant:${String(i).padStart(43, "0")}`,
            value: { ...(prototype.value as object), revoked: true },
        });
    }
    await f.store.create({ ...prototype, id: `grant:${"A".repeat(43)}`, expiresAt: 0 });
    await f.store.create({
        ...prototype,
        id: `grant:${"B".repeat(43)}`,
        value: { ...(prototype.value as object), subjectId: "other" },
    });
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
        const page = await f.authorization.list("admin", { limit: 50, ...(cursor ? { cursor } : {}) });
        seen.push(...page.items.map((x) => x.id));
        cursor = page.nextCursor ?? undefined;
        pages++;
    } while (cursor);
    expect(pages).toBe(6);
    expect(new Set(seen).size).toBe(261);
    expect(seen).toContain(principal.connectionId);
    expect(seen).not.toContain("A".repeat(43));
    expect(seen).not.toContain("B".repeat(43));
    await f.authorization.revoke(principal.connectionId, "admin");
    await expect(f.authorization.resolve(original.access_token)).rejects.toThrow("invalid_token");
    await expect(f.authorization.list("admin", { cursor: "invalid" })).rejects.toThrow("invalid_request");
});
