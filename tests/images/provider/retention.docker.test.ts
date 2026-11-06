import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { docker } from "../../integration/instance/docker";

const image = process.env.ULVIA_RETENTION_PROVIDER_IMAGE;

test.skipIf(!image)(
    "Provider retention preflight and startup use bundled artifacts without a reachable Repository",
    async () => {
        const prefix = `ulvia-retention-${randomUUID()}`;
        const network = `${prefix}-network`;
        const mongo = `${prefix}-mongo`;
        const provider = `${prefix}-provider`;
        const environment = {
            MONGO_URL: "mongodb://mongo:27017/ulvia_provider_control?retryWrites=false",
            CMS_REPOSITORY_URL: "https://repository-unavailable.invalid",
            CMS_SESSION_SECRET: randomUUID(),
            CMS_FILES_DIR: "/var/lib/cms/files",
            CMS_KEK_ACTIVE_ID: "test",
            CMS_KEK_RING_JSON: JSON.stringify({ test: "a".repeat(64) }),
            ULVIA_PROVIDER_PUBLIC_URL: "http://ulvia-provider:5103",
            ULVIA_PROVIDER_OPERATOR_TOKEN: randomUUID(),
        };
        const args = [
            "--network",
            network,
            "--read-only",
            "--memory",
            "1g",
            "--tmpfs",
            "/tmp:rw,nosuid,nodev,size=256m",
            "--tmpfs",
            "/var/lib/cms/files:rw,nosuid,nodev,uid=1000,gid=1000,mode=0700,size=64m",
            ...Object.entries(environment).flatMap(([key, value]) => ["--env", `${key}=${value}`]),
        ];
        try {
            await docker(["network", "create", "--internal", network]);
            await docker([
                "run",
                "--detach",
                "--name",
                mongo,
                "--network",
                network,
                "--network-alias",
                "mongo",
                "--memory",
                "512m",
                "mongo:7.0.37@sha256:d5b3ca8c3f3cdce78d44870dc0871b76d5235e9b2ad4ea6bea5d1fbff8027703",
                "--wiredTigerCacheSizeGB",
                "0.25",
            ]);
            let ready = false;
            for (let attempt = 0; attempt < 60; attempt++) {
                const result = await docker(
                    ["exec", mongo, "mongosh", "--quiet", "--eval", "quit(db.runCommand({ping:1}).ok ? 0 : 1)"],
                    true,
                );
                if (result.code === 0) {
                    ready = true;
                    break;
                }
                await Bun.sleep(200);
            }
            expect(ready).toBe(true);
            const collections = async () =>
                (
                    await docker([
                        "exec",
                        mongo,
                        "mongosh",
                        "--quiet",
                        "--eval",
                        'JSON.stringify(db.getSiblingDB("ulvia_provider_control").getCollectionNames())',
                    ])
                ).stdout.trim();
            const before = await collections();
            const preflight = await docker(
                [
                    "run",
                    "--rm",
                    ...args,
                    "--entrypoint",
                    "bun",
                    image!,
                    "--no-macros",
                    "run",
                    "packages/runtimes/ulvia-provider-server/src/checkRetention.ts",
                ],
                true,
            );
            expect(preflight.code, preflight.stderr).toBe(0);
            expect(await collections()).toBe(before);
            await docker(["run", "--detach", "--name", provider, ...args, image!]);
            ready = false;
            for (let attempt = 0; attempt < 100; attempt++) {
                const response = await docker(
                    [
                        "exec",
                        provider,
                        "bun",
                        "-e",
                        "const r=await fetch('http://127.0.0.1:5103/ulvia/operator/instances',{headers:{authorization:'Bearer '+process.env.ULVIA_PROVIDER_OPERATOR_TOKEN}}); await r.body?.cancel(); process.exit(r.ok ? 0 : 1)",
                    ],
                    true,
                );
                if (response.code === 0) {
                    ready = true;
                    break;
                }
                const state = await docker(["inspect", provider, "--format", "{{.State.Status}}"]);
                if (state.stdout.trim() !== "running") {
                    break;
                }
                await Bun.sleep(250);
            }
            const logs = await docker(["logs", "--tail", "80", provider], true);
            expect(ready, logs.stderr + logs.stdout).toBe(true);
        } finally {
            await docker(["rm", "--force", "--volumes", provider, mongo], true);
            await docker(["network", "rm", network], true);
        }
    },
    150_000,
);
