import { ClientFailure } from "../../../../harness/clients/failure";
import { assertCondition } from "../../../queries/types";
import { oauthDocument, oauthSuccess } from "../protocol";
import type { AccessReadContext, OwnedAccount } from "../../advanced/context";

/** Preparation observes the unchanged 32/minute public OAuth window; timed reads never retry. */
export function oauthReadClient(
    call: AccessReadContext["call"],
    sleep: (milliseconds: number) => Promise<unknown> = Bun.sleep,
    now = Date.now,
) {
    let waited = 0;
    const deadline = now() + 360_000;
    const document = (
        actor: OwnedAccount,
        capability: string,
        input: Readonly<Record<string, unknown>>,
        assert: (output: unknown) => unknown = oauthSuccess,
    ) =>
        call(capability, { requestJson: JSON.stringify(input) }, assert, { httpCredentials: { cookie: actor.cookie } });
    const checked = async (actor: OwnedAccount, capability: string, input: Readonly<Record<string, unknown>>) => {
        const result = await document(actor, capability, input);
        assertCondition(result.observation.validated, `oauth-read-${capability}-failed`);
        return oauthSuccess(result.output);
    };
    return {
        document,
        checked,
        async preparation(actor: OwnedAccount, capability: string, input: Readonly<Record<string, unknown>>) {
            assertCondition(["register-mcp-client", "prepare-mcp-authorization"].includes(capability));
            for (let attempt = 0; attempt < 2; attempt++) {
                assertCondition(now() <= deadline, "oauth-read-preparation-deadline");
                const result = await document(actor, capability, input, oauthDocument);
                assertCondition(result.observation.validated, "oauth-read-preparation-envelope");
                const output = oauthDocument(result.output);
                if (!Object.hasOwn(output, "error")) {
                    return output;
                }
                if (attempt !== 0 || output.error !== "temporarily_unavailable" || output.status !== 429) {
                    throw new ClientFailure("oauth-read-preparation-refused");
                }
                waited += 60_050;
                assertCondition(waited <= 5 * 60_050 && now() + 60_050 <= deadline, "oauth-read-window-budget");
                // Keep individual waits short; the background assessment remains observable to its controller.
                console.log("OAuth read fixture: waiting for the unchanged public rate-limit window");
                for (let remaining = 60_050; remaining > 0; remaining -= 10_000) {
                    await sleep(Math.min(10_000, remaining));
                }
            }
            throw new ClientFailure("oauth-read-preparation-incomplete");
        },
    };
}

export type OAuthReadClient = ReturnType<typeof oauthReadClient>;
