import { expect, test } from "bun:test";
import { EmailTemplates } from "@bernouy/email-templates";
import { MongoTemplateStore } from "@bernouy/email-templates/mongo";
import { MongoAccountEmailConfigurationStore } from "@bernouy/auth/mongo";
import { contentMongo } from "../content/mongo";

const enabled = process.env.ULVIA_RUN_EMAIL_TEMPLATES_MONGO === "1";
test.skipIf(!enabled)(
    "Mongo templates persist exact publications, enforce shared capacity and project bounded reads",
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
            expect(publications.some((result) => result.status === "fulfilled")).toBe(true);
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
            expect(commands.map((entry) => entry.name)).toEqual(["find", "find"]);
            expect(commands[0]!.command.projection).toHaveProperty("publications.$slice");
            expect(commands[1]!.command.limit).toBe(3);
            expect(JSON.stringify(commands)).not.toContain("private");
            // Fill all but two slots, then race independent writers against the hard bound.
            const persisted = await db.collection("email_templates_v1").findOne({ id: input.id });
            const occupied = await db.collection("email_templates_v1").distinct("_id");
            const free = Array.from({ length: 100 }, (_, index) => index).filter((slot) => !occupied.includes(slot));
            await db
                .collection("email_templates_v1")
                .insertMany(free.slice(0, 97).map((slot) => ({ ...persisted, _id: slot, id: crypto.randomUUID() })));
            const competing = await Promise.allSettled(
                Array.from({ length: 4 }, () =>
                    new EmailTemplates(new MongoTemplateStore(db)).create({ ...input, id: crypto.randomUUID() }),
                ),
            );
            expect(competing.filter((result) => result.status === "fulfilled")).toHaveLength(2);
            expect(await db.collection("email_templates_v1").countDocuments()).toBe(100);
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
