import { isDeepStrictEqual } from "node:util";
import { join, resolve } from "node:path";
import { withRepositoryWriteLock } from "@bernouy/repository/repository/filesystem/lock";
import { prepareReleasePublication } from "@bernouy/ulvia-cli/publication";
import { command } from "../process";
import { inspectImages } from "../images/inspection";
import { prepareImagePublication } from "../images/registry";
import { readReceipt } from "./receipt";
import { prepareNpmPublication } from "./npm";
import { distributionRoot, publicationOptions } from "./options";
import type { PublicationPhase } from "./options";

export type PublicationPorts = {
    images: typeof inspectImages;
    remoteImages: typeof prepareImagePublication;
    repository: typeof prepareReleasePublication;
    npm: typeof prepareNpmPublication;
    run: typeof command;
};
const ports: PublicationPorts = {
    images: inspectImages,
    remoteImages: prepareImagePublication,
    repository: prepareReleasePublication,
    npm: prepareNpmPublication,
    run: command,
};

export class DistributionPublicationError extends Error {
    constructor(version: string, stage: string, runtimeReady: boolean, cause: unknown) {
        const phase = stage === "runtime" ? "runtime" : "catalogue";
        super(
            [
                `Distribution ${version}: ${stage} phase failed.`,
                cause instanceof Error ? cause.message : "Publication failed.",
                stage === "promotion"
                    ? "Runtime and catalogue are published. npm release-channel promotion remains incomplete."
                    : runtimeReady
                      ? "Runtime is published. Catalogue publication remains incomplete."
                      : "Remote writes may already exist; no automatic rollback was performed.",
                `Resume with the same build: bun run publish --version ${version} --phase ${phase}`,
                ...(stage === "catalogue" && runtimeReady
                    ? [
                          "The receiver may need a newer runtime validator or an explicit upgrade of its selected Repository contract before the catalogue retry.",
                      ]
                    : []),
            ].join("\n"),
            { cause },
        );
        this.name = "DistributionPublicationError";
    }
}

/** Runtime publication is independent of the receiving Ulvia Repository. */
export async function publishDistribution(
    root: string,
    version: string,
    environment: Record<string, string | undefined> = process.env,
    dependencies: PublicationPorts = ports,
    phase: PublicationPhase = "all",
): Promise<void> {
    if (!["all", "runtime", "catalogue"].includes(phase)) {
        throw new Error("Invalid publication phase");
    }
    const source = distributionRoot(root, version);
    const receipt = await readReceipt(source, version);
    async function unchanged(): Promise<void> {
        if (!isDeepStrictEqual(receipt, await readReceipt(source, version))) {
            throw new Error("Build receipt changed during publication; rebuild or restore the exact artifacts");
        }
        if (
            phase !== "catalogue" &&
            !isDeepStrictEqual(receipt.images, await dependencies.images(version, receipt.revision))
        ) {
            throw new Error("Local image tags changed since build; refusing publication");
        }
    }
    let stage = phase === "catalogue" ? "catalogue" : "runtime";
    let runtimeReady = false;
    try {
        await unchanged();
        if (phase !== "runtime") {
            await dependencies.run(["npm", "--version"], { capture: true });
        }
        const images = await dependencies.remoteImages(receipt.images);
        const npm = await dependencies.npm(join(source, "cli", receipt.archive), version);
        await unchanged();
        if (phase !== "catalogue") {
            await images.publish();
            await unchanged();
            await npm.publish();
        }
        await images.verify();
        await npm.verify();
        runtimeReady = true;
        console.log(
            `Runtime ${version} is published and verified; release-channel promotion requires the catalogue phase.`,
        );
        if (phase === "runtime") {
            return;
        }
        stage = "catalogue";
        const repository = await dependencies.repository(join(source, "repository"), environment);
        await unchanged();
        await repository.publish(console.log);
        stage = "promotion";
        await unchanged();
        await images.verify();
        await npm.verify();
        await npm.promote();
        console.log(`Published Ulvia ${version}: runtime, catalogue and npm release channel.`);
    } catch (cause) {
        throw new DistributionPublicationError(version, stage, runtimeReady, cause);
    }
}

if (import.meta.main) {
    const { version, phase } = publicationOptions(Bun.argv.slice(2));
    const root = resolve(import.meta.dir, "../..");
    try {
        await withRepositoryWriteLock(join(root, "artifacts/distributions"), () =>
            publishDistribution(root, version, process.env, ports, phase),
        );
    } catch (error) {
        if (!(error instanceof DistributionPublicationError)) {
            throw error;
        }
        console.error(error.message);
        process.exitCode = 1;
    }
}
