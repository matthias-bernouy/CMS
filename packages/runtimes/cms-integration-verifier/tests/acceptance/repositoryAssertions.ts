import { expect } from "bun:test";
import { INTEGRATION_PACKAGE_DIGEST_HEADER, computeIntegrationPackageDigest } from "@bernouy/cms-integration-packages";
import { PRODUCTION_RUNNER } from "./fixtureResources";
import { type startOfficialCandidateAcceptance } from "./support";

const MANAGEMENT_BASE = "/.cms/repository-management";
const PUBLIC_BASE = "/.cms/repository";
type Acceptance = Awaited<ReturnType<typeof startOfficialCandidateAcceptance>>;

export async function uploadCandidate(origin: string, bytes: Uint8Array) {
    const response = await fetch(`${origin}${MANAGEMENT_BASE}/api/integrations/candidates`, {
        method: "POST",
        headers: {
            authorization: "Bearer management-secret",
            "content-type": "application/json",
            "content-length": String(bytes.byteLength),
        },
        body: bytes,
    });
    expect(response.status).toBe(202);
    return (await response.json()).candidate;
}

export async function managementJson(origin: string, path: string) {
    const response = await fetch(`${origin}${MANAGEMENT_BASE}${path}`, {
        headers: { authorization: "Bearer management-secret" },
    });
    expect(response.status).toBe(200);
    return await response.json();
}

export async function publicJson(origin: string, path: string) {
    const response = await publicResponse(origin, path);
    expect(response.status).toBe(200);
    return await response.json();
}

export function publicResponse(origin: string, path: string): Promise<Response> {
    return fetch(`${origin}${PUBLIC_BASE}${path}`);
}

export function releasePath(): string {
    return "/api/integrations/release?kind=photo-albums&version=1.1.0";
}

export function packagePath(): string {
    return "/api/integrations/package?kind=photo-albums&version=1.1.0";
}

export async function assertPublishedRelease(fixture: Acceptance): Promise<void> {
    const index = await publicJson(fixture.publicOrigin, "/api/integrations/index?kind=photo-albums");
    expect(index.latest).toBe("1.1.0");
    expect(index.stable).toBe("1.0.0");
    expect(index.versions.map(({ version }: { version: string }) => version).toSorted()).toEqual(["1.0.0", "1.1.0"]);
    const target = index.versions.find(({ version }: { version: string }) => version === "1.1.0");
    expect(target).toMatchObject({ version: "1.1.0" });
    expect(target).not.toHaveProperty("status");

    expect(await publicJson(fixture.publicOrigin, releasePath())).toMatchObject({
        kind: "photo-albums",
        version: "1.1.0",
        packageDigest: fixture.candidate.packageDigest,
        verificationDigest: fixture.candidate.verificationDigest,
        status: "installable",
        installable: true,
        compatibility: { origin: "admission", contractAdmissible: true },
        verification: { origin: "admission", outcome: "passed", runner: PRODUCTION_RUNNER },
        decision: { admissible: true, reasons: [] },
    });
    const exactPackage = await publicResponse(fixture.publicOrigin, packagePath());
    expect(exactPackage.status).toBe(200);
    expect(exactPackage.headers.get(INTEGRATION_PACKAGE_DIGEST_HEADER)).toBe(fixture.candidate.packageDigest);
    expect(await computeIntegrationPackageDigest(await exactPackage.json())).toBe(fixture.candidate.packageDigest);
    await assertCompositeReferences(fixture);
}

async function assertCompositeReferences(fixture: Acceptance): Promise<void> {
    const evidence = await fixture.management.releases.get("photo-albums", "1.1.0");
    if (!evidence?.compatibility || !evidence.verification || !evidence.decision) {
        throw new Error("Published official candidate has incomplete composite evidence");
    }
    const decision = evidence.decision.current;
    expect(decision.admissible).toBeTrue();
    expect(decision.compatibilityReport).toEqual({
        revisionId: evidence.compatibility.currentRevisionId,
        reportDigest: evidence.compatibility.currentReportDigest,
    });
    expect(decision.verificationReport).toEqual({
        revisionId: evidence.verification.currentRevisionId,
        reportDigest: evidence.verification.currentReportDigest,
    });
    expect(decision.migrationReports).toHaveLength(1);
    expect(evidence.migrations).toHaveLength(1);
    expect(decision.migrationReports[0]).toMatchObject({
        revisionId: evidence.migrations[0]?.currentRevisionId,
        reportDigest: evidence.migrations[0]?.currentReportDigest,
    });
}
