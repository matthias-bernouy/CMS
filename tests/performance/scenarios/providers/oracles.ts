import { assertCondition, requireRecord } from "../queries/types";
import { canonicalizeIJson as json } from "@bernouy/ulvia-contracts/protocol";
import type { ProviderPeer } from "./peer";

type PreviewSource = Pick<ProviderPeer, "token" | "endpoint"> &
    Readonly<{
        digest: string;
        report: Pick<ProviderPeer["report"], "providerId" | "account" | "implementations">;
        manifest: Pick<ProviderPeer["manifest"], "name" | "version" | "requires" | "implementations">;
    }>;

export function assertPreview(value: unknown, peer: PreviewSource, reconnecting: boolean) {
    const row = requireRecord(value);
    assertCondition(typeof row.ticket === "string" && row.ticket.length > 0);
    assertCondition(row.operation === (reconnecting ? "reconnect" : "connect"));
    assertCondition(row.providerId === peer.report.providerId && row.accountId === peer.report.account.id);
    assertCondition(
        row.endpoint === peer.endpoint &&
            row.manifestVersion === peer.manifest.version &&
            row.manifestDigest === peer.digest,
    );
    assertCondition(row.providerName === peer.manifest.name && row.accountLabel === peer.report.account.label);
    assertCondition(
        json(row.contracts) ===
            json(
                peer.report.implementations.map(({ contractId, version, status }) => ({ contractId, version, status })),
            ),
    );
    const requests = [...peer.manifest.requires, ...peer.manifest.implementations.flatMap((entry) => entry.requires)];
    assertCondition(json(row.requests) === json(requests));
    assertCondition(typeof row.authorityDigest === "string" && /^sha256:[a-f0-9]{64}$/.test(row.authorityDigest));
    assertCondition(!JSON.stringify(row).includes(peer.token));
    return row;
}

export function assertSelectionUnchanged(
    before: Readonly<Record<string, unknown>>,
    after: Readonly<Record<string, unknown>>,
) {
    assertCondition(
        json(before.selections) === json(after.selections) && before.selectionRevision === after.selectionRevision,
    );
}

/** Route reads may refresh observation revisions after thirty seconds, without changing approved connections. */
export function assertApprovalStateUnchanged(
    before: Readonly<Record<string, unknown>>,
    after: Readonly<Record<string, unknown>>,
) {
    assertSelectionUnchanged(before, after);
    assertCondition(Array.isArray(before.installations) && Array.isArray(after.installations));
    assertCondition(before.installations.length === after.installations.length, "provider-approval-count-changed");
    const old = new Map(
        before.installations.map((value) => {
            const row = requireRecord(value);
            return [row.id, row];
        }),
    );
    const project = (row: Readonly<Record<string, unknown>>) => {
        const { revision: _revision, observedAt: _observedAt, ...approval } = row;
        return approval;
    };
    for (const value of after.installations) {
        const row = requireRecord(value);
        const previous = old.get(row.id);
        assertCondition(
            previous && Number.isSafeInteger(row.revision) && Number(row.revision) >= Number(previous.revision),
            "provider-approval-revision-regressed",
        );
        assertCondition(json(project(row)) === json(project(previous)), "provider-approval-business-state-changed");
        old.delete(row.id);
    }
    assertCondition(old.size === 0, "provider-approval-identities-changed");
}
