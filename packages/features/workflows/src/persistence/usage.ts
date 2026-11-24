import type { Db } from "mongodb";
import type { WorkflowCapability } from "workflows/interfaces/definition";
import { createHash } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
type Target = Pick<WorkflowCapability["target"], "contractId" | "capabilityId" | "version" | "installationId">;
/** Stream projected metadata only. Exceeding a budget makes upgrades incomplete, never silently compatible. */
export async function workflowUsage(db: Db, limit: number) {
    const targets: Target[] = [];
    const digest = createHash("sha256");
    let complete = true;
    const activePlans = { retired: false, $or: [{ installationId: { $exists: false } }, { confirmed: true }] };
    for (const [name, filter, pending] of [
        ["workflow_plans", activePlans, false],
        [
            "workflow_runs",
            { status: { $in: ["queued", "running", "waiting", "failed", "outcomeUnknown", "suspended"] } },
            false,
        ],
        ["workflow_definitions", { "publication.revision": { $exists: true } }, true],
    ] as const) {
        const root = pending ? "publication.targets" : "targets";
        const projection = Object.fromEntries(
            ["contractId", "capabilityId", "version", "installationId"].map((key) => [`${root}.${key}`, 1]),
        );
        const cursor = db
            .collection(name)
            .find(filter, { projection: { ...projection, revision: 1 }, maxTimeMS: 2000 })
            .sort({ _id: 1 })
            .batchSize(25)
            .limit(limit + 1);
        let count = 0;
        try {
            for await (const row of cursor) {
                if (++count > limit || targets.length >= 10000) {
                    complete = false;
                    break;
                }
                digest.update(canonicalizeIJson(row));
                const pinned = pending ? row.publication?.targets : row.targets;
                if (!Array.isArray(pinned) || pinned.length > 129 || targets.length + pinned.length > 10000) {
                    complete = false;
                    break;
                }
                targets.push(...pinned);
            }
        } finally {
            await cursor.close();
        }
    }

    // A committed installation decision is already a consumer while its plan confirmation is recovering.
    const pendingPlans = db
        .collection("workflow_installations")
        .aggregate(
            [
                { $match: { pendingPublication: { $gt: 0 } } },
                { $sort: { _id: 1 } },
                { $limit: limit + 1 },
                {
                    $lookup: {
                        from: "workflow_plans",
                        let: {
                            installation: "$_id",
                            key: { $concat: ["$workflowId", ":", { $toString: "$pendingPublication" }] },
                        },
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $and: [
                                            { $eq: ["$_id", "$$key"] },
                                            { $eq: ["$installationId", "$$installation"] },
                                        ],
                                    },
                                },
                            },
                            { $project: { targets: 1, confirmed: 1 } },
                        ],
                        as: "plan",
                    },
                },
                { $unwind: { path: "$plan", preserveNullAndEmptyArrays: true } },
                { $match: { "plan.confirmed": { $ne: true } } },
                { $project: { revision: "$pendingPublication", targets: "$plan.targets" } },
            ],
            { maxTimeMS: 2000 },
        )
        .batchSize(25);
    let pendingCount = 0;
    try {
        for await (const row of pendingPlans) {
            if (
                ++pendingCount > limit ||
                !Array.isArray(row.targets) ||
                row.targets.length > 129 ||
                targets.length + row.targets.length > 10000
            ) {
                complete = false;
                break;
            }
            digest.update(canonicalizeIJson(row));
            targets.push(...row.targets);
        }
    } finally {
        await pendingPlans.close();
    }
    return { complete, revision: digest.digest("hex"), targets };
}
