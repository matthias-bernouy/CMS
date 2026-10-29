import { expect, test } from "bun:test";
import { createMachinePreparer } from "../../../src/runtime/gateway/providers/authority/prepareMachine";
import { providerCredentialFingerprint } from "@bernouy/cms-gateway/access/providers";
import type { ProviderDispatchPreparation } from "@bernouy/cms-gateway/protocol";
const credential = "opaque-provider-credential-" + "a".repeat(32);
const input = {
    token: credential,
    deadline: Date.now() + 15_000,
    invocation: {
        requestId: crypto.randomUUID(),
        installationId: "target",
        contractId: "catalog",
        contractVersion: "1.0.0",
        capabilityId: "read",
        bodyBytes: 17,
    },
};
test("the combined broker derives source provenance from authentication and forwards every dispatch fence", async () => {
    const calls: ProviderDispatchPreparation[] = [];
    const prepare = createMachinePreparer(
        { authenticate: async (token) => (token === credential ? "verified-source" : null) },
        async (value) => {
            calls.push(value);
            return { token: "signed", instanceId: "target-instance", delegation: null };
        },
    );
    expect(await prepare(input)).toMatchObject({ sourceInstallationId: "verified-source" });
    expect(calls[0]).toMatchObject({
        actor: {
            kind: "provider",
            installationId: "verified-source",
            credentialFingerprint: providerCredentialFingerprint(credential),
        },
        invocation: {
            ...input.invocation,
            sourceInstallationId: "verified-source",
            sourceCredentialFingerprint: providerCredentialFingerprint(credential),
        },
    });
    await expect(prepare({ ...input, token: "revoked" })).rejects.toMatchObject({ status: 403 });
    expect(calls).toHaveLength(1);
    const revoked = createMachinePreparer({ authenticate: async () => "verified-source" }, async () => {
        throw Object.assign(new Error("revoked at signing"), { status: 403 });
    });
    await expect(revoked(input)).rejects.toMatchObject({ status: 403 });
});
