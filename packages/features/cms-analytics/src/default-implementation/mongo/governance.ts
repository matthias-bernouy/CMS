import type { Collection } from "mongodb";
import type { AnalyticsComplianceSnapshot, AnalyticsSettings } from "../../interfaces/AnalyticsGovernance";

type SettingsDoc = {
    _id: "settings";
    kind: "settings";
    settings: AnalyticsSettings;
    updatedAt: Date;
};

type SnapshotDoc = AnalyticsComplianceSnapshot & {
    _id: string;
    kind: "snapshot";
};

export type AnalyticsGovernanceDoc = SettingsDoc | SnapshotDoc;

export async function initializeAnalyticsSettings(
    collection: Collection<AnalyticsGovernanceDoc>,
    defaults: AnalyticsSettings,
): Promise<AnalyticsSettings> {
    await collection.updateOne(
        { _id: "settings" },
        { $setOnInsert: { kind: "settings", settings: defaults, updatedAt: new Date() } },
        { upsert: true },
    );
    const document = await collection.findOne({ _id: "settings" });
    return document?.kind === "settings" ? document.settings : defaults;
}

export async function writeAnalyticsSettings(
    collection: Collection<AnalyticsGovernanceDoc>,
    settings: AnalyticsSettings,
): Promise<void> {
    await collection.updateOne(
        { _id: "settings" },
        { $set: { kind: "settings", settings, updatedAt: new Date() } },
        { upsert: true },
    );
}

export async function writeComplianceSnapshot(
    collection: Collection<AnalyticsGovernanceDoc>,
    snapshot: AnalyticsComplianceSnapshot,
): Promise<void> {
    await collection.updateOne(
        { _id: `snapshot:${snapshot.id}` },
        { $setOnInsert: { ...snapshot, kind: "snapshot" } },
        { upsert: true },
    );
}

export async function readLatestPublishedSnapshot(
    collection: Collection<AnalyticsGovernanceDoc>,
): Promise<AnalyticsComplianceSnapshot | null> {
    const document = await collection.findOne(
        { kind: "snapshot", publishedAt: { $exists: true } },
        { sort: { publishedAt: -1 } },
    );
    if (!document || document.kind !== "snapshot") {
        return null;
    }
    const { _id: _, kind: __, ...snapshot } = document;
    return snapshot;
}
