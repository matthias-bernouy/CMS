import { preparedContractIntent } from "./intent";
import { seedContractRecovery } from "./seed";
import { contractReview, completedUpgrade } from "../oracles";
import { assertCondition } from "../../../queries/types";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertRecoveredReader } from "./readOracle";
import type { UpgradeContext } from "../context";
import type { PreparedSample } from "../../../../harness/execution/samples";

/** A durable reviewed intent models a crash; the real public resume operation changes the primed reader's same key. */
export async function prepareRecoveredContractRead(
    context: UpgradeContext,
    capability: string,
    binding: string,
): Promise<PreparedSample> {
    let upgradeId: string | undefined;
    const resume = () =>
        context.apply({ upgradeId }, "http", crypto.randomUUID(), undefined, "resume-contract-upgrade");
    const close = async () => {
        try {
            if (upgradeId) {
                const saved = await context.read("get-contract-upgrade", { upgradeId });
                if (["prepared", "applying"].includes(String(saved.status))) {
                    assertCondition((await resume()).observation.validated, "recovery-read-cleanup-resume");
                }
            }
        } finally {
            await context.close();
        }
    };
    try {
        const review = contractReview(
            await context.plan(context.original.selections, context.targetGrants),
            context.original.selections,
            context.targetGrants,
        );
        const intent = await preparedContractIntent(context.original, review);
        upgradeId = intent.id;
        await seedContractRecovery(context, intent);
        const input = capability === "get-site-upgrade-status" ? {} : { upgradeId };
        const expected = {
            id: intent.id,
            kind: "contracts" as const,
            revision: intent.expectedRevision,
            createdAt: intent.createdAt,
        };
        const primed = await context.state.client("ulvia/cms.installations", capability, binding, input, (output) =>
            assertRecoveredReader(output, capability, expected, false),
        );
        assertCondition(primed.observation.validated, "recovery-read-prepared-prime");
        const resumed = await resume();
        assertCondition(resumed.observation.validated, "recovery-read-completed-resume");
        completedUpgrade(resumed.output, intent.expectedRevision + 1, intent.id);
        const before = canonicalizeIJson(await context.snapshot());
        return {
            async send() {
                return (
                    await context.state.client("ulvia/cms.installations", capability, binding, input, (output) =>
                        assertRecoveredReader(output, capability, expected, true),
                    )
                ).observation;
            },
            async verify() {
                const foreign = await context.state.client(
                    "ulvia/cms.installations",
                    capability,
                    "http",
                    input,
                    undefined,
                    { httpCredentials: { cookie: context.environment.main.cookie } },
                );
                assertCondition(
                    !foreign.observation.validated && [401, 403].includes(foreign.observation.status),
                    "recovery-read-foreign-session",
                );
                if (capability === "get-contract-upgrade") {
                    const missing = await context.state.client("ulvia/cms.installations", capability, "http", {
                        upgradeId: `sha256:${"0".repeat(64)}`,
                    });
                    assertCondition(
                        !missing.observation.validated && missing.observation.status === 404,
                        "recovery-read-missing-intent",
                    );
                }
                assertCondition(
                    canonicalizeIJson(await context.snapshot()) === before,
                    "recovery-read-refusal-preserves-state",
                );
                assertRecoveredReader(await context.read(capability, input), capability, expected, true);
            },
            close,
        };
    } catch (error) {
        await close();
        throw error;
    }
}
