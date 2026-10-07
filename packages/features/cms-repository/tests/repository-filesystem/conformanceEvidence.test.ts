import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
    admitConformanceEvidence,
    admitConformanceSuite,
    admitContractRelease,
} from "@bernouy/cms-repository/contracts";
import {
    FilesystemRepositoryPublicationUploadStore,
    FilesystemRepositoryPublicationRegistry,
    RepositoryReadEndpoint,
} from "@bernouy/cms-repository/repository/filesystem";
import { RemoteRepositoryClient, RepositoryMutationEndpoint } from "@bernouy/cms-repository/repository/publication";

const directories: string[] = [];
const contractSource = await Bun.file(
    new URL("../../fixtures/contracts/protocol-v1/conformance.contract.json", import.meta.url),
).json();
const suiteSource = await Bun.file(
    new URL("../../fixtures/contracts/protocol-v1/conformance.suite.json", import.meta.url),
).json();

afterEach(async () => {
    await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

test("publishes immutable evidence only for an exact provider and contract release", async () => {
    const root = await temporaryDirectory();
    const registry = new FilesystemRepositoryPublicationRegistry(root);
    const contract = await admitContractRelease(structuredClone(contractSource));
    await registry.publish({ kind: "contract", canonicalJson: contract.canonicalJson, assets: [] });
    const providerResult = await registry.publish({
        kind: "provider-manifest",
        canonicalJson: JSON.stringify(providerManifest(contract.digest)),
        assets: [],
    });
    const suite = await admitConformanceSuite(structuredClone(suiteSource), contract);
    const evidence = await admitConformanceEvidence({
        kind: "conformance-evidence",
        protocol: "ulvia-conformance-evidence/v1",
        id: "00000000-0000-4000-8000-000000000001",
        publisherId: "ulvia.official",
        providerId: "ulvia.example",
        providerManifest: { version: "1.0.0", digest: providerResult.digest },
        providerBuildVersion: "1.2.3",
        contract: {
            publisherId: contract.release.publisherId,
            id: contract.release.contractId,
            version: contract.release.version,
            digest: contract.digest,
        },
        suite: { version: suite.suite.version, digest: suite.digest, canonicalJson: suite.canonicalJson },
        runner: { name: "ulvia.conformance-runner", version: "1.0.0" },
        startedAt: "2026-10-07T10:00:00.000Z",
        finishedAt: "2026-10-07T10:00:01.000Z",
        status: "passed",
        scenarios: [
            {
                id: "item-roundtrip",
                status: "passed",
                durationMs: 10,
                calls: ["create", "find", "read", "delete", "missing"].map((id) => ({
                    id,
                    status: "passed",
                    attempts: 1,
                    durationMs: 1,
                })),
            },
        ],
    });

    const first = await registry.publishEvidence(evidence.canonicalJson);
    const second = await registry.publishEvidence(evidence.canonicalJson);
    const response = await new RepositoryReadEndpoint(root).handle(
        new Request(
            "https://repository.example/v1/conformance-evidence/ulvia.example/catalog.demo/00000000-0000-4000-8000-000000000001",
        ),
    );

    expect(first).toMatchObject({ added: true, digest: evidence.digest });
    expect(second).toMatchObject({ added: false, digest: evidence.digest });
    expect(response?.status).toBe(200);
    expect(response?.headers.get("etag")).toBe(`"${evidence.digest}"`);
    expect(await response!.text()).toBe(evidence.canonicalJson);

    const token = "e".repeat(32);
    const reads = new RepositoryReadEndpoint(root);
    const mutations = new RepositoryMutationEndpoint(registry, {
        token,
        uploads: new FilesystemRepositoryPublicationUploadStore(root),
    });
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        fetch: async (request) =>
            (await mutations.handle(request)) ?? (await reads.handle(request)) ?? new Response(null, { status: 404 }),
    });
    try {
        const remote = new RemoteRepositoryClient(`http://127.0.0.1:${server.port}`, token);
        expect(await remote.pushConformanceEvidence(evidence.canonicalJson)).toMatchObject({ added: false });
        const pulled = await remote.pullConformanceEvidence({
            providerId: "ulvia.example",
            contractId: "catalog.demo",
            evidenceId: evidence.evidence.id,
        });
        expect(pulled.canonicalJson).toBe(evidence.canonicalJson);
    } finally {
        server.stop(true);
    }
});

function providerManifest(contractDigest: string) {
    return {
        kind: "provider-manifest",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        providerId: "ulvia.example",
        name: "Ulvia Example Provider",
        version: "1.0.0",
        provenance: { publisherId: "ulvia.official", publishedAt: "2026-10-07T00:00:00Z" },
        buildVersionRange: ">=1.0.0 <2.0.0",
        endpoint: { allowedOrigins: ["https://provider.example.com"] },
        configuration: { type: "object", properties: {}, required: [] },
        credentialSlots: [],
        implementations: [{ contractId: "catalog.demo", version: "0.1.0", digest: contractDigest, requires: [] }],
    };
}

async function temporaryDirectory(): Promise<string> {
    const path = await mkdtemp(join(tmpdir(), "repository-conformance-evidence-"));
    directories.push(path);
    return path;
}
