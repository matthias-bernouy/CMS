export type AnalyticsSettings = {
    enabled: boolean;
    visitorEstimation: boolean;
    rollupRetentionDays: number;
    privacyNoticeUrl: string;
};

export type AnalyticsComplianceContext = {
    cmsVersion: string;
    secretReady: boolean;
    siteScope: string;
    trustProxy: boolean;
    trustedProxyVerified: boolean;
    secureCookie: boolean;
    optOutUrl: string;
};

export type AnalyticsCriterionStatus = "pass" | "fail" | "manual-review" | "not-applicable";

export type AnalyticsComplianceCriterion = {
    id: string;
    mode: "automatic" | "manual";
    label: string;
    status: AnalyticsCriterionStatus;
    evidence: string;
    requiredAction?: string;
};

export type AnalyticsManualAttestation = {
    status: "pass" | "fail" | "not-applicable";
    evidence: string;
};

export type AnalyticsComplianceEvaluation = {
    evaluatedAt: Date;
    checklistVersion: string;
    configurationFingerprint: string;
    releaseReady: boolean;
    settings: AnalyticsSettings;
    context: Omit<AnalyticsComplianceContext, "secretReady"> & { secretReady: boolean };
    criteria: AnalyticsComplianceCriterion[];
};

export type AnalyticsComplianceSnapshot = {
    id: string;
    createdAt: Date;
    publishedAt?: Date;
    evaluation: AnalyticsComplianceEvaluation;
    manualAttestations: Record<string, AnalyticsManualAttestation>;
};
