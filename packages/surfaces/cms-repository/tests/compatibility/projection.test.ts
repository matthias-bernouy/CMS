import { describe, expect, test } from "bun:test";
import type { RepositoryCompatibilityReader } from "@bernouy/cms-repository";
import { admission, mounted, mutableCompatibilityReader, revision } from "./fixtures";

const PATH = "/api/integrations/compatibility?kind=demo&version=1.0.0";

describe("public integration compatibility projection", () => {
    test("returns only allowlisted admission, current and revision fields", async () => {
        const history = mutableCompatibilityReader([revision()]);
        const response = await mounted(history.reader).handle(PATH);
        const body = await response.json();
        const serialized = JSON.stringify(body);

        expect(body.admission).toMatchObject({
            id: "admission-1",
            reportType: "admission",
            packageDigest: "a".repeat(64),
            outcome: "compatible",
        });
        expect(body.current).toMatchObject({ id: "revision-1", reportType: "revision" });
        expect(body.revisions).toHaveLength(1);
        expect(body.revisions[0].provenance).toEqual({
            reason: "Comparator update",
            evidenceIds: ["ci-evidence-1"],
        });
        expect(body.admission.evidence[0]).toEqual({
            classification: "compatible",
            surface: "definition",
            code: "contract-preserved",
            message: "The public contract is preserved.",
        });
        expect(serialized).not.toContain("private-admin");
        expect(serialized).not.toContain("/registry/private");
        expect(serialized).not.toContain("internal-evidence-source");
        expect(serialized).not.toContain("internal-management-request");
        expect(serialized).not.toContain("top-level-internal-source");
    });

    test("keeps redacted upstream changes out of the representation ETag", async () => {
        let actor = "private-admin-1";
        const reader: RepositoryCompatibilityReader = {
            list: async () => {
                const current = {
                    ...revision(),
                    provenance: { ...revision().provenance!, actor },
                    evidence: [{ ...revision().evidence[0]!, path: `/private/${actor}` }],
                };
                return { admission: admission(), current, revisions: [current], totalRevisions: 1 };
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

        expect(body.revisions.map(({ id }: { id: string }) => id)).toEqual(["revision-1"]);
        expect(body.current.id).toBe("revision-2");
        expect(body.totalRevisions).toBe(2);
        expect(body.nextCursor).toBe("revision-1");
        expect(history.requests).toEqual([{ limit: 1 }]);
    });
});
