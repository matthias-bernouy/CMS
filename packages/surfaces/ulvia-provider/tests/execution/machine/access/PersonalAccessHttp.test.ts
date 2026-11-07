import { expect, test } from "bun:test";
import { InMemoryPatRepository, InMemoryUsersRepository } from "@bernouy/cms-auth";
import { compileProviderRoutes } from "@bernouy/cms-gateway/provider/server";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import { NOOP_LOGGER } from "@bernouy/logging";
import type { UlviaProviderGateway } from "@bernouy/ulvia-provider";
import { accessServices } from "./services";
import { accessTransport } from "./transport";
import { createProviderContractRelay } from "../../../../src/transport/relay";
import { resolvedContract } from "../../messages/fixtures";

test("the admitted Access HTTP bindings expose self-service PATs without administrator access", async () => {
    const contract = await resolvedContract("ulvia/cms.access");
    const pats = new InMemoryPatRepository();
    const users = new InMemoryUsersRepository();
    await users.upsert({ sub: "member-a" });
    await users.upsert({ sub: "member-b" });
    const gateway = {
        identities: {
            resolve: async (_installation: unknown, alias: string) =>
                alias === "alias-a" ? "member-a" : alias === "alias-b" ? "member-b" : null,
        },
    } as unknown as UlviaProviderGateway;
    const { dispatcher } = await accessTransport(accessServices({ pats, users, governance: gateway }));
    const relay = createProviderContractRelay(
        compileProviderRoutes([contract]),
        dispatcher,
        { siteId: "default", providerId: "ulvia/primary-provider" },
        NOOP_LOGGER,
    );
    const invoke = async (id: string, method: string, path: string, input?: unknown, alias = "alias-a") => {
        const definition = contract.capabilities.find(({ definition }) => definition.id === id)!.definition;
        expect(definition.access).toBe("authenticated");
        const claims: ProviderInvocationClaims = {
            version: 1,
            requestId: crypto.randomUUID(),
            instanceId: "instance-a",
            contractId: contract.release.contractId,
            contractVersion: contract.release.version,
            capabilityId: id,
            subjectId: alias,
            issuedAt: 0,
            expiresAt: 9999999999,
        };
        return (await relay(
            new Request(`https://provider.test${path}`, {
                method,
                headers: { "content-type": "application/json", "x-ulvia-request-id": claims.requestId },
                ...(input === undefined ? {} : { body: JSON.stringify(input) }),
            }),
            claims,
        ))!;
    };
    const created = await invoke("create-personal-access-token", "POST", "/personal-access-tokens", {
        name: "CLI",
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(created.status).toBe(200);
    const body = await created.json();
    expect(await pats.verify(body.token)).toEqual({ sub: "member-a" });
    const listed = await invoke("list-personal-access-tokens", "GET", "/personal-access-tokens");
    expect(listed.status).toBe(200);
    const records = await listed.json();
    expect(records.tokens[0].id).toBe(body.metadata.id);
    expect(JSON.stringify(records)).not.toContain(body.token);
    expect(JSON.stringify(records)).not.toContain("member-a");

    const path = `/personal-access-tokens/${body.metadata.id}`;
    const refused = await invoke("revoke-personal-access-token", "DELETE", path, undefined, "alias-b");
    expect(refused.status).toBe(404);
    expect((await refused.json()).error.code).toBe("NOT_FOUND");
    expect(await pats.verify(body.token)).toEqual({ sub: "member-a" });
    const invalid = await invoke("create-personal-access-token", "POST", "/personal-access-tokens", {
        name: "   ",
    });
    expect(invalid.status).toBe(422);
    expect(await pats.list("member-a")).toHaveLength(1);
    expect(await pats.list("member-b")).toHaveLength(0);
    const forged = await invoke("create-personal-access-token", "POST", "/personal-access-tokens", {
        name: "CLI with an unbound subject field",
        sub: "member-b",
    });
    expect(forged.status).toBe(200);
    expect(await pats.verify((await forged.json()).token)).toEqual({ sub: "member-a" });
    expect(await pats.list("member-b")).toHaveLength(0);
    const revoked = await invoke("revoke-personal-access-token", "DELETE", path);
    expect(revoked.status).toBe(200);
    expect(await revoked.json()).toEqual({ revoked: true });
    expect(await pats.verify(body.token)).toBeNull();
});
