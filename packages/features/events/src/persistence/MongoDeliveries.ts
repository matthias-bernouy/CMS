import type { Db } from "mongodb";
import type { SubscriptionOwner } from "@bernouy/cms-gateway/events";
import type { EventDeliveryStatus } from "cms-events/interfaces/store";
import { eventHash } from "cms-events/core/identity";
import { EventsError } from "cms-events/core/errors";
type Row = { _id: string; occurrenceId: string; deadline: number; deliveries: EventDeliveryStatus[] };
/** Project metadata on the server; never load payloads, resource selectors or capability targets. */
export async function listEventDeliveries(
    db: Db,
    owner: SubscriptionOwner,
    cursor: string | undefined,
    limit: number,
    now: number,
) {
    const prefix = `${eventHash({ database: db.databaseName, owner })}:`;
    const rest = cursor?.startsWith(prefix) ? cursor.slice(prefix.length) : undefined;
    if (cursor && (!rest || !/^[a-f0-9]{64}:[0-9]{1,5}$/u.test(rest))) {
        throw new EventsError("INVALID_INPUT");
    }
    const [after, position] = rest?.split(":") ?? [];
    const offset = Number(position ?? 0);
    const matches = {
        "subscription.owner.siteId": owner.siteId,
        "subscription.owner.installationId": owner.installationId,
        "subscription.owner.consumerContractId": owner.consumerContractId,
    };
    const rows = await db
        .collection("domain_event_outbox")
        .aggregate<Row>(
            [
                {
                    $match: {
                        siteId: owner.siteId,
                        "record.deliveries": { $elemMatch: matches },
                        ...(after ? { _id: { $gte: after } } : {}),
                    },
                },
                { $sort: { _id: 1 } },
                { $limit: limit + 1 },
                {
                    $project: {
                        occurrenceId: "$record.event.occurrenceId",
                        deadline: "$record.expiresAt",
                        deliveries: {
                            $map: {
                                input: {
                                    $filter: {
                                        input: "$record.deliveries",
                                        as: "intent",
                                        cond: {
                                            $and: [
                                                { $eq: ["$$intent.subscription.owner.siteId", owner.siteId] },
                                                {
                                                    $eq: [
                                                        "$$intent.subscription.owner.installationId",
                                                        owner.installationId,
                                                    ],
                                                },
                                                {
                                                    $eq: [
                                                        "$$intent.subscription.owner.consumerContractId",
                                                        owner.consumerContractId,
                                                    ],
                                                },
                                            ],
                                        },
                                    },
                                },
                                as: "intent",
                                in: {
                                    deliveryId: "$$intent.id",
                                    subscriptionId: "$$intent.subscription.id",
                                    subscriptionRevision: "$$intent.subscription.revision",
                                    state: "$$intent.state",
                                    attempts: "$$intent.attempts",
                                    nextAttemptAt: "$$intent.dueAt",
                                    failureCode: "$$intent.failureCode",
                                },
                            },
                        },
                    },
                },
            ],
            { maxTimeMS: 2000 },
        )
        .toArray();
    const items: EventDeliveryStatus[] = [];
    let last: string | undefined;
    for (const row of rows) {
        for (let index = row._id === after ? offset : 0; index < row.deliveries.length; index++) {
            if (items.length === limit) {
                return { items, nextCursor: last };
            }
            const { nextAttemptAt, ...intent } = row.deliveries[index]!;
            const expired = intent.state === "pending" && row.deadline <= now;
            items.push({
                ...intent,
                occurrenceId: row.occurrenceId,
                ...(expired ? { state: "failed", failureCode: "DELIVERY_EXPIRED" } : {}),
                ...(!expired && intent.state === "pending" ? { nextAttemptAt } : {}),
            });
            last = `${prefix}${row._id}:${index + 1}`;
        }
    }
    return { items };
}
