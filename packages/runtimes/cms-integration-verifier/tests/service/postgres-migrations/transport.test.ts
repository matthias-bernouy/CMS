import { expect, test } from "bun:test";
import {
    runPostgresPlatformVerification,
    type PostgresPlatformVerificationAdapter,
    type VerificationSandboxInput,
} from "../../../src";
import { createPostgresMigrationVerifier } from "../../../src/sandbox/service/postgres/migrations";
import { createMigrationPackageLoader } from "../../../src/sandbox/service/postgres/migrations/packages";
import {
    createPostgresPlatformVerificationAdapter as createFixtureAdapter,
    postgresPlatformInputFixture,
} from "../../fixtures/postgresAdapter";
import { migrationExecutionFixture } from "./fixture/input";
import { migrationPackageFixture, unrelatedPackage } from "./fixture/packages";

const unreachableDatabase = {
    databaseId: `cmscore_contracts_${"0".repeat(24)}`,
    connectionUri: "postgresql://invalid:invalid@127.0.0.1:1/unreachable?sslmode=disable",
};

test("rejects missing and extra migration packages before opening PostgreSQL", async () => {
    const fixture = await migrationExecutionFixture(unreachableDatabase);
    const verifier = createPostgresMigrationVerifier({});
    try {
        await expect(verifier.verify({ ...fixture.input, migrationPackages: [] }, signal())).rejects.toThrow(
            /exact required source and dependency set/,
        );
        const extra = await unrelatedPackage();
        await expect(
            verifier.verify(
                {
                    ...fixture.input,
                    migrationPackages: [...fixture.input.migrationPackages, extra].toSorted((left, right) =>
                        left.digest.localeCompare(right.digest),
                    ),
                },
                signal(),
            ),
        ).rejects.toThrow(/exact required source and dependency set/);
    } finally {
        await verifier.dispose();
    }
});

test("rejects substituted source and target bytes before opening PostgreSQL", async () => {
    const fixture = await migrationExecutionFixture(unreachableDatabase);
    const verifier = createPostgresMigrationVerifier({});
    try {
        const source = fixture.input.migrationPackages[0]!;
        const substitutedSource = {
            ...source,
            envelope: withSubstitutedReleaseNotes(source.envelope),
        };
        await expect(
            verifier.verify({ ...fixture.input, migrationPackages: [substitutedSource] }, signal()),
        ).rejects.toThrow(/exact required source and dependency set/);

        await expect(
            verifier.verify(
                { ...fixture.input, targetPackage: withSubstitutedReleaseNotes(fixture.input.targetPackage) },
                signal(),
            ),
        ).rejects.toThrow(/targets substituted candidate package bytes/);
    } finally {
        await verifier.dispose();
    }
});

test("forwards the exact transported migration packages through the PostgreSQL adapter boundary", async () => {
    const base = await postgresPlatformInputFixture();
    const source = (await migrationPackageFixture()).source;
    const migrationInput = {} as VerificationSandboxInput["workload"]["migrationInputs"][number];
    const input: VerificationSandboxInput = {
        ...base,
        workload: {
            ...base.workload,
            migrationInputs: [migrationInput],
            migrationPackages: [source],
        },
    };
    const platform = createFixtureAdapter();
    let received: Parameters<NonNullable<PostgresPlatformVerificationAdapter["verifyMigrations"]>>[0] | undefined;
    const adapter: PostgresPlatformVerificationAdapter = {
        ...platform,
        async verifyMigrations(request) {
            received = request;
            return [];
        },
    };

    await runPostgresPlatformVerification(input, adapter, signal());

    expect(received?.migrationPackages).toEqual([source]);
    expect(received?.migrationInputs).toEqual([migrationInput]);
    expect(received?.package).toBe(input.workload.package);
});

test("does not turn the bounded materialization cache into a migration dependency limit", async () => {
    const packages = await Promise.all(Array.from({ length: 17 }, async (_, index) => await unrelatedPackage(index)));
    const loader = createMigrationPackageLoader({ maxCachedPackages: 2 });
    try {
        const loaded: string[] = [];
        for (const entry of packages) {
            await loader.useTransient(entry, async (value) => {
                loaded.push(value.digest);
            });
        }
        expect(loaded).toEqual(packages.map((entry) => entry.digest));
    } finally {
        await loader.dispose();
    }
});

function withSubstitutedReleaseNotes<T extends { releaseNotes: string; files: Record<string, unknown> }>(
    envelope: T,
): T {
    return {
        ...envelope,
        files: {
            ...envelope.files,
            [envelope.releaseNotes]: { encoding: "utf8", content: "Substituted release notes" },
        },
    };
}

function signal(): AbortSignal {
    return new AbortController().signal;
}
