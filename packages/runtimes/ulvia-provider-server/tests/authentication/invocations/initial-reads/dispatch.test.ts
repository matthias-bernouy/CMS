import { expect, test } from "bun:test";
import { CapabilityGateway, GatewayAuthorityReads } from "@bernouy/cms-gateway";
import { initialReadsFixture, invocation } from "./fixture";

test("generic dispatch shares one initial capture through grant checking and HTTP token issuance", async () => {
    const f = await initialReadsFixture();
    expect(await f.gateway.invoke(invocation)).toMatchObject({ kind: "success", output: { items: ["one"] } });
    expect(f.captures).toBe(2);
    expect(f.payloadReads).toBe(0);
    expect(f.sends).toBe(1);
    expect(await f.gateway.invoke(invocation)).toMatchObject({ kind: "success" });
    expect(f.captures).toBe(4);
    expect(f.contexts).toHaveLength(2);
    expect(f.contexts[0]).not.toBe(f.contexts[1]);
});

for (const kind of ["grant", "installation"] as const) {
    test(`initial reads cannot authorize a ${kind} revoked during secret resolution`, async () => {
        const f = await initialReadsFixture();
        f.beforeSecret = () => f.revoke(kind);
        await expect(f.gateway.invoke(invocation)).rejects.toThrow();
        expect(f.captures).toBe(2);
        expect(f.sends).toBe(0);
    });
}

test("prepared dispatch requires a fencing transport and rejects another site's context", async () => {
    const f = await initialReadsFixture();
    expect(() => new CapabilityGateway({ ...f.options, transportFencesRoute: false })).toThrow(
        "live transport authority fence",
    );
    const gateway = new CapabilityGateway({
        ...f.options,
        prepareRoute: async (value) => ({
            ...(await f.options.prepareRoute!(value)),
            reads: new GatewayAuthorityReads("site-b"),
        }),
    });
    await expect(gateway.invoke(invocation)).rejects.toThrow("another site");
    expect(f.sends).toBe(0);
});

test("untrusted invocation fields cannot inject preparation and access probes retain independent current reads", async () => {
    const f = await initialReadsFixture();
    await expect(
        f.gateway.invoke({ ...invocation, authorityReads: new GatewayAuthorityReads("site-a") } as never),
    ).rejects.toThrow("unsupported field");
    expect(f.contexts).toHaveLength(0);
    await f.gateway.assertAuthorized(invocation);
    expect(f.contexts).toHaveLength(0);
    expect(f.payloadReads).toBe(1);
    expect(f.captures).toBe(3);
    expect(f.sends).toBe(0);
});
