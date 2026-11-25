import { draft, answers } from "../fixtures";
export const settings = {
    enabled: true,
    recipients: [{ email: "team@example.test" }],
    subjectTemplate: "Contact {{form.title}}",
    textTemplate: "{{answers.text}}",
    includeAnswers: true,
};
export function legacyFixture(version: "1.0.0" | "1.1.0" = "1.1.0") {
    const formId = crypto.randomUUID(),
        receiptId = crypto.randomUUID(),
        now = Date.now(),
        receivedAt = new Date(now).toISOString(),
        expiresAt = new Date(now + 86400000).toISOString();
    const form = {
        _id: formId,
        record: {
            id: formId,
            revision: 3,
            availability: "open",
            draft: { ...draft, notification: settings },
            currentVersion: 1,
        },
        createDigest: "a".repeat(64),
        changeDigest: null,
        nonce: crypto.randomUUID(),
    };
    const publication = {
        _id: `${formId}:1`,
        record: { formId, version: 1, draft: { ...draft, notification: settings } },
        committed: true,
    };
    const record = {
        receiptId,
        formId,
        formVersion: 1,
        principal: "b".repeat(64),
        digest: "c".repeat(64),
        receivedAt,
        expiresAt,
        replayExpiresAt: expiresAt,
        status: "new",
        revision: 1,
        answers,
        notification: { subject: "Contact", text: "Private answers" },
        intents: [{ email: "team@example.test", state: "accepted", generation: 1, lease: null, deadline: null }],
        deleted: false,
        deliveryMayComplete: false,
        lastAdmin: null,
        ...(version === "1.1.0"
            ? {
                  event: {
                      initiatorProof: null,
                      installationId: "native",
                      definitionId: "d".repeat(64),
                      causation: ["e".repeat(64)],
                      state: "pending",
                      attempts: 0,
                      token: null,
                      dueAt: receivedAt,
                  },
              }
            : {}),
    };
    const submission = {
        _id: receiptId,
        record,
        nonce: crypto.randomUUID(),
        purgeAt: new Date(expiresAt),
        dueAt: new Date(receivedAt),
    };
    return { form, publication, submission, settings, formId, receiptId };
}
