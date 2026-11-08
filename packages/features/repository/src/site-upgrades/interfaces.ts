export type SiteUpgradeActive = Readonly<{
    id: string;
    siteId: string;
    kind: string;
    planDigest: string;
    expectedRevision: number;
    sourceStateDigest: string;
    targetStateDigest: string;
    status: "prepared" | "applying" | "completed" | "cancelled";
    createdAt: string;
}>;
export type SiteUpgradeIntent<T> = SiteUpgradeActive & Readonly<{ payload: T }>;
export interface SiteWriteFence {
    claimMaintenance(siteId: string, operationId: string): Promise<boolean>;
    assertMaintenance(siteId: string, operationId: string): Promise<void>;
    releaseMaintenance(siteId: string, operationId: string): Promise<void>;
    yieldMaintenance(siteId: string, operationId: string): Promise<void>;
    withWrite<T>(siteId: string, operation: () => Promise<T>): Promise<T>;
}
export interface SiteUpgradeStorage extends SiteWriteFence {
    begin<T>(intent: SiteUpgradeIntent<T>): Promise<SiteUpgradeIntent<T>>;
    get<T>(siteId: string, id: string, kind: string): Promise<SiteUpgradeIntent<T> | null>;
    getActive(siteId: string): Promise<SiteUpgradeActive | null>;
    transition(
        siteId: string,
        id: string,
        from: SiteUpgradeActive["status"],
        to: SiteUpgradeActive["status"],
    ): Promise<void>;
}
