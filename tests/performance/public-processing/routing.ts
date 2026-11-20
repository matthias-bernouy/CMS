import { MongoSiteUpgradeStorage } from "@bernouy/repository/upgrades/mongo";
import { contentMongo } from "../../integration/content/mongo";
import { measure } from "./measure";

/** Real disposable Mongo; driver command events prove that no fence read was removed. */
export async function routingMeasurements() {
    const fixture = await contentMongo();
    try {
        const storage = new MongoSiteUpgradeStorage(fixture.client.db());
        await storage.init();
        await storage.withWrite("processing-site", async () => undefined);
        const expected = await storage.readResourceRevision("processing-site");
        let commands = 0;
        let outstanding = 0;
        let peak = 0;
        fixture.client.on("commandStarted", (event) => {
            if (event.commandName === "find") {
                commands++;
                peak = Math.max(peak, ++outstanding);
            }
        });
        fixture.client.on("commandSucceeded", (event) => {
            if (event.commandName === "find") {
                outstanding--;
            }
        });
        const measurement = await measure(
            "routing-revision:real-mongo:quiet",
            () => {
                commands = 0;
                peak = 0;
            },
            () => storage.readResourceRevision("processing-site"),
            (revision) => {
                if (revision !== expected || commands !== 4 || outstanding !== 0) {
                    throw new Error("Revision proof or four-read fence changed");
                }
            },
        );
        const quietPeak = peak;
        const concurrent = await measure(
            "routing-revision:real-mongo:eight-concurrent",
            () => {
                commands = 0;
                peak = 0;
            },
            () => Promise.all(Array.from({ length: 8 }, () => storage.readResourceRevision("processing-site"))),
            (revisions) => {
                if (revisions.some((revision) => revision !== expected) || commands !== 32 || outstanding !== 0) {
                    throw new Error("Concurrent revision proofs or four-read fences changed");
                }
            },
        );
        return {
            measurements: [measurement, concurrent],
            counts: {
                mongoFindsPerRequest: 4,
                peakConcurrentFinds: quietPeak,
                concurrentRequests: 8,
                concurrentMongoFinds: commands,
                concurrentPeakFinds: peak,
            },
            mongo: { version: "7.0.37", transport: "Docker Mongo over loopback, real driver; no simulated latency" },
        };
    } finally {
        await fixture.close();
    }
}
