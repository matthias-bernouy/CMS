import type { Collection, UpdateFilter } from "mongodb";
import { dayKey, rollupId, truncateToDay } from "../../core/rollups/buckets";
import { HyperLogLogPlus, hllRegisterFromHex } from "../../core/hll/HyperLogLogPlus";
import { ANALYTICS_VERSIONS, STRICT_ANALYTICS_LIMITS } from "../../interfaces/AnalyticsPrivacy";
import type { HllSketchDoc, RollupDoc } from "./types";

const DAY_MS = 86_400_000;

export async function updateHllSketch(
    sketches: Collection<HllSketchDoc>,
    ts: Date,
    visitorHash: string,
    stripe: number,
): Promise<void> {
    const day = truncateToDay(ts);
    const { index, rank } = hllRegisterFromHex(visitorHash, STRICT_ANALYTICS_LIMITS.hllPrecision);
    await sketches.updateOne(
        { _id: `${dayKey(day)}|${stripe}` },
        {
            $max: { [`registers.${index}`]: rank },
            $setOnInsert: {
                day,
                stripe,
                precision: STRICT_ANALYTICS_LIMITS.hllPrecision,
                profileVersion: ANALYTICS_VERSIONS.profile,
                expiresAt: new Date(day.getTime() + (1 + STRICT_ANALYTICS_LIMITS.sketchTtlHours / 24) * DAY_MS),
            },
        } as UpdateFilter<HllSketchDoc>,
        { upsert: true },
    );
}

export async function finalizeHllSketches(
    sketches: Collection<HllSketchDoc>,
    rollups: Collection<RollupDoc>,
    before: Date,
    retentionDays: number,
): Promise<void> {
    const closedBefore = truncateToDay(before);
    const documents = await sketches.find({ day: { $lt: closedBefore } }).toArray();
    const byDay = new Map<string, HllSketchDoc[]>();
    for (const document of documents) {
        const day = dayKey(document.day);
        byDay.set(day, [...(byDay.get(day) ?? []), document]);
    }
    await Promise.all(
        [...byDay].map(async ([day, daySketches]) => {
            const merged = new HyperLogLogPlus(STRICT_ANALYTICS_LIMITS.hllPrecision);
            for (const document of daySketches) {
                for (const [index, rank] of Object.entries(document.registers)) {
                    merged.setRegister(Number(index), rank);
                }
            }
            const bucket = new Date(`${day}T00:00:00.000Z`);
            await rollups.updateOne(
                { _id: rollupId("visitor", "estimate", ANALYTICS_VERSIONS.visitorEstimator, day) },
                {
                    $set: {
                        metric: "visitor",
                        dim: "estimate",
                        key: ANALYTICS_VERSIONS.visitorEstimator,
                        bucket,
                        count: merged.estimate(),
                        expiresAt: new Date(bucket.getTime() + retentionDays * DAY_MS),
                        rollupVersion: ANALYTICS_VERSIONS.rollup,
                    },
                },
                { upsert: true },
            );
        }),
    );
    if (documents.length > 0) {
        await sketches.updateMany(
            { _id: { $in: documents.map((document) => document._id) } },
            { $set: { finalizedAt: new Date() } },
        );
    }
}
