import { oauthPreparation } from "../preparation";
import { assertCondition } from "../../../queries/types";
import { oauthDocument, oauthSuccess } from "../protocol";
import type { AccessReadContext, OwnedAccount } from "../../advanced/context";

/** Preparation observes the unchanged 32/minute public OAuth window; timed reads never retry. */
export function oauthReadClient(
    call: AccessReadContext["call"],
    sleep: (milliseconds: number) => Promise<unknown> = Bun.sleep,
    now = Date.now,
) {
    const prepare = oauthPreparation(sleep, now, "read");
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
        preparation(actor: OwnedAccount, capability: string, input: Readonly<Record<string, unknown>>) {
            return prepare(capability, () => document(actor, capability, input, oauthDocument));
        },
    };
}

export type OAuthReadClient = ReturnType<typeof oauthReadClient>;
