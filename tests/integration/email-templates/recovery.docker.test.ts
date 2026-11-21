import { expect, test } from "bun:test";
import { EmailTemplates } from "@bernouy/email-templates";
import { MongoTemplateStore } from "@bernouy/email-templates/mongo";
import { contentMongo } from "../content/mongo";
import { interruptedDatabase } from "./faults";
import type { PublicationFault } from "./faults";

const enabled = process.env.ULVIA_RUN_EMAIL_TEMPLATES_MONGO === "1";
test.skipIf(!enabled)(
    "Mongo publication resumes every interrupted write boundary without exposing a staged version",
    async () => {
        const fixture = await contentMongo();
        try {
            const db = fixture.client.db("template_recovery");
            const store = new MongoTemplateStore(db);
            await store.init();
            const service = new EmailTemplates(store);
            for (const stage of [
                "after-reserve",
                "before-insert",
                "after-insert",
                "before-commit",
                "after-commit",
            ] as const) {
                const id = crypto.randomUUID();
                const created = await service.create({
                    id,
                    name: "Recovery",
                    description: "",
                    locale: "en",
                    draft: { subject: "Snapshot", text: "Committed baseline", variables: [] },
                });
                await service.publish({ id, expectedRevision: created.revision });
                const updated = await service.updateDraft({
                    id,
                    expectedRevision: 2,
                    name: created.name,
                    description: "",
                    draft: { subject: "Snapshot", text: stage, variables: [] },
                });
                const fault: PublicationFault = { stage };
                const interrupted = new EmailTemplates(new MongoTemplateStore(interruptedDatabase(db, fault)));
                const request = { id, expectedRevision: updated.revision };
                await expect(interrupted.publish(request)).rejects.toThrow("Injected process failure");
                const reopened = new EmailTemplates(new MongoTemplateStore(db));
                const visible = await reopened.get({ id });
                expect(visible).not.toHaveProperty("pendingPublication");
                if (stage !== "after-commit") {
                    expect(visible.latestVersion).toBe(1);
                    await expect(reopened.getVersion({ id, version: 2 })).rejects.toThrow("NOT_FOUND");
                    await expect(
                        reopened.updateDraft({
                            id,
                            expectedRevision: updated.revision,
                            name: "Overwrite",
                            description: "",
                            draft: { subject: "Changed", text: "Changed", variables: [] },
                        }),
                    ).rejects.toThrow("CORE_UNAVAILABLE");
                    await expect(reopened.archive(request)).rejects.toThrow("CORE_UNAVAILABLE");
                    expect((await reopened.getVersion({ id, version: 1 })).content.text).toBe("Committed baseline");
                    expect(await store.get(id)).toHaveProperty("pendingPublication");
                }
                expect((await reopened.publish(request)).version).toBe(2);
                expect((await reopened.getVersion({ id, version: 2 })).content.text).toBe(stage);
                expect(await db.collection("email_template_publications_v1").countDocuments({ templateId: id })).toBe(
                    2,
                );
                expect(await db.collection("email_templates_v1").findOne({ _id: id })).not.toHaveProperty(
                    "pendingPublication",
                );
            }
        } finally {
            await fixture.close();
        }
    },
    60000,
);
