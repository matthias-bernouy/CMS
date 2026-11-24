import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { contentMongo } from "../../../../../tests/integration/content/mongo";
import { fixture, schema } from "../support/fixture";
const enabled = process.env.ULVIA_RUN_EVENTS_MONGO === "1";
describe.skipIf(!enabled)("Domain publication Mongo operation budget", () => {
    let mongo: Awaited<ReturnType<typeof contentMongo>>;
    beforeAll(async () => {
        mongo = await contentMongo();
    }, 30000);
    afterAll(async () => {
        await mongo?.close();
    }, 30000);
    test("zero-subscriber publication uses five operations; replay two; metadata lists use one bounded projection", async () => {
        const db = mongo.client.db(`event_cost_${crypto.randomUUID().replaceAll("-", "")}`);
        const f = await fixture(db);
        const definition = await f.definitions.resolve(f.producer, "order.paid");
        const commands: string[] = [];
        const listener = (event: { commandName: string; databaseName: string }) => {
            if (event.databaseName === db.databaseName) {
                commands.push(event.commandName);
            }
        };
        mongo.client.on("commandStarted", listener);
        try {
            await f.publications.publish(f.producer, definition.id, "one", '{"id":"order","secret":"private"}');
            expect(commands).toEqual(["find", "find", "find", "find", "insert"]);
            commands.length = 0;
            await f.publications.publish(f.producer, definition.id, "one", '{"id":"order","secret":"private"}');
            expect(commands).toEqual(["find", "find"]);
            commands.length = 0;
            const page = await f.definitions.list(f.producer, undefined, 1);
            expect(commands).toEqual(["find"]);
            expect(page.items).toHaveLength(1);
            expect(page.items[0]).not.toHaveProperty("schema");
        } finally {
            mongo.client.off("commandStarted", listener);
        }
    });
});
