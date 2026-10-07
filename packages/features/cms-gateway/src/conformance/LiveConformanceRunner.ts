import {
    admitConformanceEvidence,
    type AdmittedConformanceEvidence,
    type AdmittedConformanceSuite,
    type AdmittedContractRelease,
    type ConformanceScenario,
    type ConformanceScenarioEvidence,
} from "@bernouy/cms-repository/contracts";
import { executeConformanceCall, type ConformanceCallSnapshot } from "./executeCall";
import type {
    ConformanceEnvironmentFactory,
    ConformanceProviderIdentity,
    ConformanceScenarioEnvironment,
} from "./interfaces";
import {
    assertRunCoordinates,
    elapsed,
    indexDependencies,
    keyedInvocation,
    profileRelease,
    scenarioRuns,
} from "./runnerPlan";

export interface LiveConformanceRunInput {
    readonly suite: AdmittedConformanceSuite;
    readonly release: AdmittedContractRelease;
    readonly dependencies?: readonly AdmittedContractRelease[];
    readonly provider: ConformanceProviderIdentity;
    readonly environments: ConformanceEnvironmentFactory;
}

export interface LiveConformanceRunnerOptions {
    readonly runnerName?: string;
    readonly runnerVersion?: string;
    readonly now?: () => Date;
    readonly monotonicNow?: () => number;
    readonly sleep?: (milliseconds: number) => Promise<void>;
    readonly createId?: () => string;
}

export class LiveConformanceRunner {
    private readonly runnerName: string;
    private readonly runnerVersion: string;
    private readonly now: () => Date;
    private readonly monotonicNow: () => number;
    private readonly sleep: (milliseconds: number) => Promise<void>;
    private readonly createId: () => string;

    constructor(options: LiveConformanceRunnerOptions = {}) {
        this.runnerName = options.runnerName ?? "ulvia.conformance-runner";
        this.runnerVersion = options.runnerVersion ?? "1.0.0";
        this.now = options.now ?? (() => new Date());
        this.monotonicNow = options.monotonicNow ?? (() => performance.now());
        this.sleep = options.sleep ?? ((milliseconds) => Bun.sleep(milliseconds));
        this.createId = options.createId ?? (() => crypto.randomUUID());
    }

    async run(input: LiveConformanceRunInput): Promise<AdmittedConformanceEvidence> {
        assertRunCoordinates(input);
        const id = this.createId();
        const startedAt = this.now().toISOString();
        const scenarios: ConformanceScenarioEvidence[] = [];
        const dependencies = indexDependencies(input.dependencies ?? []);
        for (const candidate of scenarioRuns(input.suite)) {
            scenarios.push(await this.runScenario(input, candidate.scenario, candidate.profileId, id, dependencies));
        }
        const finishedAt = this.now().toISOString();
        return admitConformanceEvidence({
            kind: "conformance-evidence",
            protocol: "ulvia-conformance-evidence/v1",
            id,
            publisherId: input.provider.publisherId,
            providerId: input.provider.providerId,
            providerManifest: {
                version: input.provider.manifestVersion,
                digest: input.provider.manifestDigest,
            },
            providerBuildVersion: input.provider.buildVersion,
            contract: {
                publisherId: input.release.release.publisherId,
                id: input.release.release.contractId,
                version: input.release.release.version,
                digest: input.release.digest,
            },
            suite: {
                version: input.suite.suite.version,
                digest: input.suite.digest,
                canonicalJson: input.suite.canonicalJson,
            },
            runner: { name: this.runnerName, version: this.runnerVersion },
            startedAt,
            finishedAt,
            status: scenarios.every(({ status }) => status === "passed") ? "passed" : "failed",
            scenarios,
        });
    }

    private async runScenario(
        input: LiveConformanceRunInput,
        scenario: ConformanceScenario,
        profileId: string | undefined,
        runId: string,
        dependencies: ReadonlyMap<string, AdmittedContractRelease>,
    ): Promise<ConformanceScenarioEvidence> {
        const started = this.monotonicNow();
        const profile = input.suite.suite.dependencyProfiles?.find(({ id }) => id === profileId);
        const environment = await input.environments.provision({
            runId,
            scenarioId: scenario.id,
            ...(profileId ? { profileId } : {}),
            dependencies: profile?.releases ?? [],
        });
        try {
            return await this.executeScenario(
                input,
                scenario,
                profileId,
                profile?.releases ?? [],
                environment,
                dependencies,
                started,
            );
        } finally {
            await environment.dispose();
        }
    }

    private async executeScenario(
        input: LiveConformanceRunInput,
        scenario: ConformanceScenario,
        profileId: string | undefined,
        profileReleases: readonly { contractId: string; version: string; digest: string }[],
        environment: ConformanceScenarioEnvironment,
        dependencies: ReadonlyMap<string, AdmittedContractRelease>,
        started: number,
    ): Promise<ConformanceScenarioEvidence> {
        const calls = [];
        const captures = new Map<string, unknown>();
        const snapshots = new Map<string, ConformanceCallSnapshot>();
        const fixtures = new Map((input.suite.fixtureAssets ?? []).map((asset) => [asset.id, asset]));
        for (const call of scenario.calls) {
            const release = call.dependencyContractId
                ? profileRelease(call.dependencyContractId, profileReleases, dependencies)
                : input.release;
            const capability = release.release.capabilities.find(({ id }) => id === call.capabilityId)!;
            const invocationKey = keyedInvocation(call, capability, input.suite.digest, scenario.id, profileId);
            const result = await executeConformanceCall({
                call,
                capability,
                release,
                environment,
                captures,
                fixtures,
                ...(invocationKey ? { invocationKey } : {}),
                ...(call.replayOf ? { replay: snapshots.get(call.replayOf) } : {}),
                sleep: this.sleep,
                now: this.monotonicNow,
            });
            calls.push(result.evidence);
            if (!result.snapshot) {
                break;
            }
            snapshots.set(call.id, result.snapshot);
        }
        return {
            id: scenario.id,
            ...(profileId ? { profileId } : {}),
            status:
                calls.length === scenario.calls.length && calls.every(({ status }) => status === "passed")
                    ? "passed"
                    : "failed",
            durationMs: elapsed(this.monotonicNow(), started),
            calls,
        };
    }
}
