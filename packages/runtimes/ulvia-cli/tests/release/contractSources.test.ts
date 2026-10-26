import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { LocalArtifactFiles, LocalContractReleases } from "@bernouy/cms-repository/repository/filesystem";
import { runCli } from "../../src/cli";
import { compileContractSource } from "../../src/release/authored/contract";

test("recursive contract sources are path-independent and attach separate mocks", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-contract-sources-"));
    try {
        const left = join(root, "left");
        const right = join(root, "right");
        await createContract(left, ["group-a/alpha.json", "group-b/zeta.json"]);
        await createContract(right, ["deep/nested/zeta.json", "another/deep/alpha.json"]);
        const leftAdmission = await admitContractReleaseJson(await compileContractSource(left));
        const rightAdmission = await admitContractReleaseJson(await compileContractSource(right));

        expect(rightAdmission.digest).toBe(leftAdmission.digest);
        expect(leftAdmission.release.capabilities.map(({ id }) => id)).toEqual(["alpha", "zeta"]);
        expect(leftAdmission.release.capabilities[0]!.mocks?.map(({ id }) => id)).toEqual(["success"]);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("recursive contract sources reject duplicate IDs and unknown mock owners", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-contract-invalid-"));
    try {
        await createContract(root, ["one/alpha.json", "two/zeta.json"]);
        await writeJson(join(root, "capabilities", "two", "duplicate.json"), capability("alpha"));
        await expect(compileContractSource(root)).rejects.toThrow('Capability "alpha" is declared by both');

        await rm(join(root, "capabilities", "two", "duplicate.json"));
        await writeJson(join(root, "mocks", "missing", "success.json"), {
            capabilityId: "missing",
            ...mock("success"),
        });
        await expect(compileContractSource(root)).rejects.toThrow('references unknown capability "missing"');
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("authored contracts reject retired monolithic source shapes", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-contract-monolith-"));
    try {
        await writeJson(join(root, "definition.json"), {
            kind: "contract",
            capabilities: [capability("alpha")],
        });
        await expect(compileContractSource(root)).rejects.toThrow("capabilities/ source tree");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("release publishes a contract and its mocks from the minimal authored source tree", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-contract-release-"));
    try {
        const source = join(root, "example.contract");
        const data = join(root, "data");
        await createContract(source, ["queries/alpha.json", "queries/zeta.json"]);
        const expected = await admitContractReleaseJson(await compileContractSource(source));
        await runCli(["release", source], {
            environment: { ULVIA_DATA_DIR: data },
            log: () => undefined,
        });
        const releases = new LocalContractReleases(new LocalArtifactFiles(join(data, "repository")));
        const published = await releases.getMetadata("example.publisher", "example.contract", "1.0.0");
        expect(published?.digest).toBe(expected.digest);
        expect(published?.release.capabilities[0]?.mocks).toEqual(expected.release.capabilities[0]?.mocks);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

async function createContract(root: string, paths: readonly string[]): Promise<void> {
    await writeJson(join(root, "definition.json"), {
        kind: "contract",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        contractId: "example.contract",
        name: "Example contract",
        version: "1.0.0",
        publisherId: "example.publisher",
    });
    for (const path of paths) {
        const id = path.endsWith("alpha.json") ? "alpha" : "zeta";
        await writeJson(join(root, "capabilities", path), capability(id));
    }
    await writeJson(join(root, "mocks", "alpha", "success.json"), {
        capabilityId: "alpha",
        ...mock("success"),
    });
}

function capability(id: string) {
    return {
        id,
        access: "public",
        behavior: { effect: "query", execution: "sync" },
        input: { type: "object", properties: {}, required: [] },
        output: {
            type: "object",
            properties: { value: { type: "string", maxLength: 16 } },
            required: ["value"],
        },
        errors: [],
        bindings: [
            {
                id: "http",
                transport: "http",
                method: "GET",
                path: `/v1/${id}`,
                input: {},
                response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
            },
        ],
    };
}

function mock(id: string) {
    return { id, input: {}, outcome: { kind: "success", output: { value: "ok" } } };
}

async function writeJson(path: string, value: unknown): Promise<void> {
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, null, 4)}\n`);
}
