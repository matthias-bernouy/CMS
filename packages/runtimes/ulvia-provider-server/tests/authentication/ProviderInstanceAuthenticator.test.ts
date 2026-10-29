import { describe, expect, test } from "bun:test";
import { providerInvocationKeyId, signProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import { ProviderInstanceAuthenticator } from "../../src/runtime/authentication/ProviderInstanceAuthenticator";
import { materialFixture, TOKEN, INVOCATION_SECRET, INSTANCE_ID } from "./material/fixture";

function invocation(instanceId = INSTANCE_ID, secret = INVOCATION_SECRET) {
    const issuedAt = Math.floor(Date.now() / 1000);
    return signProviderInvocationToken(secret, {
        version: 1,
        requestId: crypto.randomUUID(),
        instanceId,
        contractId: "ulvia.cms.content",
        contractVersion: "1.0.0",
        capabilityId: "pages.list",
        connectionId: "native",
        issuedAt,
        expiresAt: issuedAt + 30,
    });
}

describe("ProviderInstanceAuthenticator", () => {
    test("resolves control, report and signed invocation credentials to one ready instance", async () => {
        const f = materialFixture();
        const authenticator = new ProviderInstanceAuthenticator(f.reader);
        expect((await authenticator.authenticateControlToken(TOKEN))?.id).toBe(INSTANCE_ID);
        expect((await authenticator.authenticateReportToken(TOKEN))?.id).toBe(INSTANCE_ID);
        expect((await authenticator.authenticateReportToken(INVOCATION_SECRET))?.id).toBe(INSTANCE_ID);
        expect((await authenticator.authenticateInvocationToken(invocation()))?.claims.instanceId).toBe(INSTANCE_ID);
        expect(f.decrypts).toBe(1);
    });

    test("the report credential never becomes control authority or an unsigned invocation", async () => {
        const f = materialFixture();
        const authenticator = new ProviderInstanceAuthenticator(f.reader);
        expect(await authenticator.authenticateControlToken(INVOCATION_SECRET)).toBeNull();
        expect(await authenticator.authenticateInvocationToken(INVOCATION_SECRET)).toBeNull();
        expect(await authenticator.authenticateReportToken("wrong".repeat(16))).toBeNull();
        expect(await authenticator.authenticateInvocationToken(invocation("instance:other"))).toBeNull();
        const signed = invocation();
        expect(await authenticator.authenticateInvocationToken(`${signed.slice(0, -3)}bad`)).toBeNull();
    });

    test("a capability lease cannot bypass fresh credential or instance revocation with a hot cache", async () => {
        const f = materialFixture();
        const authenticator = new ProviderInstanceAuthenticator(f.reader);
        const token = invocation();
        expect(await authenticator.authenticateInvocationToken(token)).not.toBeNull();
        f.document!.enabled = false;
        expect(await authenticator.authenticateInvocationToken(token)).toBeNull();
        expect(await authenticator.authenticateControlToken(TOKEN)).toBeNull();
        expect(await authenticator.authenticateReportToken(INVOCATION_SECRET)).toBeNull();
        f.document!.enabled = true;
        f.document!.instance.status = "disabled";
        expect(await authenticator.authenticateInvocationToken(token)).toBeNull();
        expect(f.decrypts).toBe(1);
    });

    test("rotated ciphertext and key metadata reject previous signatures and control tokens", async () => {
        const f = materialFixture();
        const authenticator = new ProviderInstanceAuthenticator(f.reader);
        const token = invocation();
        expect(await authenticator.authenticateInvocationToken(token)).not.toBeNull();
        const nextSecret = "N".repeat(43);
        f.document!.invocationKeyId = providerInvocationKeyId(nextSecret);
        f.document!.accessTokenHash = "new-hash";
        f.document!.secret.ciphertext = Buffer.from("rotated");
        f.decrypt = async () =>
            JSON.stringify({
                instanceAccessToken: "A".repeat(43),
                invocationSecret: nextSecret,
                sessionSecret: "s".repeat(64),
                kekHex: "0".repeat(64),
            });
        expect(await authenticator.authenticateInvocationToken(token)).toBeNull();
        expect(await authenticator.authenticateControlToken(TOKEN)).toBeNull();
        expect(await authenticator.authenticateInvocationToken(invocation(INSTANCE_ID, nextSecret))).not.toBeNull();
    });
});
