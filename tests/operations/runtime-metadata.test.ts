import { afterAll, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { compileOfficialFeatures, compileOfficialManifest } from "@bernouy/ulvia-provider/build";
import { createImplementationArtifact } from "@bernouy/ulvia-sdk/build";
import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/repository/contracts/catalogue";
import { writeExecutionSupport } from "../../infra/execution-support";

const roots: string[] = [];
const outputs = [
    "packages/surfaces/ulvia-provider/dist/generated/runtime.json",
    "packages/runtimes/ulvia-provider-server/dist/generated/supported-releases.json",
    "packages/runtimes/cms-edge-server/dist/generated/supported.json",
    "packages/runtimes/cms-edge-server/dist/generated/routing-contract.json",
];

afterAll(async () => {
    await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});

test("runtime metadata is reproducible from SDK sources in an empty output tree and preserves exact pins", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-runtime-metadata-"));
    roots.push(root);
    const bootstrap = join(root, "bootstrap");
    const manifest = join(root, "packages/runtimes/ulvia-provider-server/package.json");
    await mkdir(dirname(manifest), { recursive: true });
    await writeFile(manifest, JSON.stringify({ version: "test-build" }));
    const compiled = await compileOfficialFeatures();
    const catalogue = new InMemoryReleaseCatalogue();
    await publishContractSet(catalogue, compiled.contracts);
    const provider = await compileOfficialManifest(catalogue, compiled);
    const runtimeArtifact = createImplementationArtifact(compiled);
    const routingContract = compiled.contracts.find(({ release }) => release.contractId === "ulvia/provider.routing")!;
    for (const [path, value] of [
        ["providers/primary-provider/definition.json", provider.canonicalJson],
        ["contracts/provider.routing/definition.json", routingContract.canonicalJson],
        ["feature-runtime.json", JSON.stringify(runtimeArtifact)],
    ]) {
        const target = join(bootstrap, path!);
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, value!);
    }
    const source = resolve(
        import.meta.dir,
        "../../packages/surfaces/ulvia-provider/src/capabilities/features/compatibility/retained.json",
    );
    const retained = await readFile(source);
    const snapshots = [];
    for (let attempt = 0; attempt < 2; attempt++) {
        await writeExecutionSupport(bootstrap, root);
        const bytes = await Promise.all(outputs.map((path) => readFile(join(root, path))));
        snapshots.push(bytes.map((value) => createHash("sha256").update(value).digest("hex")));
        const runtime = JSON.parse(bytes[0]!.toString());
        const support = JSON.parse(bytes[1]!.toString());
        expect(runtime).toEqual(runtimeArtifact);
        expect(support.buildVersion).toBe("test-build");
        for (const pin of runtime.implementations) {
            expect(support.releases).toContainEqual({
                contractId: pin.contractId,
                version: pin.version,
                digest: pin.digest,
            });
        }
        const routing = JSON.parse(bytes[3]!.toString());
        expect(routing.canonicalJson).toBe(routingContract.canonicalJson);
        expect(support.releases).toContainEqual({
            contractId: routing.contractId,
            version: routing.version,
            digest: routing.digest,
        });
        await Promise.all(
            [...new Set(outputs.map((path) => dirname(join(root, path))))].map((path) =>
                rm(path, { recursive: true, force: true }),
            ),
        );
    }
    expect(snapshots[1]).toEqual(snapshots[0]);
    expect(await readFile(source)).toEqual(retained);
}, 15_000);
