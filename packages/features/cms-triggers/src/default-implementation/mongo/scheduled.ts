import type { Collection, Document, Filter } from "mongodb";
import { nextRunAt } from "../../core/runtime/scheduled/state";
import type {
    ScheduledTriggerClaim,
    ScheduledTriggerClaimRequest,
    ScheduledTriggerCompletion,
} from "../../interfaces/ScheduledTrigger";
import type { TriggerScheduleRunning } from "../../interfaces/TriggerDefinition";
import { fromDoc, type TriggerDoc } from "./documents";

export async function claimDue(
    collection: Collection<TriggerDoc>,
    request: ScheduledTriggerClaimRequest,
): Promise<ScheduledTriggerClaim[]> {
    const claims: ScheduledTriggerClaim[] = [];
    while (claims.length < request.limit) {
        const claim = await claimOne(collection, dueFilter(request.now), request);
        if (!claim) {
            break;
        }
        claims.push(claim);
    }
    return claims;
}

export function claimNow(
    collection: Collection<TriggerDoc>,
    id: string,
    request: ScheduledTriggerClaimRequest,
): Promise<ScheduledTriggerClaim | null> {
    return claimOne(
        collection,
        {
            _id: id,
            enabled: true,
            "event.kind": "schedule",
            $or: [
                { "scheduleState.running": { $exists: false } },
                { "scheduleState.running.expiresAt": { $lte: request.now } },
            ],
        },
        request,
    );
}

export async function complete(
    collection: Collection<TriggerDoc>,
    completion: ScheduledTriggerCompletion,
): Promise<ReturnType<typeof fromDoc>> {
    const current = await collection.findOne({
        _id: completion.triggerId,
        _claimToken: completion.token,
        _claimOwner: completion.owner,
        "event.kind": "schedule",
    });
    if (!current || current.event.kind !== "schedule") {
        return null;
    }
    const updated = await collection.findOneAndUpdate(
        { _id: current._id, _claimToken: completion.token, _claimOwner: completion.owner },
        {
            $set: {
                lastRun: completion.lastRun,
                scheduleState: { nextRunAt: nextRunAt(current.event, completion.finishedAt) },
            },
            $unset: { _claimToken: "", _claimOwner: "" },
        },
        { returnDocument: "after" },
    );
    return fromDoc(updated);
}

async function claimOne(
    collection: Collection<TriggerDoc>,
    filter: Filter<TriggerDoc>,
    request: ScheduledTriggerClaimRequest,
): Promise<ScheduledTriggerClaim | null> {
    const token = request.makeId();
    const runId = request.makeId();
    const expiresAt = new Date(new Date(request.now).getTime() + request.leaseMs).toISOString();
    const update: Document[] = [
        {
            $set: {
                _claimToken: token,
                _claimOwner: request.owner,
                "scheduleState.running": {
                    runId: { $ifNull: ["$scheduleState.running.runId", runId] },
                    scheduledAt: {
                        $ifNull: ["$scheduleState.running.scheduledAt", "$scheduleState.nextRunAt"],
                    },
                    startedAt: request.now,
                    expiresAt,
                },
            },
        },
    ];
    const doc = await collection.findOneAndUpdate(filter, update, {
        sort: { "scheduleState.nextRunAt": 1, _id: 1 },
        returnDocument: "after",
    });
    return doc ? toClaim(doc, token, request.owner) : null;
}

function dueFilter(now: string): Filter<TriggerDoc> {
    return {
        enabled: true,
        "event.kind": "schedule",
        "scheduleState.nextRunAt": { $lte: now },
        $or: [{ "scheduleState.running": { $exists: false } }, { "scheduleState.running.expiresAt": { $lte: now } }],
    };
}

function toClaim(doc: TriggerDoc, token: string, owner: string): ScheduledTriggerClaim {
    const trigger = fromDoc(doc)!;
    const running = trigger.scheduleState?.running as TriggerScheduleRunning;
    return {
        trigger,
        token,
        owner,
        runId: running.runId,
        runKey: `scheduled-trigger:${trigger.id}:${running.runId}`,
        scheduledAt: running.scheduledAt,
        startedAt: running.startedAt,
    };
}
