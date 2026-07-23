import type { Collection } from "mongodb";
import { validateAnalyticsSettings } from "../../core/governance/analyticsSettings";
import type { AnalyticsComplianceSnapshot, AnalyticsSettings } from "../../interfaces/AnalyticsGovernance";
import {
    initializeAnalyticsSettings,
    readLatestPublishedSnapshot,
    writeAnalyticsSettings,
    writeComplianceSnapshot,
    type AnalyticsGovernanceDoc,
} from "./governance";

export class MongoAnalyticsGovernance {
    private settings: AnalyticsSettings;

    constructor(
        private readonly collection: Collection<AnalyticsGovernanceDoc>,
        defaults: AnalyticsSettings,
        private readonly onSettings: (settings: AnalyticsSettings) => void,
    ) {
        this.settings = defaults;
    }

    async init(): Promise<void> {
        this.settings = validateAnalyticsSettings(await initializeAnalyticsSettings(this.collection, this.settings));
        this.onSettings(this.settings);
        await this.collection.createIndex({ kind: 1, publishedAt: -1 });
    }

    getSettings(): AnalyticsSettings {
        return { ...this.settings };
    }

    async updateSettings(settings: AnalyticsSettings): Promise<AnalyticsSettings> {
        this.settings = validateAnalyticsSettings(settings);
        await writeAnalyticsSettings(this.collection, this.settings);
        this.onSettings(this.settings);
        return this.getSettings();
    }

    saveSnapshot(snapshot: AnalyticsComplianceSnapshot): Promise<void> {
        return writeComplianceSnapshot(this.collection, snapshot);
    }

    latestPublished(): Promise<AnalyticsComplianceSnapshot | null> {
        return readLatestPublishedSnapshot(this.collection);
    }
}
