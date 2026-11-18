import { catalogueRevision } from "@bernouy/ulvia-contracts/protocol";
import { parseCapabilityGrants, parseContractSelections } from "@bernouy/ulvia-providers/selections";
import { TEST_SITE_ID } from "../../../../fixtures/scope";
import { assertCondition, requireRecord } from "../../../queries/types";
import type { SiteUpgradeIntent } from "@bernouy/repository/upgrades";

/** Model a crash after the reviewed intent was durably prepared, using only the public intent format. */
export async function preparedContractIntent(
    original: Readonly<Record<string, unknown>>,
    reviewed: Readonly<Record<string, unknown>>,
): Promise<SiteUpgradeIntent<unknown>> {
    assertCondition(original.status === "applicable" && reviewed.status === "applicable");
    assertCondition(
        original.expectedRevision === reviewed.expectedRevision && Number.isSafeInteger(reviewed.expectedRevision),
    );
    assertCondition(Array.isArray(original.selections) && Array.isArray(reviewed.selections));
    const scope = (rows: unknown[]) =>
        parseContractSelections(rows.map((value) => ({ ...requireRecord(value), siteId: TEST_SITE_ID })));
    const source = scope(original.selections);
    const selections = scope(reviewed.selections);
    const beforeGrants = parseCapabilityGrants(original.grants);
    const grants = parseCapabilityGrants(reviewed.grants);
    assertCondition((await catalogueRevision(source)) === (await catalogueRevision(selections)));
    assertCondition((await catalogueRevision(beforeGrants)) !== (await catalogueRevision(grants)));
    assertCondition(typeof reviewed.planDigest === "string" && /^sha256:[a-f0-9]{64}$/u.test(reviewed.planDigest));
    const expectedRevision = Number(reviewed.expectedRevision);
    const sourceStateDigest = await catalogueRevision({
        revision: expectedRevision,
        selections: source,
        grants: beforeGrants,
    });
    const targetStateDigest = await catalogueRevision({ revision: expectedRevision + 1, selections, grants });
    assertCondition(sourceStateDigest !== targetStateDigest);
    return {
        id: await catalogueRevision({ siteId: TEST_SITE_ID, kind: "contracts", planDigest: reviewed.planDigest }),
        siteId: TEST_SITE_ID,
        kind: "contracts",
        planDigest: reviewed.planDigest,
        expectedRevision,
        sourceStateDigest,
        targetStateDigest,
        payload: { selections, grants },
        status: "prepared",
        createdAt: new Date().toISOString(),
    };
}
