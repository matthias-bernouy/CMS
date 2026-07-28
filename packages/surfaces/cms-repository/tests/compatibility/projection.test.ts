import { describe, expect, test } from "bun:test";
import { identifyCompatibilityReportV2 } from "@bernouy/cms-integration-verification";
import type { RepositoryCompatibilityReader } from "@bernouy/cms-repository";
import { admission, mounted, mutableCompatibilityReader, revision } from "./fixtures";

const PATH = "/api/integrations/compatibility?kind=demo&version=1.0.0";

describe("public integration compatibility projection", () => {
    test("returns only allowlisted admission, current and revision fields", async () => {
        const history = mutableCompatibilityReader([revision()]);
        const response = await mounted(history.reader).handle(PATH);
        const body = await response.json();
        const serialized = JSON.stringify(body);

        expect(body.root).toMatchObject({
            reportId: "admission-1",
            revisionType: "root",
            packageDigest: "a".repeat(64),
            outcome: "not-applicable",
        });
        expect(body.current).toMatchObject({ reportId: "revision-1", revisionType: "revision" });
        expect(body.revisions).toHaveLength(1);
        expect(body.revisions[0].provenance).toEqual({
            reason: "Comparator update",
            evidenceIds: ["ci-evidence-1"],
        });
        expect(body.root.findings[0]).toEqual({
            findingId: "b51ab3cc141991012ec0abc4c32a0232cc87f1aa30a3235a01be2bdc8e2600a3",
            classification: "compatible",
            surface: "definition",
            code: "contract-preserved",
            message: "The public contract is preserved.",
        });
        expect(serialized).not.toContain("private-admin");
        expect(serialized).not.toContain("/registry/private");
        expect(serialized).not.toContain('"path"');
        expect(serialized).not.toContain('"actor"');
    });

    test("keeps redacted upstream changes out of the representation ETag", async () => {
        let actor = "private-admin-1";
        const reader: RepositoryCompatibilityReader = {
            list: async () => {
                const current = {
                    ...revision(),
                    provenance: { ...revision().provenance!, actor },
                };
                return {
                    root: admission(),
                    current,
                    currentRevisionId: current.reportId,
                    currentReportDigest: (await identifyCompatibilityReportV2(current)).digest,
                    revisions: [current],
                    totalRevisions: 1,
                };
            },
        };
        const runner = mounted(reader);
        const before = await runner.handle(PATH);
        actor = "private-admin-2";
        const after = await runner.handle(PATH);

        expect(before.headers.get("etag")).toBe(after.headers.get("etag"));
    });

    test("pages revisions with a bounded cursor contract", async () => {
        const history = mutableCompatibilityReader([revision("revision-1"), revision("revision-2", "revision-1")]);
        const response = await mounted(history.reader).handle(`${PATH}&limit=1`);
        const body = await response.json();

        expect(body.revisions.map(({ reportId }: { reportId: string }) => reportId)).toEqual(["revision-1"]);
        expect(body.current.reportId).toBe("revision-2");
        expect(body.totalRevisions).toBe(2);
        expect(body.nextCursor).toBe("revision-1");
        expect(history.requests).toEqual([{ limit: 1 }]);
    });
});
