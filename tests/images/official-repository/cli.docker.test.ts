import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { repositoryContainer } from "./docker";

const image = process.env.ULVIA_REPOSITORY_DOCKER_IMAGE;

test.skipIf(!image)(
    "CLI login, official claim, publication and rotation use saved keys against a local real-image Repository",
    async () => {
        const container = await repositoryContainer(image!);
        const data = await mkdtemp(join(tmpdir(), "repository-cli-docker-"));
        const workspace = resolve(import.meta.dir, "../../..");
        const environment = {
            ...process.env,
            ULVIA_DATA_DIR: data,
            ULVIA_CONFIG_DIR: join(data, "config"),
            ULVIA_REPOSITORY_URL: "",
        };
        const run = async (args: string[]) => {
            const child = Bun.spawn(
                [process.execPath, join(workspace, "packages/runtimes/ulvia-cli/src/index.ts"), ...args],
                { env: environment, stdout: "pipe", stderr: "pipe" },
            );
            const [code, stdout, stderr] = await Promise.all([
                child.exited,
                new Response(child.stdout).text(),
                new Response(child.stderr).text(),
            ]);
            if (code) {
                throw new Error(`CLI ${args[0]} failed: ${stderr}`);
            }
            return stdout;
        };
        try {
            await container.start();
            const base = await container.ready();
            expect(await run(["repository", "login", base])).toContain("connection saved");
            await run(["namespace", "claim", "ulvia.official"]);
            await run(["release", join(workspace, "packages/official-repository/contracts/ulvia.cms.emailer")]);
            const coordinate = "ulvia.official/ulvia.cms.emailer@1.0.0";
            await run(["push", "contract", coordinate]);
            await run(["identity", "create", "replacement"]);
            await run(["namespace", "rotate", "ulvia.official", "--replacement-identity", "replacement"]);
            expect(JSON.parse(await run(["namespace", "status", "ulvia.official"])).revision).toBe(2);
            await run(["yank", "contract", coordinate, "--reason", "Local regression"]);
            await run(["restore", "contract", coordinate]);
            expect((await fetch(`${base}v1/contracts/ulvia.official/ulvia.cms.emailer/1.0.0`)).status).toBe(200);
            await run(["repository", "logout"]);
            expect(await run(["identity", "list"])).toContain("replacement");
        } finally {
            await container.close();
            await rm(data, { recursive: true, force: true });
        }
    },
    30_000,
);
