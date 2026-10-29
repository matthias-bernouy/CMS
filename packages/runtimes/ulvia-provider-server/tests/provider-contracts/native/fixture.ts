import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import type { ProviderExecutionState } from "@bernouy/cms-repository/providers/selections";
import type { ReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { gatewayRoute } from "../../../../../features/cms-gateway/tests/fixtures";
import { specializedRoute } from "../../../../../features/cms-gateway/tests/invocation/specialization/fixture";
import { createNativeInvocationAuthorizer } from "../../../src/runtime/gateway/native/authorizeInvocation";

export async function nativeFixture(options: { specialized?: boolean; control?: boolean } = {}) {
    const base = await gatewayRoute({ contractId: options.control ? "ulvia.cms.installations" : "catalog" });
    const special = options.specialized ? await specializedRoute() : undefined;
    const selection = special?.selection ?? base.selection;
    const installed = special?.installation ?? base.installation;
    const report = structuredClone(installed.observation!.report);
    const records = new Map(
        [base.release, ...(special ? [special.childRelease] : [])].map((record) => [
            `${record.admission.release.contractId}@${record.admission.release.version}`,
            record,
        ]),
    );
    const model = {
        state: {
            selections: {
                siteId: "site-a",
                revision: 1,
                dependencyRevision: "initial",
                grants: { default: "allow-selected", denied: [] },
                plan: { selections: [selection] },
            },
            installations: [installed],
        } as ProviderExecutionState,
        reads: [] as string[][],
        now: Math.floor(Date.now() / 1000),
        artifactReads: 0,
        beforeRead: () => {},
        beforeArtifact: async () => {},
        artifactUnavailable: false,
    };
    const authorize = createNativeInvocationAuthorizer({
        siteId: "site-a",
        report,
        nowSeconds: () => model.now,
        releases: {
            get: async (id, version) => {
                model.artifactReads++;
                await model.beforeArtifact();
                return model.artifactUnavailable ? null : (records.get(`${id}@${version}`) ?? null);
            },
        } as ReleaseCatalogue,
        executionState: {
            read: async (siteId, ids) => {
                if (siteId !== "site-a") {
                    throw new Error("Unexpected site");
                }
                model.reads.push([...ids]);
                model.beforeRead();
                return structuredClone({
                    ...model.state,
                    installations: model.state.installations.filter((item) => ids.includes(item.installation.id)),
                });
            },
        },
    });
    const issuedAt = model.now;
    const claims = {
        version: 1 as const,
        requestId: crypto.randomUUID(),
        issuedAt,
        expiresAt: issuedAt + 30,
        instanceId: report.instanceId,
        connectionId: selection.installationId,
        contractId: options.control ? "ulvia.cms.installations" : "catalog",
        contractVersion: "1.0.0",
        capabilityId: "item.list",
    } as ProviderInvocationClaims;
    return { authorize, claims, model, report, selection, installed };
}
