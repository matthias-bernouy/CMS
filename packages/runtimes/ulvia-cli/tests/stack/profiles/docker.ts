#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";

export const fakeDockerFixturePath = import.meta.path;

// Process fixture for client orchestration tests; actual containers have separate acceptance tests.
if (import.meta.main) {
    const args = Bun.argv.slice(2);
    const root = process.env.ULVIA_TEST_DOCKER_ROOT!;
    await appendFile(
        `${root}/calls.ndjson`,
        `${JSON.stringify({
            args,
            providerImage: process.env.PROVIDER_IMAGE,
            edgeImage: process.env.EDGE_IMAGE,
        })}\n`,
    );
    const path = `${root}/images.json`;
    const images = JSON.parse(await readFile(path, "utf8").catch(() => "{}")) as Record<
        string,
        { component: string; repository: string; version: string; digest: string }
    >;
    if (args[0] === "pull") {
        const reference = args[1]!;
        const separator = reference.lastIndexOf(":");
        const repository = reference.slice(0, separator);
        const version = reference.slice(separator + 1);
        const component = repository.endsWith("ulvia-provider") ? "provider" : "edge";
        const digest = `sha256:${createHash("sha256").update(reference).digest("hex")}`;
        images[reference] = { component, repository, version, digest };
        images[`${repository}@${digest}`] = images[reference]!;
        await writeFile(path, JSON.stringify(images));
    } else if (args[0] === "image" && args[1] === "inspect") {
        const image = images[args[2]!];
        if (!image) {
            process.exit(1);
        }
        process.stdout.write(
            JSON.stringify([
                {
                    RepoDigests: [`${image.repository}@${image.digest}`],
                    Config: {
                        Labels: {
                            "io.ulvia.component": image.component,
                            "io.ulvia.stack-api": "1",
                            "org.opencontainers.image.version": image.version,
                        },
                    },
                },
            ]),
        );
    } else if (args[0] === "compose") {
        if (args.includes("ps")) {
            const services = args.some((arg) => arg.endsWith("services.yml"))
                ? ["proxy", "mongo", "provider"]
                : ["edge"];
            process.stdout.write(
                JSON.stringify(services.map((Service) => ({ Service, State: "running", Health: "healthy" }))),
            );
        }
        const reference = process.env.PROVIDER_IMAGE;
        if (
            args.includes("up") &&
            reference &&
            images[reference]?.version === process.env.ULVIA_TEST_DOCKER_FAIL_VERSION
        ) {
            process.stderr.write("Simulated Provider image health failure");
            process.exit(1);
        }
    } else {
        process.exit(1);
    }
}
