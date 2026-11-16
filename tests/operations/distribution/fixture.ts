import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalArtifactFiles, LocalContractReleases } from "@bernouy/repository/repository/filesystem";
import { distributionRoot } from "../../../infra/distribution/options";
import { fileHash } from "../../../infra/distribution/files";
import { writeManifest } from "../../../infra/distribution/manifest";
import type { ImageArtifact } from "../../../infra/distribution/images";

export async function distributionFixture(version = "1.2.3") {
    const root = await mkdtemp(join(tmpdir(), "ulvia-distribution-"));
    const destination = distributionRoot(root, version);
    const revision = "f".repeat(40);
    const images: ImageArtifact[] = ["edge", "provider"].map((component) => ({
        component: component as "edge" | "provider",
        reference: `docker.io/cyaxis/ulvia-${component}:${version}`,
        id: `sha256:${(component === "edge" ? "a" : "b").repeat(64)}`,
    }));
    await mkdir(join(destination, "cli"), { recursive: true });
    const archive = `cyaxis-ulvia-${version}.tgz`;
    await writeFile(join(destination, "cli", archive), "Exact built archive fixture");
    await writeFile(
        join(destination, "cli", `cyaxis-ulvia-${version}.json`),
        JSON.stringify({
            schema: "ulvia.cli-release.v1",
            package: "@cyaxis/ulvia",
            version,
            stackVersion: version,
            revision,
            archive,
            sha256: await fileHash(join(destination, "cli", archive)),
        }),
    );
    const repository = join(destination, "repository");
    await mkdir(repository);
    await new LocalContractReleases(new LocalArtifactFiles(repository)).publish(
        JSON.stringify({
            kind: "contract",
            protocol: "ulvia-provider/v1",
            schemaDialect: "ulvia-schema/v1",
            contractId: "example/simple",
            version: "1.0.0",
            publisherId: "example",
            name: "Simple",
            capabilities: [
                {
                    id: "ping",
                    access: "public",
                    behavior: { sensitive: false, effect: "query", execution: "sync" },
                    input: { type: "object", properties: {}, required: [] },
                    output: { type: "null" },
                    errors: [],
                    bindings: [
                        {
                            id: "http",
                            transport: "http",
                            method: "GET",
                            path: "/ping",
                            response: { successStatuses: [204], contentTypes: [], errorStatuses: {} },
                        },
                    ],
                },
            ],
        }),
    );
    const manifest = await writeManifest(destination, version, revision, images);
    return {
        root,
        destination,
        version,
        revision,
        images,
        manifest,
        archive: join(destination, "cli", archive),
        close: () => rm(root, { recursive: true, force: true }),
    };
}
