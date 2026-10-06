export interface ReleaseLimits {
    maxArrayItems: number;
    maxBinaryBytes: number;
    maxCapabilities: number;
    maxConformanceAttempts: number;
    maxConformanceCallsPerScenario: number;
    maxConformanceDependencyProfiles: number;
    maxConformanceDependenciesPerProfile: number;
    maxConformanceDurationMs: number;
    maxConformancePages: number;
    maxConformanceScenarios: number;
    maxDocumentBytes: number;
    maxEnumValues: number;
    maxFixtureAssets: number;
    maxJsonDepth: number;
    maxMocksPerCapability: number;
    maxProperties: number;
    maxSchemaDepth: number;
    maxSchemaNodes: number;
    maxStringLength: number;
}

export const DEFAULT_RELEASE_LIMITS: Readonly<ReleaseLimits> = Object.freeze({
    maxArrayItems: 10_000,
    maxBinaryBytes: 100 * 1024 * 1024,
    maxCapabilities: 512,
    maxConformanceAttempts: 100,
    maxConformanceCallsPerScenario: 64,
    maxConformanceDependencyProfiles: 16,
    maxConformanceDependenciesPerProfile: 32,
    maxConformanceDurationMs: 60_000,
    maxConformancePages: 100,
    maxConformanceScenarios: 128,
    maxDocumentBytes: 1024 * 1024,
    maxEnumValues: 256,
    maxFixtureAssets: 256,
    maxJsonDepth: 64,
    maxMocksPerCapability: 128,
    maxProperties: 256,
    maxSchemaDepth: 24,
    maxSchemaNodes: 4096,
    maxStringLength: 1024 * 1024,
});

/** Shared JSON envelope budget for gateway, provider relay and local Core calls. */
export const MAX_CAPABILITY_JSON_BYTES = 8 * 1024 * 1024;
export const MAX_CAPABILITY_JSON_DEPTH = 64;
