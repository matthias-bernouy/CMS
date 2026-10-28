import { expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { LocalArtifactFiles, LocalContractReleases } from "@bernouy/cms-repository/repository/filesystem";
import { pushFixture } from "./fixtures";

test("push infers a contract kind and uses the saved login connection", async () => {
    const f = await pushFixture();
    try {
        const directory = await f.contract("push.example");
        await f.run(["release", directory]);
        await f.run(["push", "ulvia.official/push.example@1.0.0"]);
        expect(await f.remoteFiles.list("contracts")).toHaveLength(1);
        expect(f.output.at(-1)).toStartWith("+ contract ulvia.official/push.example@1.0.0");
        await f.run(["push", "ulvia.official/push.example@1.0.0"]);
        expect(f.output.at(-1)).toStartWith("= contract");
        await expect(f.run(["push", "ulvia.official/missing@1.0.0"])).rejects.toThrow("Local release not found");
    } finally {
        await f.close();
    }
});

test("a legal contract/provider coordinate collision requires an explicit kind", async () => {
    const f = await pushFixture();
    try {
        const id = "same.release";
        const directory = await f.contract(id);
        await f.run(["release", directory]);
        const contract = await new LocalContractReleases(
            new LocalArtifactFiles(join(f.data, "repository")),
        ).getMetadata("ulvia.official", id, "1.0.0");
        const provider = join(f.root, "providers", id);
        await mkdir(provider, { recursive: true });
        await writeFile(
            join(provider, "definition.json"),
            JSON.stringify({
                requires: [],
                kind: "provider-manifest",
                protocol: "ulvia-provider/v1",
                schemaDialect: "ulvia-schema/v1",
                providerId: id,
                name: "Collision provider",
                version: "1.0.0",
                provenance: { publisherId: "ulvia.official", publishedAt: "2026-10-25T00:00:00Z" },
                buildVersionRange: ">=1.0.0 <2.0.0",
                endpoint: { allowedOrigins: ["https://provider.example.com"] },
                configuration: { type: "object", properties: {}, required: [] },
                credentialSlots: [],
                implementations: [{ contractId: id, version: "1.0.0", digest: contract!.digest, requires: [] }],
            }),
        );
        await f.run(["release", provider]);
        await expect(f.run(["push", `ulvia.official/${id}@1.0.0`])).rejects.toThrow("Ambiguous local release");
        expect(await f.remoteFiles.list("contracts")).toEqual([]);
        await f.run(["push", "contract", `ulvia.official/${id}@1.0.0`]);
        await f.run(["push", "provider", `ulvia.official/${id}@1.0.0`]);
        expect(await f.remoteFiles.list("providers")).toHaveLength(1);
    } finally {
        await f.close();
    }
});

test("push diagnostics explain login selection and reject malformed flags without uploading", async () => {
    const f = await pushFixture();
    try {
        await f.run(["repository", "logout"]);
        await expect(f.run(["push", "ulvia.official/example@1.0.0"])).rejects.toThrow("repository login");
        await expect(f.run(["push", "all", "--reason", "invalid"])).rejects.toThrow("Usage");
        await expect(
            f.run(["push", "all", "--repository", f.server.url.origin, "--repository", f.server.url.origin]),
        ).rejects.toThrow("Usage");
        await expect(f.run(["push", "all", "--unknown"])).rejects.toThrow("Usage");
    } finally {
        await f.close();
    }
});
