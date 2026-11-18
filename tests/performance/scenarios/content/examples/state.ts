import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { operationCompletion } from "../../../harness/clients/operation";
import { collectionTarget } from "../../installations/resources";
import { completedCollectionUpgrade } from "../../installations/collection-upgrades/oracles";
import { assertCondition, requireRecord } from "../../queries/types";
import type { ExampleTenant } from "./tenant";
import type { ExampleResource, ExampleProfile } from "./resource/publish";

const CONTRACT = "ulvia/cms.installations";
export type ExamplePorts = Pick<ExampleTenant, "client" | "fixture" | "prepare">;

/** A scenario owns one tenant and advances only its exact admitted collection through real upgrades. */
export function exampleReadState(
    ports: ExamplePorts,
    profile: ExampleProfile,
    resource: (profile: ExampleProfile, patch: number) => Promise<ExampleResource>,
) {
    let current: ExampleResource | undefined;
    let revision = -1;
    let unrelated = "";
    const upgrades: string[] = [];
    const snapshot = async () => {
        assertCondition(current, "example-current-release-missing");
        const installed = await ports.fixture("list-collection-installations");
        const detail = await ports.fixture("get-collection-details", { collectionId: current.id });
        assertCondition(
            installed.revision === revision &&
                detail.revision === revision &&
                detail.digest === current.digest &&
                detail.version === current.version &&
                Array.isArray(installed.items),
            "example-installed-pin-revision",
        );
        const others = installed.items.map(requireRecord).filter((row) => row.collectionId !== current!.id);
        assertCondition(canonicalizeIJson(others) === unrelated, "example-unrelated-installations-changed");
        return { installed, detail };
    };
    const advance = async (patch: number) => {
        assertCondition(current, "example-current-release-missing");
        const next = await resource(profile, patch);
        assertCondition(
            next.id === current.id && next.version !== current.version && next.digest !== current.digest,
            "example-upgrade-coordinates",
        );
        const target = await collectionTarget(ports, next);
        const review = await ports.fixture("plan-collection-upgrade", { targets: [target] });
        assertCondition(
            review.status === "applicable" &&
                review.expectedRevision === revision &&
                review.issueCount === 0 &&
                Array.isArray(review.issues) &&
                review.issues.length === 0 &&
                typeof review.planDigest === "string" &&
                /^sha256:[a-f0-9]{64}$/u.test(review.planDigest) &&
                canonicalizeIJson(review.references) === canonicalizeIJson([target]) &&
                Array.isArray(review.source) &&
                review.source.some((value) => {
                    const row = requireRecord(value);
                    return (
                        row.collectionId === current!.id &&
                        row.version === current!.version &&
                        row.digest === current!.digest
                    );
                }),
            "example-upgrade-review",
        );
        const result = await ports.client(
            CONTRACT,
            "apply-collection-upgrade",
            "http",
            { targets: [target], planDigest: review.planDigest },
            undefined,
            {
                complete: operationCompletion(ports.client, CONTRACT, "get-operation", (operationId) => ({
                    operationId,
                })),
                idempotencyKey: crypto.randomUUID(),
            },
        );
        assertCondition(result.observation.validated, `example-upgrade-${result.observation.failure ?? "invalid"}`);
        const receipt = completedCollectionUpgrade(result.output, revision + 1);
        completedCollectionUpgrade(
            await ports.fixture("get-collection-upgrade", { upgradeId: receipt.upgradeId }),
            revision + 1,
            receipt.upgradeId,
        );
        upgrades.push(String(receipt.upgradeId));
        current = next;
        revision++;
        await snapshot();
    };
    return {
        client: ports.client,
        prepare: ports.prepare,
        snapshot,
        advance,
        upgrades,
        get current() {
            assertCondition(current, "example-current-release-missing");
            return current;
        },
        get revision() {
            return revision;
        },
        async initialize() {
            const deadline = Date.now() + 180_000;
            const first = await resource(profile, 0);
            const target = await collectionTarget(ports, first);
            const before = await ports.fixture("list-collection-installations");
            assertCondition(Array.isArray(before.items), "example-installation-list");
            unrelated = canonicalizeIJson(
                before.items.map(requireRecord).filter((row) => row.collectionId !== first.id),
            );
            const installed = await ports.fixture("install-collection", {
                expectedRevision: before.revision,
                targets: [target],
            });
            assertCondition(installed.revision === Number(before.revision) + 1, "example-installation-receipt");
            revision = Number(installed.revision);
            current = first;
            await snapshot();
            if (profile === "history") {
                for (let patch = 1; patch <= 8; patch++) {
                    assertCondition(Date.now() <= deadline, "example-history-preparation-deadline");
                    await advance(patch);
                }
            }
            assertCondition(Date.now() <= deadline, "example-preparation-deadline");
        },
    };
}

export type ExampleReadState = ReturnType<typeof exampleReadState>;
