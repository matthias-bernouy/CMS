import { describe, expect, test } from "bun:test";
import {
    InMemoryIntegrationInstallationRepository,
    type IntegrationInstallation,
    type IntegrationInstallationCreate,
    type IntegrationInstallationRepository,
} from "@bernouy/cms-integrations";
import {
    createMongoInstallationRepository,
    type FakeInstallationCollection,
    type StoredInstallation,
} from "./packageProvenanceMongoFixture";

const FIRST_DIGEST = "a".repeat(64);
const SECOND_DIGEST = "b".repeat(64);

describe("integration installation package provenance", () => {
    test("the in-memory repository preserves provenance through create, get, list, and replace", async () => {
        const repository = new InMemoryIntegrationInstallationRepository();

        await expectRepositoryRoundTrip(repository);
    });

    test("the in-memory repository leaves legacy provenance absent", async () => {
        const repository = new InMemoryIntegrationInstallationRepository();
        const created = await repository.create(createInput("legacy"));

        assertPackageDigestAbsent(created);
        assertPackageDigestAbsent((await repository.get("legacy"))!);
        assertPackageDigestAbsent((await repository.list())[0]!);
    });

    test("the Mongo adapter preserves provenance through create, get, list, and replace", async () => {
        const { repository } = createMongoInstallationRepository();

        await expectRepositoryRoundTrip(repository);
    });

    test("the Mongo adapter reads legacy documents without fabricating provenance", async () => {
        const { collection, repository } = createMongoInstallationRepository();
        seedLegacyDocument(collection);

        assertPackageDigestAbsent((await repository.get("legacy"))!);
        assertPackageDigestAbsent((await repository.list())[0]!);
    });

    test("rejects package digests that are not tied to an exact SemVer version", async () => {
        for (const repository of [
            new InMemoryIntegrationInstallationRepository(),
            createMongoInstallationRepository().repository,
        ]) {
            await expect(
                repository.create({
                    ...createInput("invalid"),
                    definitionVersion: "unversioned",
                    packageDigest: FIRST_DIGEST,
                }),
            ).rejects.toThrow(/unversioned installation cannot carry a package digest/);
            await expect(
                repository.create({
                    ...createInput("channel"),
                    definitionVersion: "stable",
                }),
            ).rejects.toThrow(/definitionVersion must be exact SemVer/);
        }
    });

    test("rejects corrupt persisted provenance while reading", async () => {
        const { collection, repository } = createMongoInstallationRepository();
        seedLegacyDocument(collection, { definitionVersion: "unversioned", packageDigest: FIRST_DIGEST });

        await expect(repository.get("legacy")).rejects.toThrow(
            /unversioned installation cannot carry a package digest/,
        );
        await expect(repository.list()).rejects.toThrow(/unversioned installation cannot carry a package digest/);
    });
});

async function expectRepositoryRoundTrip(repository: IntegrationInstallationRepository): Promise<void> {
    const created = await repository.create({ ...createInput("pinned"), packageDigest: FIRST_DIGEST });
    expect(created.packageDigest).toBe(FIRST_DIGEST);
    expect((await repository.get("pinned"))?.packageDigest).toBe(FIRST_DIGEST);
    expect((await repository.list())[0]?.packageDigest).toBe(FIRST_DIGEST);

    const replaced = await repository.replace({ ...created, packageDigest: SECOND_DIGEST });
    expect(replaced.packageDigest).toBe(SECOND_DIGEST);
    expect((await repository.get("pinned"))?.packageDigest).toBe(SECOND_DIGEST);
    expect((await repository.list())[0]?.packageDigest).toBe(SECOND_DIGEST);
}

function createInput(id: string): IntegrationInstallationCreate {
    return {
        id,
        label: id,
        definitionVersion: "1.0.0",
        answersSnapshot: {},
        secretRefs: {},
        secretInputs: [],
    };
}

function seedLegacyDocument(collection: FakeInstallationCollection, overrides: Partial<StoredInstallation> = {}): void {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const document: StoredInstallation = {
        _id: "legacy",
        label: "legacy",
        definitionVersion: "1.0.0",
        status: "success",
        createdAt: now,
        updatedAt: now,
        runCount: 0,
        answersSnapshot: {},
        secretRefs: {},
        secretInputs: [],
        artifacts: [],
        runs: [],
    };
    collection.seed({ ...document, ...overrides });
}

function assertPackageDigestAbsent(installation: IntegrationInstallation): void {
    expect(installation.packageDigest).toBeUndefined();
    expect(Object.hasOwn(installation, "packageDigest")).toBeFalse();
}
