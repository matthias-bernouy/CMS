#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";

export const fakeDockerFixturePath = import.meta.path;

if (import.meta.main) {
    const args = Bun.argv.slice(2);
    const root = process.env.ULVIA_TEST_DOCKER_ROOT!;
    const log = `${root}/calls.ndjson`;
    await appendFile(log, `${JSON.stringify({ args, image: process.env.OFFICIAL_REPOSITORY_IMAGE })}\n`);
    const imagesPath = `${root}/images.json`;
    const images = JSON.parse(await readFile(imagesPath, "utf8").catch(() => "{}")) as Record<
        string,
        { version: string; digest: string }
    >;
    if (args[0] === "pull") {
        const reference = args[1]!;
        const version = reference.split(":").at(-1)!;
        const digest = `sha256:${createHash("sha256").update(version).digest("hex")}`;
        images[reference] = { version, digest };
        images[`docker.io/cyaxis/ulvia-official-repository@${digest}`] = { version, digest };
        await writeFile(imagesPath, JSON.stringify(images));
    } else if (args[0] === "image" && args[1] === "inspect") {
        const image = images[args[2]!];
        if (!image) {
            process.exit(1);
        }
        process.stdout.write(
            JSON.stringify([
                {
                    RepoDigests: [`docker.io/cyaxis/ulvia-official-repository@${image.digest}`],
                    Config: {
                        Labels: {
                            "io.ulvia.component": "repository",
                            "io.ulvia.stack-api": "1",
                            "org.opencontainers.image.version": image.version,
                        },
                    },
                },
            ]),
        );
    } else if (args[0] === "compose") {
        if (args.includes("ps")) {
            process.stdout.write(JSON.stringify([{ Service: "repository", State: "running", Health: "healthy" }]));
        }
        if (args.includes("up") && process.env.ULVIA_TEST_DOCKER_FAIL_VERSION) {
            const digest = createHash("sha256").update(process.env.ULVIA_TEST_DOCKER_FAIL_VERSION).digest("hex");
            if (process.env.OFFICIAL_REPOSITORY_IMAGE?.endsWith(digest)) {
                process.stderr.write("Simulated image health failure");
                process.exit(1);
            }
        }
    } else {
        process.exit(1);
    }
}
