#!/usr/bin/env bun
import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";

export const fakeDockerFixturePath = import.meta.path;
if (import.meta.main) {
    const args = Bun.argv.slice(2);
    const root = process.env.ULVIA_TEST_DOCKER_ROOT!;
    await appendFile(
        `${root}/calls.ndjson`,
        `${JSON.stringify({ args, providerImage: process.env.PROVIDER_IMAGE, edgeImage: process.env.EDGE_IMAGE })}\n`,
    );
    const read = async (name: string) => JSON.parse(await readFile(`${root}/${name}.json`, "utf8").catch(() => "{}"));
    const images = await read("images");
    const containers = await read("containers");
    if (args[0] === "pull") {
        const reference = args[1]!;
        const pinned = reference.includes("@sha256:");
        const separator = pinned ? reference.indexOf("@") : reference.lastIndexOf(":");
        const repository = reference.slice(0, separator);
        const version = pinned ? "infrastructure" : reference.slice(separator + 1);
        const component = repository.endsWith("ulvia-provider")
            ? "provider"
            : repository.endsWith("ulvia-edge")
              ? "edge"
              : "infrastructure";
        const digest = pinned
            ? reference.slice(separator + 1)
            : `sha256:${createHash("sha256").update(reference).digest("hex")}`;
        images[reference] = { component, repository, version, digest };
        images[`${repository}@${digest}`] = images[reference];
        await writeFile(`${root}/images.json`, JSON.stringify(images));
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
                            "io.ulvia.hosting-api": "1",
                            "io.ulvia.maintenance-api": "1",
                            "org.opencontainers.image.version": image.version,
                        },
                    },
                },
            ]),
        );
    } else if (args[0] === "ps") {
        process.stdout.write(
            Object.values(containers)
                .map((row: any) => (args.includes("{{.ID}}") ? row.ID : `${row.ID}\t${row.Service}`))
                .join("\n"),
        );
    } else if (args[0] === "run") {
        const mounts = args.filter((arg) => arg.startsWith("type=bind,src="));
        const input = JSON.parse(args.at(-1)!);
        for (const mount of mounts) {
            const fields = Object.fromEntries(mount.split(",").map((part) => part.split("=")));
            if (fields.dst === "/data") {
                input.data = fields.src;
            }
            if (fields.dst === "/backup") {
                input.backup = fields.src;
            }
        }
        const child = Bun.spawn(
            [process.execPath, "--no-macros", "-e", args[args.indexOf("-e") + 1]!, JSON.stringify(input)],
            { stdout: "inherit", stderr: "inherit" },
        );
        process.exit(await child.exited);
    } else if (["stop", "rm"].includes(args[0]!)) {
        for (const [key, row] of Object.entries(containers) as [string, any][]) {
            if (args.includes(row.ID)) {
                if (args[0] === "rm") {
                    delete containers[key];
                } else {
                    row.State = "exited";
                }
            }
        }
        await writeFile(`${root}/containers.json`, JSON.stringify(containers));
    } else if (args[0] === "logs") {
        process.stdout.write('{"level":"info","message":"ready"}\n{"level":"error","message":"fixture error"}\n');
        if (args.includes("--follow")) {
            setInterval(() => {}, 1000);
        }
    } else if (args[0] === "compose") {
        const generated = args.find((arg) => arg.endsWith("shared-edges.json"));
        const edges = generated
            ? Object.keys(JSON.parse(await readFile(generated, "utf8")).services).filter((name) =>
                  name.startsWith("edge-"),
              )
            : [];
        const services = ["proxy", "mongo", "provider", "mongo-provision", ...edges];
        const up = args.indexOf("up");
        if (
            args.includes("src/maintenance/upgrade.ts") ||
            args.some((arg) => arg.endsWith("/src/maintenance/upgrade.ts"))
        ) {
            if (process.env.ULVIA_TEST_MIGRATION_FAIL === "1") {
                process.exit(1);
            }
            process.stdout.write(
                JSON.stringify({
                    schema: "ulvia.maintenance-plan/v1",
                    digest: "a".repeat(64),
                    instances: 0,
                    forms: 0,
                    versions: 0,
                    submissions: 0,
                    migrations: [],
                }),
            );
        } else if (args.includes("ps")) {
            process.stdout.write(JSON.stringify(Object.values(containers)));
        } else if (up >= 0) {
            const explicit = args.slice(up + 1).filter((arg) => services.includes(arg));
            const selected = explicit.length ? explicit : services;
            for (const service of selected) {
                const image =
                    service === "provider"
                        ? process.env.PROVIDER_IMAGE
                        : service.startsWith("edge-")
                          ? process.env.EDGE_IMAGE
                          : "infrastructure";
                const failed =
                    (service === "proxy" ? images[process.env.PROVIDER_IMAGE!]?.version : images[image!]?.version) ===
                        process.env.ULVIA_TEST_DOCKER_FAIL_VERSION &&
                    (service === process.env.ULVIA_TEST_DOCKER_FAIL_COMPONENT ||
                        (service.startsWith("edge-") && process.env.ULVIA_TEST_DOCKER_FAIL_COMPONENT === "edge"));
                const old = containers[service];
                containers[service] = {
                    ID:
                        old?.Image === image
                            ? old.ID
                            : createHash("sha256").update(`${service}:${image}`).digest("hex").slice(0, 12),
                    Service: service,
                    State: service === "mongo-provision" ? "exited" : "running",
                    Health: failed ? "unhealthy" : "healthy",
                    Image: image,
                };
                await writeFile(`${root}/containers.json`, JSON.stringify(containers));
                if (failed) {
                    process.stderr.write("Simulated image health failure");
                    process.exit(1);
                }
            }
            if (args.includes("--remove-orphans")) {
                for (const name of Object.keys(containers)) {
                    if (!services.includes(name)) {
                        delete containers[name];
                    }
                }
            }
        } else if (args.includes("stop")) {
            for (const row of Object.values(containers) as any[]) {
                row.State = "exited";
            }
        } else if (args.includes("start")) {
            for (const row of Object.values(containers) as any[]) {
                if (row.Service !== "mongo-provision") {
                    row.State = "running";
                }
            }
        } else if (args.includes("down")) {
            for (const name of Object.keys(containers)) {
                delete containers[name];
            }
        }
        await writeFile(`${root}/containers.json`, JSON.stringify(containers));
    } else {
        process.exit(1);
    }
}
