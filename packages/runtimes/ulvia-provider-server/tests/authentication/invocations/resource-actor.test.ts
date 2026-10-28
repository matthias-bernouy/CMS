import { expect, test } from "bun:test";
import { gatewayRoute } from "../../../../../features/cms-gateway/tests/fixtures";
import { createInvocationIssuer } from "../../../src/runtime/gateway/providers/authority/issueInvocation";
import { verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
async function fixture() {
    const route = structuredClone(await gatewayRoute({ binary: true, resource: true }));
    route.installation.observation!.observedAt = new Date().toISOString();
    let kind: "user" | "administrator" | null = "administrator";
    let beforeSecret = () => {};
    const secret = "resource-secret-" + "s".repeat(32);
    const issue = createInvocationIssuer(
        "site-a",
        { resolve: async () => route, isCurrent: async () => true },
        { get: async () => ({ grants: { default: "allow-selected", denied: [] } }) } as never,
        { authorize: async () => true, consumeBudget: async () => true },
        async () => {
            beforeSecret();
            return secret;
        },
        undefined,
        {
            getOrCreate: async () => "provider-alias",
            resolve: async (_scope, alias) => (alias === "provider-alias" ? "cms-global-subject" : null),
        },
        async () => kind,
    );
    const input = {
        requestId: crypto.randomUUID(),
        installationId: "install-a",
        contractId: "catalog",
        contractVersion: "1.0.0",
        capabilityId: "item.list",
    };
    return {
        issue,
        secret,
        input,
        setKind: (value: typeof kind) => {
            kind = value;
        },
        beforeSecret: (fn: () => void) => {
            beforeSecret = fn;
        },
    };
}
test("resource identity is a verified Provider alias and never a CMS subject", async () => {
    const f = await fixture();
    const { token } = await f.issue({ ...f.input, subjectId: "provider-alias", actorKind: "administrator" });
    const claims = verifyProviderInvocationToken(token, f.secret);
    expect(claims).toMatchObject({ subjectId: "provider-alias", actorKind: "administrator" });
    expect(JSON.stringify(claims)).not.toContain("cms-global-subject");
    await expect(
        f.issue({ ...f.input, subjectId: "another-provider-alias", actorKind: "administrator" }),
    ).rejects.toMatchObject({ status: 403 });
});
test("revoked or downgraded authority cannot become a signed administrator resource context", async () => {
    const f = await fixture();
    f.setKind("user");
    await expect(
        f.issue({ ...f.input, subjectId: "provider-alias", actorKind: "administrator" }),
    ).rejects.toMatchObject({ status: 403 });
    f.setKind("administrator");
    f.beforeSecret(() => f.setKind(null));
    await expect(
        f.issue({ ...f.input, subjectId: "provider-alias", actorKind: "administrator" }),
    ).rejects.toMatchObject({ status: 403 });
});
test("an anonymous resource has no alias and machine identity cannot supply a user role", async () => {
    const f = await fixture();
    expect(
        verifyProviderInvocationToken((await f.issue({ ...f.input, actorKind: "anonymous" })).token, f.secret),
    ).toMatchObject({ actorKind: "anonymous" });
    await expect(f.issue({ ...f.input, actorKind: "administrator" })).rejects.toMatchObject({ status: 403 });
    await expect(
        f.issue({
            ...f.input,
            actorKind: "anonymous",
            sourceInstallationId: "source",
            sourceCredentialFingerprint: "f".repeat(64),
        }),
    ).rejects.toMatchObject({ status: 403 });
});
