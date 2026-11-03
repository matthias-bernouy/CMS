import { expect, test } from "bun:test";
import { docker } from "../official-repository/docker";
import { offlineScriptPath } from "./offline";

const images = [
    { name: "provider", image: process.env.ULVIA_MODEL_PROVIDER_IMAGE, runtime: "ulvia-provider-server" },
    { name: "repository", image: process.env.ULVIA_MODEL_REPOSITORY_IMAGE, runtime: "official-repository-server" },
];
for (const { name, image, runtime } of images) {
    test.skipIf(!image)(
        `${name} image embeds and searches offline with fresh data volumes and a read-only root`,
        async () => {
            const script = `/app/packages/runtimes/${runtime}/offline-model.ts`;
            const args = [
                "run",
                "--rm",
                "--network",
                "none",
                "--read-only",
                "--tmpfs",
                "/tmp:rw,nosuid,nodev,size=256m",
                "--mount",
                `type=bind,source=${offlineScriptPath},target=${script},readonly`,
                "--entrypoint",
                "bun",
            ];
            const result = await docker([...args, image!, "--no-macros", "run", script]);
            expect(JSON.parse(result.stdout.trim())).toEqual({ dimensions: 384, mode: "hybrid", first: "shop" });
            const missing = await docker([
                ...args,
                "--env",
                "ULVIA_EMBEDDING_MODEL_DIR=/tmp/missing",
                image!,
                "--no-macros",
                "run",
                script,
                "--expect-missing",
            ]);
            expect(JSON.parse(missing.stdout.trim())).toEqual({ missingModelRefused: true });
        },
        120_000,
    );
}
