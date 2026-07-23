import { MongoClient } from "mongodb";
import { hllRegisterFromHex } from "../../src/core/hll/HyperLogLogPlus";
import { sha256HexAsync } from "../../src/core/identity/sha256Hex";

const rates = [50, 100, 250, 500, 1_000];
const stripeCounts = [1, 4, 8, 16];
const mongoUrl = process.env.ANALYTICS_BENCHMARK_MONGO_URL ?? "mongodb://127.0.0.1:27028";
const client = new MongoClient(mongoUrl);

await client.connect();
try {
    const db = client.db("cmscore_analytics_benchmark");
    const registers = await Promise.all(
        Array.from({ length: Math.max(...rates) }, async (_, index) =>
            hllRegisterFromHex(await sha256HexAsync(`benchmark-${index}`), 12),
        ),
    );
    console.log("stripes,rate,achieved,p95_ms,p99_ms,errors,write_conflicts,avg_bson_bytes");
    for (const stripes of stripeCounts) {
        for (const rate of rates) {
            const collection = db.collection(`hll_${stripes}_${rate}`);
            await collection.drop().catch(() => undefined);
            const before = await writeConflicts(db);
            const latencies: number[] = [];
            let errors = 0;
            const started = performance.now();
            for (let tick = 0; tick < 20; tick++) {
                const target = started + tick * 50;
                const wait = target - performance.now();
                if (wait > 0) {
                    await Bun.sleep(wait);
                }
                const from = Math.floor((tick * rate) / 20);
                const to = Math.floor(((tick + 1) * rate) / 20);
                await Promise.all(
                    registers.slice(from, to).map(async ({ index, rank }, offset) => {
                        const operationStarted = performance.now();
                        try {
                            await collection.updateOne(
                                { _id: `2026-07-23|${(from + offset) % stripes}` },
                                {
                                    $max: { [`registers.${index}`]: rank },
                                    $setOnInsert: { day: new Date("2026-07-23"), precision: 12 },
                                },
                                { upsert: true },
                            );
                        } catch {
                            errors++;
                        } finally {
                            latencies.push(performance.now() - operationStarted);
                        }
                    }),
                );
            }
            const elapsedSeconds = (performance.now() - started) / 1_000;
            const stats = await db.command({ collStats: collection.collectionName });
            const conflicts = (await writeConflicts(db)) - before;
            latencies.sort((left, right) => left - right);
            console.log(
                [
                    stripes,
                    rate,
                    Math.round(rate / elapsedSeconds),
                    percentile(latencies, 0.95).toFixed(2),
                    percentile(latencies, 0.99).toFixed(2),
                    errors,
                    conflicts,
                    Math.round(Number(stats.avgObjSize ?? 0)),
                ].join(","),
            );
        }
    }
    await db.dropDatabase();
} finally {
    await client.close();
}

function percentile(values: number[], quantile: number): number {
    return values[Math.max(0, Math.ceil(values.length * quantile) - 1)] ?? 0;
}

async function writeConflicts(db: ReturnType<MongoClient["db"]>): Promise<number> {
    const status = await db.admin().serverStatus();
    return Number(status.metrics?.operation?.writeConflicts ?? 0);
}
