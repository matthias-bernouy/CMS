import { expect, test } from "bun:test";
import { oauthFixture } from "./fixture";

test("access expires, refresh rotates atomically and old refresh reuse revokes the connection", async () => {
    const f = await oauthFixture();
    const first = await f.exchange(await f.code());
    f.advance(901_000);
    await expect(f.authorization.resolve(first.access_token)).rejects.toThrow("invalid_token");
    const request = {
        grant_type: "refresh_token",
        refresh_token: first.refresh_token,
        client_id: f.client.client_id,
        resource: f.resource,
    };
    await expect(f.authorization.exchange({ ...request, client_id: "other" })).rejects.toThrow("invalid_grant");
    const second = await f.authorization.exchange(request);
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect((await f.authorization.resolve(second.access_token)).subjectId).toBe("admin");
    await expect(f.authorization.exchange(request)).rejects.toThrow("invalid_grant");
    await expect(f.authorization.resolve(second.access_token)).rejects.toThrow("invalid_token");
});

test("a simultaneous refresh cannot mint two valid replacement credentials", async () => {
    const f = await oauthFixture();
    const first = await f.exchange(await f.code());
    const request = {
        grant_type: "refresh_token",
        refresh_token: first.refresh_token,
        client_id: f.client.client_id,
        resource: f.resource,
    };
    const results = await Promise.allSettled([f.authorization.exchange(request), f.authorization.exchange(request)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
});
