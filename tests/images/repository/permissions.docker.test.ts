import { expect, test } from "bun:test";
import { docker } from "../../integration/instance/docker";

const image = process.env.ULVIA_MCP_PROVIDER_DOCKER_IMAGE;

test.skipIf(!image)(
    "system bootstrap and public artifacts are readable by an arbitrary runtime UID without network or writes",
    async () => {
        const result = await docker([
            "run",
            "--rm",
            "--network",
            "none",
            "--read-only",
            "--user",
            "12001:12002",
            "--tmpfs",
            "/tmp:rw,nosuid,nodev,noexec,size=64m",
            "--entrypoint",
            "bun",
            image!,
            "--no-macros",
            "-e",
            `
                const base = "/app/packages/runtimes/ulvia-provider-server/src/runtime/instances/system/";
                const { bundledBootstrapSources } = await import(base + "bootstrap.ts");
                const { loadSystemArtifacts } = await import(base + "artifacts.ts");
                const sources = bundledBootstrapSources();
                const artifacts = await loadSystemArtifacts(sources.providers);
                console.log(JSON.stringify(artifacts.plan.manifest));
            `,
        ]);
        expect(JSON.parse(result.stdout)).toMatchObject({ providerId: "ulvia/primary-provider", version: "1.3.0" });
    },
    30_000,
);
