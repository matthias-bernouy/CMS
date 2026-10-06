import { expect, test } from "bun:test";
import { InMemorySecretStore } from "@bernouy/secret-store";
import { ProviderConnectionWorkflow } from "@bernouy/cms-repository/providers/management";
import type { ProductionGateway } from "../../src/runtime/gateway/createProductionGateway";

test("provider reconnection rotates the credential after revision-checked approval", async () => {
    const report = providerReport();
    const current = storedInstallation("${OLD_PROVIDER_TOKEN}", 3);
    const modified = storedInstallation("${ULVIA_PROVIDER_NEXTSECRET}", 4);
    let preparedChanges: unknown;
    let observedRevision = 0;
    const lifecycle = {
        prepare: async () => {
            throw new Error("unexpected new installation");
        },
        prepareModification: async (scope: unknown, revision: number, changes: unknown) => {
            expect(scope).toEqual({ siteId: "site:site", installationId: "installation-a" });
            expect(revision).toBe(3);
            preparedChanges = changes;
            return preparation(report);
        },
        approve: async () => {
            throw new Error("unexpected approval");
        },
        modify: async () => modified,
        observe: async (_scope: unknown, revision: number) => {
            observedRevision = revision;
            return { ...modified, revision: revision + 1 };
        },
    };
    const gateway = {
        siteId: "site:site",
        manifests: {
            get: async () => ({
                admission: {
                    digest: report.manifest.digest,
                    manifest: {
                        providerId: report.providerId,
                        name: "Ulvia provider",
                        version: report.manifest.version,
                        endpoint: { allowedOrigins: ["http://127.0.0.1:5103"] },
                    },
                },
            }),
        },
        installations: { get: async () => current },
    } as unknown as ProductionGateway;
    const secrets = new InMemorySecretStore();
    await secrets.set("OLD_PROVIDER_TOKEN", "old-token-at-least-twenty");
    const ids = ["next-secret", "preview-ticket"];
    const workflow = new ProviderConnectionWorkflow(gateway, secrets, {
        lifecycle,
        readReport: async () => report,
        createId: () => ids.shift()!,
        now: () => 1_000,
    });

    const preview = await workflow.preview(
        {
            providerId: report.providerId,
            version: report.manifest.version,
            endpoint: "http://127.0.0.1:5103",
            token: "new-token-at-least-twenty",
            installationId: "installation-a",
            revision: 3,
        },
        "admin-a",
    );
    const result = await workflow.approve(preview.ticket, "admin-a");

    expect(preview.operation).toBe("reconnect");
    expect(preparedChanges).toMatchObject({ providerTokenRef: "${ULVIA_PROVIDER_NEXTSECRET}" });
    expect(result).toMatchObject({ operation: "reconnect", observed: true });
    expect(observedRevision).toBe(4);
    expect(await secrets.get("OLD_PROVIDER_TOKEN")).toBeNull();
    expect(await secrets.get("ULVIA_PROVIDER_NEXTSECRET")).toBe("new-token-at-least-twenty");
});

function preparation(report: ReturnType<typeof providerReport>) {
    return {
        kind: "provider-installation-preparation" as const,
        operation: "modify" as const,
        candidate: {
            id: "installation-a",
            siteId: "site:site",
            providerId: report.providerId,
            accountId: report.account.id,
            endpoint: "http://127.0.0.1:5103",
            manifestVersion: report.manifest.version,
            manifestDigest: report.manifest.digest,
            providerTokenRef: "${ULVIA_PROVIDER_NEXTSECRET}",
            configuration: {},
        },
        observation: { observedAt: "2026-10-01T08:00:00.000Z", report },
        preparedAt: "2026-10-01T08:00:00.000Z",
        expectedRevision: 3,
    };
}

function storedInstallation(providerTokenRef: string, revision: number) {
    return {
        installation: {
            id: "installation-a",
            siteId: "site:site",
            providerId: "ulvia.official",
            accountId: "local-dev",
            endpoint: "http://127.0.0.1:5103",
            status: "enabled" as const,
            approval: {
                manifestVersion: "0.1.1",
                manifestDigest: `sha256:${"a".repeat(64)}`,
                approvedAt: "2026-10-01T08:00:00.000Z",
                approvedBy: "admin-a",
            },
            providerTokenRef,
            configuration: {},
            createdAt: "2026-10-01T08:00:00.000Z",
            updatedAt: "2026-10-01T08:00:00.000Z",
        },
        revision,
    };
}

function providerReport() {
    return {
        protocol: "ulvia-provider/v1" as const,
        providerId: "ulvia.official",
        account: { id: "local-dev", label: "Local development" },
        buildVersion: "0.1.1",
        manifest: { version: "0.1.1", digest: `sha256:${"a".repeat(64)}` as const },
        implementations: [] as const,
    };
}
