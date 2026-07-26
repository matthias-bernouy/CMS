import { describe, expect, test } from "bun:test";
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
});
