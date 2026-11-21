import { assertCondition, requireRecord } from "../../queries/types";
import type { settingsTenants } from "../../content/settings/tenant";
import type { Variant } from "../../../capabilities/types";
import type { PreparedSample } from "../../../harness/execution/samples";

const alternates = new WeakMap<object, string>();
export async function prepareAccountAssociation(
    lease: Awaited<ReturnType<ReturnType<typeof settingsTenants>>>,
    capability: string,
    variant: Variant,
    binding: string,
): Promise<PreparedSample> {
    const client = lease.value.client;
    const call = async (contract: string, id: string, input: Readonly<Record<string, unknown>>) => {
        const result = await client(contract, id, "http", input);
        assertCondition(result.observation.validated, "account-template-fixture-call-failed");
        return requireRecord(result.output);
    };
    const current = await call("ulvia/cms.access", "get-email-configuration", {});
    const original = requireRecord(current.passwordReset);
    let alternate = alternates.get(lease.value);
    if (!alternate) {
        alternate = crypto.randomUUID();
        const template = await call("ulvia/cms.email-templates", "templates.get", { id: original.id });
        await call("ulvia/cms.email-templates", "templates.create", {
            id: alternate,
            name: "Account variant",
            description: "",
            locale: "en",
            draft: template.draft,
        });
        await call("ulvia/cms.email-templates", "templates.publish", { id: alternate, expectedRevision: 1 });
        alternates.set(lease.value, alternate);
    }
    const target = {
        id: requireRecord(current.emailVerification).id === alternate ? original.id : alternate,
        version: 1,
        source: current.selectedSource,
    };
    const update = {
        expectedRevision: current.revision,
        emailVerification: target,
        passwordReset: current.passwordReset,
    };
    if (variant === "invalidation") {
        await call("ulvia/cms.access", "update-email-configuration", update);
    }
    return {
        send: async () =>
            (
                await client(
                    "ulvia/cms.access",
                    capability,
                    binding,
                    capability === "get-email-configuration" ? {} : update,
                    (output) => {
                        const result = requireRecord(output);
                        assertCondition(Number.isSafeInteger(result.revision));
                        if (capability === "update-email-configuration" || variant === "invalidation") {
                            assertCondition(requireRecord(result.emailVerification).id === target.id);
                        }
                    },
                )
            ).observation,
        close: async () => lease.release(),
    };
}
