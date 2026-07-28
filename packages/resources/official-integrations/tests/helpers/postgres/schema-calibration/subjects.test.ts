import { describe, expect, test } from "bun:test";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { loadOfficialSchemaCalibrationSubjects, OFFICIAL_SQL_INTEGRATION_KINDS } from "./subjects";

describe("official schema calibration subjects", () => {
    test("closes the exact nine-package SQL inventory with immutable dependencies", async () => {
        const subjects = await loadOfficialSchemaCalibrationSubjects(OFFICIAL_INTEGRATIONS_ROOT);

        expect(subjects.map((subject) => subject.kind)).toEqual(OFFICIAL_SQL_INTEGRATION_KINDS);
        expect(subjects.every((subject) => /^[a-f0-9]{64}$/.test(subject.digest))).toBeTrue();
        expect(subjects.find((subject) => subject.kind === "commerce-negotiation")?.sqlInstallationOrder).toEqual([
            expect.objectContaining({ kind: "commerce", version: "1.0.0" }),
        ]);
        expect(subjects.find((subject) => subject.kind === "emailer")?.sqlInstallationOrder).toEqual([
            expect.objectContaining({ kind: "newsletter", version: "1.0.0" }),
        ]);
        expect(subjects.find((subject) => subject.kind === "commerce")?.dependencies).toEqual([
            expect.objectContaining({ kind: "basic-blocs", version: "1.0.0" }),
        ]);
        expect(subjects.find((subject) => subject.kind === "commerce")?.sqlInstallationOrder).toEqual([]);
        expect(subjects.find((subject) => subject.kind === "photo-albums")?.version).toBe("1.0.0");
    });

    test("keeps newer SQL packages outside the closed legacy calibration inventory", async () => {
        const repository = new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT);
        const consent = await repository.get("consent", "1.0.0");
        const subjects = await loadOfficialSchemaCalibrationSubjects(OFFICIAL_INTEGRATIONS_ROOT);

        expect(
            consent?.connectors?.some(
                (connector) => connector.provider === "supabase" && (connector.schemas?.length ?? 0) > 0,
            ),
        ).toBeTrue();
        expect(subjects.map(({ kind }) => kind)).not.toContain("consent");
        expect(subjects).toHaveLength(OFFICIAL_SQL_INTEGRATION_KINDS.length);
    });
});
