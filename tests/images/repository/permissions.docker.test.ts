import { expect, test } from "bun:test";
import { docker } from "../../integration/instance/docker";

const image = process.env.ULVIA_MCP_PROVIDER_DOCKER_IMAGE;

test.skipIf(!image)(
    "bundled profiles and public artifacts are readable by an arbitrary runtime UID without network or writes",
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
                const base = "/app/packages/runtimes/ulvia-provider-server/src/runtime/instances/profiles/";
                const { bundledBootstrapSources } = await import(base + "bootstrap.ts");
                const { loadOfficialArtifacts } = await import(base + "artifacts.ts");
                const sources = bundledBootstrapSources();
                const artifacts = await loadOfficialArtifacts(sources.providers, sources.collections);
                console.log(JSON.stringify(artifacts.profiles.map(({ id, version }) => ({ id, version }))));
            `,
        ]);
        expect(JSON.parse(result.stdout)).toEqual([
            { id: "ulvia.official", version: "1.0.0" },
            { id: "ulvia.repository", version: "1.0.0" },
        ]);
    },
    30_000,
);
