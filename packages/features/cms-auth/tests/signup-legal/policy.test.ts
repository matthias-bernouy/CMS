import { describe, expect, test } from "bun:test";
import { AuthValidationError } from "@bernouy/cms-auth";
import { canonicalPage, createLegalPolicy, LEGAL_PAGE } from "./fixtures";

describe("page-backed signup legal acceptance policy", () => {
    test("treats an empty enabled-document set as feature off without creating a proof", async () => {
        const { policy, state, store } = createLegalPolicy();
        state.definitions[0]!.enabled = false;

        expect(await policy.requirements()).toEqual({ documents: [] });
        const prepared = await policy.prepare([]);
        await policy.record(prepared, "local:user-1");
        expect(await store.listForUser("local:user-1")).toEqual([]);
    });

    test("materializes published pages and records an immutable server snapshot", async () => {
        const { policy, state, store } = createLegalPolicy();
        const requirements = await policy.requirements();
        const requirement = requirements.documents[0]!;

        expect(requirement).toMatchObject({
            documentKey: "terms-of-use",
            label: "Terms of use",
            page: { id: "page-cgu", path: "/terms", title: "Terms of use" },
        });
        expect(requirement.versionId).toMatch(/^[a-f0-9]{64}$/);
        expect(requirement.contentHash).toMatch(/^[a-f0-9]{64}$/);

        const prepared = await policy.prepare([requirement.versionId]);
        await policy.record(prepared, "local:user-1");
        state.page!.content = "<main>Changed after acceptance</main>";

        const [proof] = await store.listForUser("local:user-1");
        expect(proof).toMatchObject({
            id: expect.stringMatching(/^signup-legal-v1:[a-f0-9]{64}$/),
            cmsUserId: "local:user-1",
            acceptedAt: new Date("2026-07-25T10:00:00.000Z"),
            documents: [
                {
                    pageSnapshot: LEGAL_PAGE,
                    pageSnapshotCanonical: canonicalPage(LEGAL_PAGE),
                    contentHash: requirement.contentHash,
                    versionId: requirement.versionId,
                },
            ],
        });
    });

    test("keeps exact retries idempotent and permits later document-version events", async () => {
        const { policy, state, store } = createLegalPolicy();
        const firstVersion = (await policy.requirements()).documents[0]!.versionId;
        const first = await policy.prepare([firstVersion]);

        await policy.record(first, "local:user-1");
        state.now = new Date("2026-07-26T10:00:00.000Z");
        await policy.record(first, "local:user-1");

        const afterRetry = await store.listForUser("local:user-1");
        expect(afterRetry).toHaveLength(1);
        expect(afterRetry[0]!.acceptedAt).toEqual(new Date("2026-07-25T10:00:00.000Z"));

        state.page!.content = "<main>Version two</main>";
        const secondVersion = (await policy.requirements()).documents[0]!.versionId;
        await policy.record(await policy.prepare([secondVersion]), "local:user-1");

        const events = await store.listForUser("local:user-1");
        expect(events).toHaveLength(2);
        expect(events[1]!.id).not.toBe(events[0]!.id);
        expect(events[1]!.acceptedAt).toEqual(state.now);
    });

    test("rejects contradictory evidence under the same deterministic id", async () => {
        const { policy, store } = createLegalPolicy();
        const version = (await policy.requirements()).documents[0]!.versionId;
        await policy.record(await policy.prepare([version]), "local:user-1");
        const [proof] = await store.listForUser("local:user-1");

        await expect(
            store.append({
                ...proof!,
                documents: [{ ...proof!.documents[0]!, label: "Contradictory label" }],
            }),
        ).rejects.toThrow("conflicts with different immutable evidence");
    });

    test("rejects missing, duplicate, extra and stale accepted versions", async () => {
        const { policy, state } = createLegalPolicy();
        const current = (await policy.requirements()).documents[0]!.versionId;

        await expect(policy.prepare([])).rejects.toBeInstanceOf(AuthValidationError);
        await expect(policy.prepare([current, current])).rejects.toBeInstanceOf(AuthValidationError);
        await expect(policy.prepare([current, "extra"])).rejects.toBeInstanceOf(AuthValidationError);

        state.page!.content = "<main>Version two</main>";
        await expect(policy.prepare([current])).rejects.toThrow("all current signup legal documents");
        expect((await policy.requirements()).documents[0]!.versionId).not.toBe(current);
    });

    test("fails closed for missing publications and inconsistent canonical data", async () => {
        const { policy, state } = createLegalPolicy();
        state.page = null;
        await expect(policy.requirements()).rejects.toThrow("does not reference a published CMS page");

        const fixture = createLegalPolicy();
        fixture.state.page!.title = "Changed object only";
        fixture.state.canonicalSnapshot = canonicalPage(LEGAL_PAGE);
        await expect(fixture.policy.requirements()).rejects.toThrow("does not match its canonical serialization");
    });
});
