import { describe, expect, test } from "bun:test";
import { BlocOwnershipConflictError, InMemoryCmsRepository, type BlocRecord, type TBloc } from "@bernouy/cms-content";
import { siteBlocArtifact } from "./siteBlocFixture";

class LegacyMemoryRepository extends InMemoryCmsRepository {
    seedLegacy(tag: string): void {
        const artifact: TBloc = {
            ...siteBlocArtifact(),
            id: tag,
            ownership: { kind: "code-managed" },
        };
        const record: BlocRecord = {
            tag,
            ownership: { kind: "code-managed" },
            legacyOwnershipClaim: "unclaimed",
            artifact,
        };
        this.blocs.set(tag, record);
    }
}

const integrationOwner = (installationId: string) => ({
    kind: "integration" as const,
    integrationKind: "catalogue",
    installationId,
    definitionVersion: "1.0.0",
});

describe("in-memory legacy ownership claims", () => {
    test("lets one integration claim a marked legacy record exactly once", async () => {
        const repository = new LegacyMemoryRepository();
        repository.seedLegacy("legacy-card");

        await repository.replaceBloc({
            ...siteBlocArtifact(),
            id: "legacy-card",
            ownership: integrationOwner("installation-1"),
        });

        expect(await repository.getBlocRecord("legacy-card")).toMatchObject({
            ownership: integrationOwner("installation-1"),
            artifact: { ownership: integrationOwner("installation-1") },
        });
        expect((await repository.getBlocRecord("legacy-card"))?.legacyOwnershipClaim).toBeUndefined();
        await expect(
            repository.replaceBloc({
                ...siteBlocArtifact(),
                id: "legacy-card",
                ownership: integrationOwner("installation-2"),
            }),
        ).rejects.toBeInstanceOf(BlocOwnershipConflictError);
    });

    test("a code write consumes the marker and a site builder can never claim it", async () => {
        const repository = new LegacyMemoryRepository();
        repository.seedLegacy("legacy-code");
        repository.seedLegacy("legacy-site");

        await repository.replaceBloc({ ...siteBlocArtifact(), id: "legacy-code", ownership: { kind: "code-managed" } });
        expect((await repository.getBlocRecord("legacy-code"))?.legacyOwnershipClaim).toBeUndefined();
        await expect(
            repository.replaceBloc({
                ...siteBlocArtifact(),
                id: "legacy-code",
                ownership: integrationOwner("installation-1"),
            }),
        ).rejects.toBeInstanceOf(BlocOwnershipConflictError);
        await expect(
            repository.replaceBloc({
                ...siteBlocArtifact(),
                id: "legacy-site",
                ownership: { kind: "site-builder", definitionId: "definition-1" },
            }),
        ).rejects.toBeInstanceOf(BlocOwnershipConflictError);
        expect((await repository.getBlocRecord("legacy-site"))?.legacyOwnershipClaim).toBe("unclaimed");
    });

    test("never marks a modern ownerless write as claimable", async () => {
        const repository = new LegacyMemoryRepository();
        await repository.createBloc({ ...siteBlocArtifact(), id: "modern-code", ownership: undefined });

        expect(await repository.getBlocRecord("modern-code")).toMatchObject({
            ownership: { kind: "code-managed" },
        });
        expect((await repository.getBlocRecord("modern-code"))?.legacyOwnershipClaim).toBeUndefined();
        await expect(
            repository.replaceBloc({
                ...siteBlocArtifact(),
                id: "modern-code",
                ownership: integrationOwner("installation-1"),
            }),
        ).rejects.toBeInstanceOf(BlocOwnershipConflictError);
    });
});
