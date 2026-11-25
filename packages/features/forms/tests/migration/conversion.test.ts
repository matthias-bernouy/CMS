import { expect, test } from "bun:test";
import { convertForm, convertVersion, convertSubmission } from "forms/migration/convert";
import { formsMigrationVersion, formsMigrationContracts } from "@bernouy/forms/migration/mongo";
import { answers } from "../fixtures";
import { legacyFixture, settings } from "./fixtures";
test("Forms migration preserves identifiers, versions, answers and proof while exporting notification settings", () => {
    for (const version of ["1.0.0", "1.1.0"] as const) {
        const f = legacyFixture(version);
        const form = convertForm(f.form),
            publication = convertVersion(f.publication),
            submission = convertSubmission(f.submission, version);
        expect(form.settings.settings).toEqual(settings);
        expect(publication.settings.publication).toBe(1);
        expect(form.document.record.id).toBe(f.formId);
        expect(form.document.record.revision).toBe(3);
        expect(form.document.record.currentVersion).toBe(1);
        expect(form.document.record.draft).not.toHaveProperty("notification");
        expect(publication.document.committed).toBe(true);
        expect(submission.record.answers).toEqual(answers);
        expect(submission.record.receiptId).toBe(f.receiptId);
        expect(submission.record.receivedAt).toBe(f.submission.record.receivedAt);
        expect(submission.nonce).toBe(f.submission.nonce);
        expect(submission.record).not.toHaveProperty("notification");
        expect(submission.record).not.toHaveProperty("intents");
        if (version === "1.0.0") {
            expect(submission.record.event).toBeNull();
            expect(submission.dueAt).toEqual(new Date(f.submission.record.expiresAt));
        } else {
            expect(submission.record.event).toEqual(f.submission.record.event);
        }
    }
});
test("unresolved email and malformed legacy records refuse without mutating their input", () => {
    for (const state of ["pending", "sending", "unknown", "blocked", "failed"]) {
        const f = legacyFixture();
        const row = structuredClone(f.submission);
        Object.assign(row.record.intents[0]!, {
            state,
            ...(state === "sending" ? { lease: crypto.randomUUID(), deadline: new Date().toISOString() } : {}),
        });
        const before = structuredClone(row);
        expect(() => convertSubmission(row, "1.1.0")).toThrow("FORMS_EMAIL_UNRESOLVED");
        expect(row).toEqual(before);
    }
    const f = legacyFixture();
    expect(() =>
        convertSubmission({ ...f.submission, record: { ...f.submission.record, deliveryMayComplete: true } }, "1.1.0"),
    ).toThrow("FORMS_EMAIL_UNRESOLVED");
    expect(() => convertForm({ ...f.form, unknown: "secret" })).toThrow();
    expect(() =>
        convertSubmission({ ...f.submission, record: { ...f.submission.record, extra: "secret" } }, "1.1.0"),
    ).toThrow();
});
test("only archived exact source releases are recognized; this does not add a Forms 1.x executor", async () => {
    for (const contract of await formsMigrationContracts()) {
        expect(
            await formsMigrationVersion(
                contract.release.version === "1.0.0"
                    ? { version: "1.0.0", digest: contract.digest }
                    : { version: "1.1.0", digest: contract.digest },
            ),
        ).toBe(contract.release.version);
    }
    await expect(formsMigrationVersion({ version: "1.0.0", digest: `sha256:${"0".repeat(64)}` })).rejects.toThrow(
        "Unsupported",
    );
});
