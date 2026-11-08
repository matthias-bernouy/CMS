import { expect, test } from "bun:test";
import {
    ContentValidationError,
    InMemoryContentRepository,
    ValidatingContentRepository,
    validateBlocWrite,
} from "@bernouy/content";
import type { TBlocWrite } from "@bernouy/content";
import { createMongoContentRepository } from "../../application/mongo/contentMongoFixture";

const requirement = { contractId: "ulvia/cms.files", capabilityId: "files.list", versionRange: "^1.0.0" };
const artifact: TBlocWrite = {
    id: "resource-panel",
    kind: "component",
    name: "Panel",
    group: "Base",
    description: "A panel",
    viewJS: "",
    markupHTML: "<slot></slot>",
    root: { accepts: ["div"] },
    requires: [requirement],
};

test("ordinary memory and Mongo Bloc records retain declared capability dependencies", async () => {
    for (const repository of [new InMemoryContentRepository(), createMongoContentRepository().repository]) {
        const validated = validateBlocWrite(artifact);
        await repository.createBloc(validated);
        expect((await repository.getBlocRecord(artifact.id))?.artifact?.requires).toEqual([requirement]);
        for (const projection of ["catalogue", "rendering"] as const) {
            const listed = await repository.getBlocsList({ projection });
            expect(listed[0]?.requires).toEqual([requirement]);
            const returned = listed[0]!.requires![0]!;
            Object.assign(returned, { capabilityId: "changed" });
            expect((await repository.getBlocRecord(artifact.id))?.artifact?.requires).toEqual([requirement]);
        }
    }
});

test("invalid or duplicate dependency metadata refuses Content writes without changing state", async () => {
    for (const repository of [new InMemoryContentRepository(), createMongoContentRepository().repository]) {
        const validated = new ValidatingContentRepository(repository);
        for (const requires of [
            [requirement, requirement],
            [{ ...requirement, contractId: "foreign" }],
            [{ ...requirement, capabilityId: "bad id" }],
            [{ ...requirement, versionRange: "latest" }],
            [{ ...requirement, undeclared: true }],
            Array.from({ length: 129 }, () => requirement),
        ]) {
            await expect(validated.createBloc({ ...artifact, requires })).rejects.toBeInstanceOf(
                ContentValidationError,
            );
            expect(await repository.getBlocRecords()).toEqual([]);
        }
    }
});
