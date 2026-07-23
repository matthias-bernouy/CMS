import { validateAnalyticsSettings } from "../../core/governance/analyticsSettings";
import type { AnalyticsComplianceSnapshot, AnalyticsSettings } from "../../interfaces/AnalyticsGovernance";

export class MemoryAnalyticsGovernance {
    private readonly snapshots: AnalyticsComplianceSnapshot[] = [];

    constructor(
        private settings: AnalyticsSettings,
        private readonly onSettings: (settings: AnalyticsSettings) => void,
    ) {}

    getSettings(): AnalyticsSettings {
        return { ...this.settings };
    }

    updateSettings(settings: AnalyticsSettings): AnalyticsSettings {
        this.settings = validateAnalyticsSettings(settings);
        this.onSettings(this.settings);
        return this.getSettings();
    }

    saveSnapshot(snapshot: AnalyticsComplianceSnapshot): void {
        if (!this.snapshots.some((existing) => existing.id === snapshot.id)) {
            this.snapshots.push(structuredClone(snapshot));
        }
    }

    latestPublished(): AnalyticsComplianceSnapshot | null {
        return (
            this.snapshots
                .filter((snapshot) => snapshot.publishedAt)
                .sort((left, right) => right.publishedAt!.getTime() - left.publishedAt!.getTime())
                .at(0) ?? null
        );
    }
}
