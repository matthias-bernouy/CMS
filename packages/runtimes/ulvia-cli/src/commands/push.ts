import { rcompare } from "semver";
import { buildLocalCandidate } from "../publication/candidate";
import { publishLocalCandidate } from "../publication/client";
import { parsePushFlags, repositoryManagementUrl } from "../publication/config";
import type { PublicationClientConfig, PublicationResult } from "../publication/contracts";
import { orderPushRecords } from "../publication/order";
import type { LocalIntegrationRepository } from "../repository/local";
import type { LocalPackageRecord } from "../repository/manifest";
import type { RemoteIntegrationRepository } from "../repository/remote";

export type PushCommandOptions = Readonly<{
    environment: Record<string, string | undefined>;
    fetch?: typeof fetch;
    now?: () => number;
    wait?: (milliseconds: number) => Promise<void>;
}>;

const PUBLIC_ROUND_TRIP_TIMEOUT_MS = 10_000;
const PUBLIC_ROUND_TRIP_INTERVAL_MS = 250;

export async function pushCommand(
    args: readonly string[],
    local: LocalIntegrationRepository,
    remote: RemoteIntegrationRepository,
    options: PushCommandOptions,
    log: (message: string) => void,
): Promise<void> {
    const flags = parsePushFlags(args, options.environment);
    const targets = selectTargets(await local.list(), flags.kind, flags.version, flags.all);
    if (!targets.length) {
        log("No locally released integration packages are available to push.");
        return;
    }
    if (!flags.cmsUrl) {
        throw new Error("push requires the manager CMS URL through --url or ULVIA_URL");
    }
    const token = options.environment.ULVIA_TOKEN?.trim();
    if (!token) {
        throw new Error("push requires a CMS Personal Access Token through ULVIA_TOKEN");
    }
    const config: PublicationClientConfig = {
        managementUrl: repositoryManagementUrl(flags.cmsUrl),
        token,
        timeoutMs: flags.timeoutMs,
        ...(options.fetch ? { fetch: options.fetch } : {}),
        ...(options.now ? { now: options.now } : {}),
        ...(options.wait ? { wait: options.wait } : {}),
    };
    log(`Push plan: ${targets.length} local release(s)`);
    let published = 0;
    let unchanged = 0;
    for (let index = 0; index < targets.length; index += 1) {
        const record = targets[index]!;
        const candidate = await buildLocalCandidate(local, record);
        const result = await publishLocalCandidate(config, candidate);
        if (result.outcome === "failed") {
            if (result.reason === "rejected" || result.reason === "conflict") {
                await local.recordAdmission(record.kind, record.version, record.digest, {
                    status: "rejected",
                    recordedAt: new Date().toISOString(),
                    ...(result.code ? { code: result.code } : {}),
                });
            }
            const skipped = targets.length - index - 1;
            log(
                `Summary: planned=${targets.length} published=${published} unchanged=${unchanged} failed=1 skipped=${skipped}`,
            );
            throw new Error(failureMessage(record, result));
        }
        await verifyPublicRoundTrip(remote, record, options);
        await local.recordAdmission(record.kind, record.version, record.digest, {
            status: "published",
            recordedAt: new Date().toISOString(),
        });
        if (result.outcome === "published") {
            published += 1;
            log(`PUBLISHED ${coordinate(record)} (${shortDigest(record.digest)}) candidate=${result.candidateId}`);
        } else {
            unchanged += 1;
            log(`UNCHANGED ${coordinate(record)} (${shortDigest(record.digest)})`);
        }
    }
    log(`Summary: planned=${targets.length} published=${published} unchanged=${unchanged} failed=0 skipped=0`);
}

function selectTargets(
    records: readonly LocalPackageRecord[],
    kind: string | undefined,
    version: string | undefined,
    all: boolean,
): readonly LocalPackageRecord[] {
    const local = records.filter((record) => record.source.startsWith("local:"));
    if (all) {
        return orderPushRecords(selectLatestByKind(local));
    }
    const matching = local.filter((record) => record.kind === kind);
    const target = version
        ? matching.find((record) => record.version === version)
        : matching.sort((left, right) => rcompare(left.version, right.version))[0];
    if (!target) {
        throw new Error(
            version
                ? `${kind}@${version} is not a local release; run ulvia release first`
                : `${kind} has no local release; run ulvia release first`,
        );
    }
    return [target];
}

function selectLatestByKind(records: readonly LocalPackageRecord[]): readonly LocalPackageRecord[] {
    const latest = new Map<string, LocalPackageRecord>();
    for (const record of records) {
        const selected = latest.get(record.kind);
        if (!selected || rcompare(record.version, selected.version) < 0) {
            latest.set(record.kind, record);
        }
    }
    return [...latest.values()];
}

async function verifyPublicRoundTrip(
    remote: RemoteIntegrationRepository,
    record: LocalPackageRecord,
    options: Pick<PushCommandOptions, "now" | "wait">,
): Promise<void> {
    const now = options.now ?? Date.now;
    const wait = options.wait ?? ((milliseconds: number) => Bun.sleep(milliseconds));
    const deadline = now() + PUBLIC_ROUND_TRIP_TIMEOUT_MS;
    const maxAttempts = Math.ceil(PUBLIC_ROUND_TRIP_TIMEOUT_MS / PUBLIC_ROUND_TRIP_INTERVAL_MS) + 1;
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
        const published = await remote.pull(record.kind, record.version).catch(() => null);
        if (published?.package.digest === record.digest) {
            return;
        }
        if (now() >= deadline) {
            break;
        }
        await wait(Math.min(PUBLIC_ROUND_TRIP_INTERVAL_MS, Math.max(0, deadline - now())));
    }
    throw new Error(
        `${coordinate(record)} was admitted but the public repository did not return its exact package digest`,
    );
}

function failureMessage(
    record: LocalPackageRecord,
    failure: Extract<PublicationResult, { outcome: "failed" }>,
): string {
    const status = failure.status ? ` status=${failure.status}` : "";
    const code = failure.code ? ` code=${failure.code}` : "";
    const retry = failure.retryAfterSeconds ? ` retry-after=${failure.retryAfterSeconds}` : "";
    return `Push failed for ${coordinate(record)} reason=${failure.reason}${status}${code}${retry}`;
}

function coordinate(record: Pick<LocalPackageRecord, "kind" | "version">): string {
    return `${record.kind}@${record.version}`;
}

function shortDigest(digest: string): string {
    return `sha256:${digest.slice(0, 12)}`;
}
