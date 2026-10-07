import type {
    AdmittedConformanceSuite,
    AdmittedContractRelease,
    ConformanceScenario,
} from "@bernouy/cms-repository/contracts";
import type { LiveConformanceRunInput } from "./LiveConformanceRunner";

export function scenarioRuns(suite: AdmittedConformanceSuite) {
    const profiles = suite.suite.dependencyProfiles?.map(({ id }) => id) ?? [undefined];
    return suite.suite.scenarios.flatMap((scenario) =>
        profiles
            .filter(
                (profileId) => !scenario.profiles || (profileId !== undefined && scenario.profiles.includes(profileId)),
            )
            .map((profileId) => ({ scenario, profileId })),
    );
}

export function indexDependencies(
    releases: readonly AdmittedContractRelease[],
): ReadonlyMap<string, AdmittedContractRelease> {
    return new Map(
        releases.map((release) => [
            `${release.release.contractId}@${release.release.version}#${release.digest}`,
            release,
        ]),
    );
}

export function profileRelease(
    contractId: string,
    profile: readonly { contractId: string; version: string; digest: string }[],
    dependencies: ReadonlyMap<string, AdmittedContractRelease>,
): AdmittedContractRelease {
    const selected = profile.find((item) => item.contractId === contractId);
    const release = selected && dependencies.get(`${selected.contractId}@${selected.version}#${selected.digest}`);
    if (!release) {
        throw new Error(`Missing admitted conformance dependency ${contractId}`);
    }
    return release;
}

export function keyedInvocation(
    call: ConformanceScenario["calls"][number],
    capability: AdmittedContractRelease["release"]["capabilities"][number],
    suiteDigest: string,
    scenarioId: string,
    profileId: string | undefined,
): string | undefined {
    if (capability.behavior.effect !== "command" || capability.behavior.idempotency !== "keyed") {
        return undefined;
    }
    return `${suiteDigest}:${scenarioId}:${profileId ?? "default"}:${call.invocationKey ?? call.id}`;
}

export function assertRunCoordinates(input: LiveConformanceRunInput): void {
    if (
        input.suite.suite.contractId !== input.release.release.contractId ||
        input.suite.suite.contractVersion !== input.release.release.version ||
        input.suite.suite.contractDigest !== input.release.digest
    ) {
        throw new Error("Conformance suite does not target the supplied contract release");
    }
}

export function elapsed(now: number, started: number): number {
    return Math.max(0, Math.min(86_400_000, Math.round(now - started)));
}
