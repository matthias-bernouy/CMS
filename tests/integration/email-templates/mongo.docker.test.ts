import { expect, test } from "bun:test";
import { EmailTemplates } from "@bernouy/email-templates";
import { MongoTemplateStore } from "@bernouy/email-templates/mongo";
import { MongoAccountEmailConfigurationStore } from "@bernouy/auth/mongo";
import { contentMongo } from "../content/mongo";

const enabled = process.env.ULVIA_RUN_EMAIL_TEMPLATES_MONGO === "1";
test.skipIf(!enabled)(
    "Mongo templates exceed former counts, persist separate immutable publications and project bounded reads",
    async () => {
        const fixture = await contentMongo();
        try {
            const db = fixture.client.db("templates_a");
            const store = new MongoTemplateStore(db);
            await store.init();
            const service = new EmailTemplates(store);
            const input = {
                id: crypto.randomUUID(),
                name: "Shared",
                locale: "en",
                description: "",
                draft: {
                    subject: "Hello",
                    text: "{{value}}",
                    variables: [{ name: "value", kind: "text" as const, required: true }],
                },
            };
            await service.create(input);
            const publications = await Promise.allSettled([
                service.publish({ id: input.id, expectedRevision: 1 }),
                service.publish({ id: input.id, expectedRevision: 1 }),
            ]);
            expect(publications.map((result) => result.status)).toEqual(["fulfilled", "fulfilled"]);
            expect(publications[0]).toEqual(publications[1]);
            expect((await service.get({ id: input.id })).latestVersion).toBe(1);
            const commands: { name: string; command: Record<string, unknown> }[] = [];
            const watch = (event: { commandName: string; command: Record<string, unknown> }) => {
                commands.push({ name: event.commandName, command: event.command });
            };
            fixture.client.on("commandStarted", watch);
            const restarted = new EmailTemplates(new MongoTemplateStore(db));
            expect(
                await restarted.render({ id: input.id, version: 1, values: [{ name: "value", value: "private" }] }),
            ).toEqual({ subject: "Hello", text: "private" });
            const page = await restarted.list({ limit: 2, includeArchived: true });
            fixture.client.off("commandStarted", watch);
            expect(page.items).toHaveLength(1);
            expect(page.items[0]).not.toHaveProperty("draft");
            expect(commands.map((entry) => entry.name)).toEqual(["find", "find", "find"]);
            expect(commands[0]!.command.projection).not.toHaveProperty("draft");
            expect(commands[1]!.command.filter).toEqual({ _id: `${input.id}@1` });
            expect(commands[2]!.command.limit).toBe(3);
            expect(JSON.stringify(commands)).not.toContain("private");
            // Counts are not quotas: every independent writer succeeds beyond the previous 100-model ceiling.
            for (let batch = 0; batch < 16; batch++) {
                await Promise.all(
                    Array.from({ length: 8 }, () =>
                        new EmailTemplates(new MongoTemplateStore(db)).create({ ...input, id: crypto.randomUUID() }),
                    ),
                );
            }
            expect(await db.collection("email_templates_v1").countDocuments()).toBe(129);
            const seen = new Set<string>();
            let after: string | undefined;
            do {
                const page = await restarted.list({ limit: 17, includeArchived: true, after });
                for (const summary of page.items) {
                    expect(seen.has(summary.id)).toBe(false);
                    expect(summary).not.toHaveProperty("draft");
                    seen.add(summary.id);
                }
                after = page.next;
            } while (after);
            expect(seen.size).toBe(129);
            for (let version = 2; version <= 65; version++) {
                await restarted.publish({ id: input.id, expectedRevision: version });
            }
            expect(await db.collection("email_template_publications_v1").countDocuments({ templateId: input.id })).toBe(
                65,
            );
            const record = await db.collection("email_templates_v1").findOne({ _id: input.id });
            expect(record).not.toHaveProperty("publications");
            expect(Buffer.byteLength(JSON.stringify(record))).toBeLessThan(4096);
            expect((await restarted.getVersion({ id: input.id, version: 65 })).version).toBe(65);
            const other = new MongoTemplateStore(fixture.client.db("templates_b"));
            await other.init();
            await expect(new EmailTemplates(other).get({ id: input.id })).rejects.toThrow("NOT_FOUND");
            const configuration = new MongoAccountEmailConfigurationStore(db);
            const binding = { id: input.id, version: 1, source: "source-a" };
            await configuration.initialize({ revision: 1, emailVerification: binding, passwordReset: binding });
            await configuration.initialize({
                revision: 1,
                emailVerification: { ...binding, source: "other" },
                passwordReset: binding,
            });
            expect((await configuration.read())!.emailVerification.source).toBe("source-a");
            expect(
                await configuration.replace({ revision: 2, emailVerification: binding, passwordReset: binding }, 1),
            ).toBe(true);
            expect(
                await configuration.replace({ revision: 2, emailVerification: binding, passwordReset: binding }, 1),
            ).toBe(false);
            expect(JSON.stringify(await db.collection("email_templates_v1").find({}).toArray())).not.toContain(
                "private",
            );
        } finally {
            await fixture.close();
        }
    },
    60000,
);
