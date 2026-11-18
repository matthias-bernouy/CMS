import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { fixturePage } from "../client";
import { assertCondition } from "../../queries/types";
import type { PageClient } from "../client";
import type { PagePreparation } from "./preparation";

/** Refusals and naturally idempotent retries validate state outside the measured invocation. */
export async function verifyPageRefusals(
    client: PageClient,
    capability: string,
    input: Readonly<Record<string, unknown>>,
    result: Readonly<Record<string, unknown>>,
    persisted: Readonly<Record<string, unknown>> | undefined,
    options: PagePreparation,
) {
    if (options.foreign) {
        const foreign = await options.foreign(capability, "http", input);
        assertCondition(
            !foreign.observation.validated && [401, 403].includes(foreign.observation.status),
            "page-scale-foreign-session",
        );
    }
    if (options.invalid) {
        await options.invalid(input);
    }
    if (
        capability !== "pages.create" &&
        capability !== "pages.get" &&
        (options.history || options.contentBytes || options.invalidate)
    ) {
        let staleInput = input;
        if (capability === "pages.rename") {
            const replay = await client(capability, "http", input);
            assertCondition(
                replay.observation.validated &&
                    replay.output &&
                    canonicalizeIJson(replay.output) === canonicalizeIJson(result),
                "page-scale-natural-retry-state",
            );
            staleInput = { ...input, title: "Rejected stale performance title" };
        }
        const stale = await client(capability, "http", staleInput);
        assertCondition(
            !stale.observation.validated && stale.observation.status === (capability === "pages.delete" ? 404 : 409),
            "page-scale-stale-write",
        );
    }
    if ((options.foreign || options.invalid) && capability !== "pages.delete" && result.id) {
        const unchanged = await fixturePage(client, "pages.get", { id: result.id });
        assertCondition(
            persisted && canonicalizeIJson(unchanged) === canonicalizeIJson(persisted),
            "page-scale-refusal-changed-state",
        );
    }
}
