import { join, resolve } from "node:path";
import { withRepositoryWriteLock } from "@bernouy/repository/repository/filesystem/lock";
import { prepareReleasePublication } from "@bernouy/ulvia-cli/publication";
import { command } from "../process";
import { inspectImages } from "./images";
import { readManifest, same } from "./manifest";
import { prepareNpmPublication } from "./npm";
import { distributionRoot, distributionVersion } from "./options";

export type PublicationPorts = {
    images: typeof inspectImages;
    repository: typeof prepareReleasePublication;
    npm: typeof prepareNpmPublication;
    run: typeof command;
};
const ports: PublicationPorts = {
    images: inspectImages,
    repository: prepareReleasePublication,
    npm: prepareNpmPublication,
    run: command,
};

/** Preflight local artifacts, Repository ownership and npm conflicts before the first write. */
export async function publishDistribution(
    root: string,
    version: string,
    environment: Record<string, string | undefined> = process.env,
    dependencies: PublicationPorts = ports,
): Promise<void> {
    const source = distributionRoot(root, version);
    const manifest = await readManifest(source, version);
    if (!same(manifest.images, await dependencies.images(version, manifest.revision))) {
        throw new Error("Local image tags changed since build; refusing publication");
    }
    const repository = await dependencies.repository(join(source, "repository"), environment);
    if (!same(repository.coordinates, manifest.resources)) {
        throw new Error("Repository publication differs from the built inventory");
    }
    const publishNpm = await dependencies.npm(join(source, "cli", `cyaxis-ulvia-${version}.tgz`), version);
    // Re-read all bytes after credential/network preflight; never compile sources here.
    if (!same(manifest, await readManifest(source, version))) {
        throw new Error("Distribution changed during publication preflight");
    }
    await repository.publish(console.log);
    for (const image of manifest.images) {
        await dependencies.run(["docker", "push", image.reference]);
    }
    await publishNpm();
    console.log(`Published Ulvia ${version}: contracts, Provider manifest, images and CLI`);
}

if (import.meta.main) {
    const version = distributionVersion(Bun.argv.slice(2), true)!;
    const root = resolve(import.meta.dir, "../..");
    await withRepositoryWriteLock(join(root, "artifacts/distributions"), () => publishDistribution(root, version));
}
