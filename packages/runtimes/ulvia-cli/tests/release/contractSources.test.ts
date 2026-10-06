import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { admitConformanceSuiteJson, admitContractReleaseJson } from "@bernouy/cms-repository/contracts";
import { LocalArtifactFiles, LocalContractReleases } from "@bernouy/cms-repository/repository/filesystem";
import { runCli } from "../../src/cli";
import { compileConformanceSource } from "../../src/release/authored/conformance";
import { resolveConformanceDependencies } from "../../src/release/authored/conformanceDependencies";
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

        await createConformance(left, leftAdmission.digest);
        const conformance = await compileConformanceSource(left);
        expect(conformance).toBeString();
        const suite = await admitConformanceSuiteJson(conformance!, leftAdmission);
        expect(suite.suite.scenarios.map(({ id }) => id)).toEqual(["alpha-works"]);

        const dependencySource = dependencyProfile(leftAdmission.digest);
        expect(await resolveConformanceDependencies(dependencySource, async () => leftAdmission)).toEqual([
            leftAdmission,
        ]);
        await expect(
            resolveConformanceDependencies(dependencyProfile(`sha256:${"f".repeat(64)}`), async () => leftAdmission),
        ).rejects.toThrow("has another digest");
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

test("release rejects an invalid authored conformance suite before publishing its contract", async () => {
    const root = await mkdtemp(join(tmpdir(), "ulvia-contract-release-"));
    const source = join(root, "example.contract");
    const data = join(root, "data");
    try {
        await createContract(source, ["queries/alpha.json", "queries/zeta.json"]);
        await createConformance(source, `sha256:${"0".repeat(64)}`);
        await expect(
            runCli(["release", source], {
                environment: { ULVIA_DATA_DIR: data },
                log: () => undefined,
            }),
        ).rejects.toThrow("suite does not match its admitted contract release");
        const releases = new LocalContractReleases(new LocalArtifactFiles(join(data, "repository")));
        expect(await (await releases.catalogue()).list()).toEqual([]);
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

async function createConformance(root: string, contractDigest: string): Promise<void> {
    await writeJson(join(root, "conformance", "definition.json"), {
        kind: "contract-conformance-suite",
        protocol: "ulvia-conformance/v1",
        contractId: "example.contract",
        contractVersion: "1.0.0",
        contractDigest,
        publisherId: "example.publisher",
        version: "1.0.0",
        isolation: "disposable-tenant",
    });
    await writeJson(join(root, "conformance", "scenarios", "queries", "alpha-works.json"), {
        id: "alpha-works",
        calls: [
            {
                id: "read-alpha",
                capabilityId: "alpha",
                actor: { kind: "public" },
                input: {},
                expect: { kind: "success", checks: [{ path: "/value", equals: "ok" }] },
            },
        ],
    });
    await writeJson(join(root, "conformance", "exemptions", "zeta", "success.json"), {
        capabilityId: "zeta",
        reason: "Covered by the provider-specific stateful suite.",
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
        binding: {
            transport: "http",
            method: "GET",
            path: `/v1/${id}`,
            input: {},
            response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
        },
    };
}

function mock(id: string) {
    return { id, input: {}, outcome: { kind: "success", output: { value: "ok" } } };
}

function dependencyProfile(digest: string): string {
    return JSON.stringify({
        dependencyProfiles: [{ releases: [{ contractId: "example.contract", version: "1.0.0", digest }] }],
    });
}

async function writeJson(path: string, value: unknown): Promise<void> {
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, `${JSON.stringify(value, null, 4)}\n`);
}
