import { expect, test } from "bun:test";
import { InMemoryPatRepository, InMemoryUsersRepository, MAX_PERSONAL_ACCESS_TOKENS } from "@bernouy/cms-auth";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import type { UlviaProviderGateway, ProviderCapabilityInvocationContext } from "@bernouy/ulvia-provider";
import { registerPersonalAccessCapabilities } from "../../../src/capabilities/access/pats";

test("ordinary accounts create, list and revoke only their own PATs through trusted aliases", async () => {
    const pats = new InMemoryPatRepository();
    const users = new InMemoryUsersRepository();
    await users.upsert({ sub: "member-a" });
    await users.upsert({ sub: "member-b" });
    const aliases = new Map([
        ["alias-a", "member-a"],
        ["alias-b", "member-b"],
    ]);
    const gateway = {
        identities: {
            resolve: async ({ providerId }: { providerId: string }, alias: string) =>
                providerId === "ulvia/primary-provider" ? (aliases.get(alias) ?? null) : null,
        },
    } as unknown as UlviaProviderGateway;
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerPersonalAccessCapabilities(dispatcher, { pats, users }, gateway);
    const context = (subjectId?: string): ProviderCapabilityInvocationContext => ({
        siteId: "default",
        providerId: "ulvia/primary-provider",
        contractVersion: "1.0.0",
        requestId: crypto.randomUUID(),
        ...(subjectId ? { subjectId } : {}),
    });
    const invoke = (capability: string, input: Record<string, unknown>, alias?: string) =>
        dispatcher.invoke("ulvia/cms.access", capability, input, context(alias));
    const created = (await invoke("create-personal-access-token", { name: "CLI" }, "alias-a")) as {
        token: string;
        metadata: { id: string };
    };
    expect(await pats.verify(created.token)).toEqual({ sub: "member-a" });
    expect(await invoke("list-personal-access-tokens", {}, "alias-b")).toEqual({ tokens: [] });
    const listed = await invoke("list-personal-access-tokens", {}, "alias-a");
    expect(JSON.stringify(listed)).not.toContain(created.token);
    expect(JSON.stringify(listed)).not.toContain("member-a");
    await expect(invoke("revoke-personal-access-token", { id: created.metadata.id }, "alias-b")).rejects.toMatchObject({
        code: "NOT_FOUND",
    });
    expect(await pats.verify(created.token)).toEqual({ sub: "member-a" });
    await expect(
        invoke("create-personal-access-token", { name: "forged", sub: "member-b" }, "alias-a"),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(invoke("create-personal-access-token", { name: "anonymous" })).rejects.toMatchObject({
        code: "ACTOR_UNAVAILABLE",
    });
    expect(await invoke("revoke-personal-access-token", { id: created.metadata.id }, "alias-a")).toEqual({
        revoked: true,
    });
    expect(await pats.verify(created.token)).toBeNull();
    for (let index = 0; index < MAX_PERSONAL_ACCESS_TOKENS; index++) {
        await invoke("create-personal-access-token", { name: `token-${index}` }, "alias-a");
    }
    await expect(invoke("create-personal-access-token", { name: "excess" }, "alias-a")).rejects.toMatchObject({
        code: "TOKEN_LIMIT",
        status: 409,
    });
    await users.delete("member-a");
    await expect(invoke("list-personal-access-tokens", {}, "alias-a")).rejects.toMatchObject({
        code: "ACTOR_UNAVAILABLE",
    });
});
