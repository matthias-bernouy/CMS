import { expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { docker } from "../official-repository/docker";

const image = process.env.ULVIA_MODEL_REPOSITORY_IMAGE;
test.skipIf(!image)(
    "the production Repository starts and serves hybrid search with no network",
    async () => {
        const name = `ulvia-model-offline-${randomUUID().slice(0, 8)}`;
        try {
            await docker([
                "run",
                "--detach",
                "--name",
                name,
                "--network",
                "none",
                "--read-only",
                "--tmpfs",
                "/tmp:rw,nosuid,nodev,size=256m",
                image!,
            ]);
            let result: { mode?: string; degraded?: boolean; results?: unknown[] } | undefined;
            for (let attempt = 0; attempt < 120; attempt++) {
                const response = await docker(
                    [
                        "exec",
                        name,
                        "bun",
                        "-e",
                        'const r = await fetch("http://127.0.0.1:3000/v1/search", { method: "QUERY", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query: "page collection", limit: 3 }), signal: AbortSignal.timeout(5000) }); if (!r.ok) process.exit(1); console.log(JSON.stringify(await r.json()));',
                    ],
                    true,
                );
                if (!response.code) {
                    result = JSON.parse(response.stdout.trim());
                    if (result?.mode === "hybrid") {
                        break;
                    }
                }
                await Bun.sleep(500);
            }
            if (result?.mode !== "hybrid") {
                const logs = await docker(["logs", "--tail", "30", name], true);
                throw new Error(`Offline production search did not become hybrid: ${logs.stdout}${logs.stderr}`);
            }
            expect(result.degraded).toBe(false);
            expect(result.results?.length).toBeGreaterThan(0);
        } finally {
            await docker(["rm", "--force", "--volumes", name], true);
        }
    },
    180_000,
);
