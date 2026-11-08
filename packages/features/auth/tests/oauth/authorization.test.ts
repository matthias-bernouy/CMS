import { expect, test } from "bun:test";
import { oauthFixture } from "./fixture";

test("OAuth consent binds the client, exact callback, resource and PKCE verifier", async () => {
    const f = await oauthFixture();
    const code = await f.code();
    for (const change of [
        { client_id: "other" },
        { redirect_uri: "https://attacker.example/callback" },
        { resource: "https://other.example/.cms/mcp" },
        { code_verifier: "a".repeat(64) },
    ]) {
        await expect(f.exchange(code, change)).rejects.toThrow("invalid_grant");
    }
    const token = await f.exchange(code);
    expect(await f.authorization.resolve(token.access_token)).toMatchObject({
        subjectId: "admin",
        mode: "full_access",
    });
    await expect(f.exchange(code)).rejects.toThrow("invalid_grant");
    expect(JSON.stringify(await f.store.list("grant:", 10))).not.toContain(token.refresh_token);
});

test("expired consent and codes fail, and a consent request can only be accepted once", async () => {
    const f = await oauthFixture();
    const pending = await f.prepare();
    await expect(f.authorization.authorize(pending.requestId, "member")).rejects.toThrow("access_denied");
    const accepted = await f.authorization.authorize(pending.requestId, "admin");
    expect(new URL(accepted.redirectUri).searchParams.get("state")).toBe("state-123");
    await expect(f.authorization.authorize(pending.requestId, "admin")).rejects.toThrow("invalid_grant");
    f.advance(61_000);
    await expect(f.exchange(new URL(accepted.redirectUri).searchParams.get("code")!)).rejects.toThrow("invalid_grant");
    const next = await f.prepare();
    f.advance(301_000);
    await expect(f.authorization.authorize(next.requestId, "admin")).rejects.toThrow("invalid_grant");
});

test("concurrent code exchange issues only one connection", async () => {
    const f = await oauthFixture();
    const code = await f.code();
    const results = await Promise.allSettled([f.exchange(code), f.exchange(code)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await f.authorization.list("admin")).items).toHaveLength(1);
});

test("revocation and live administrator demotion invalidate access immediately", async () => {
    const f = await oauthFixture();
    const first = await f.exchange(await f.code());
    const principal = await f.authorization.resolve(first.access_token);
    await f.authorization.revoke(principal.connectionId, "admin");
    await expect(f.authorization.resolve(first.access_token)).rejects.toThrow("invalid_token");
    const second = await f.exchange(await f.code());
    f.demote();
    await expect(f.authorization.resolve(second.access_token)).rejects.toThrow("invalid_token");
    await expect(f.authorization.list("admin")).rejects.toThrow("access_denied");
});

test("denying consent only returns an error to the registered callback", async () => {
    const f = await oauthFixture();
    const pending = await f.prepare();
    const denied = new URL((await f.authorization.deny(pending.requestId)).redirectUri);
    expect(denied.origin).toBe("https://client.example");
    expect(denied.searchParams.get("error")).toBe("access_denied");
    expect((await f.authorization.list("admin")).items).toEqual([]);
    await expect(f.authorization.authorize(pending.requestId, "admin")).rejects.toThrow("invalid_grant");
});

test("clients cannot register dangerous callbacks or bypass S256", async () => {
    const f = await oauthFixture();
    for (const redirect of [
        "javascript:alert(1)",
        "https://user:pass@client.example/callback",
        "http://client.example/callback",
        "https://client.example/#fragment",
    ]) {
        await expect(f.authorization.register({ redirect_uris: [redirect] })).rejects.toThrow();
    }
    for (const change of [
        { code_challenge_method: "plain" },
        { code_challenge: "short" },
        { scope: "other" },
        { redirect_uri: "https://client.example/callback?extra=1" },
    ]) {
        await expect(f.authorization.prepare({ ...f.request, ...change })).rejects.toThrow();
    }
    await expect(f.authorization.resolve("malformed")).rejects.toThrow("invalid_token");
});
