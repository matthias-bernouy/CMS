import { expect, test } from "bun:test";
import { BunRunner } from "@bernouy/http-runner";
import { serveForTest } from "@bernouy/http-runner/testing";
import { ProviderOperatorApi } from "../../src/exports/index";
import type { ProviderInstanceLifecycle, CreateProviderInstance } from "@bernouy/hosting/instances";
import type { InstanceCreationAuthority } from "@bernouy/hosting/instances";
import { instanceRecord } from "./instanceFixture";

test("operator creation supplies internal provenance and reports pending work as accepted", async () => {
    const authorities: InstanceCreationAuthority[] = [];
    const lifecycle = {
        create: async (_key: string, _input: CreateProviderInstance, authority: InstanceCreationAuthority) => {
            authorities.push(authority);
            return { instance: instanceRecord("provisioning"), credentials: { instanceAccessToken: "operator-only" } };
        },
    } as unknown as ProviderInstanceLifecycle;
    const token = "operator-token-that-is-long-enough";
    const runner = new BunRunner();
    new ProviderOperatorApi(runner, token, lifecycle);
    const server = serveForTest(runner);
    const input = {
        label: "One",
        cmsUrl: "http://one.localhost",
        administrator: { email: "one@example.test", password: "long-enough-password" },
    };
    const create = (body: unknown) =>
        server.request("POST", "/ulvia/operator/instances", {
            headers: {
                authorization: `Bearer ${token}`,
                "content-type": "application/json",
                "idempotency-key": "create-one",
            },
            body: JSON.stringify(body),
        });
    try {
        const accepted = await create(input);
        expect(accepted.status).toBe(202);
        expect((await accepted.json()).instance.status).toBe("provisioning");
        expect(authorities).toEqual([{ kind: "operator" }]);
        const injected = await create({ ...input, creationAuthority: { kind: "operator" } });
        expect(injected.status).toBe(400);
        expect(authorities).toHaveLength(1);
    } finally {
        server.stop();
    }
});
