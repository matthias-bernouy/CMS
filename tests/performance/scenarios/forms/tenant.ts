import { connectBrowser } from "../../../integration/instance/oauth";
import { formsCandidate, selectForms } from "../../../integration/instance/forms/selection";
import { scenarioClient } from "../../harness/clients/session";
import { assertCondition, requireRecord } from "../queries/types";
import type { CapabilityInventory } from "../../capabilities/types";
import type { FreshTenant } from "../installations/fresh";

export async function formsTenant(inventory: CapabilityInventory, fresh: FreshTenant, binding: string, select = true) {
    const candidate = await formsCandidate(fresh.site.url, fresh.session.cookie);
    if (select) {
        await selectForms(fresh.site.url, fresh.session.cookie);
    }
    const connection = binding === "mcp" ? await connectBrowser(fresh.site.url, fresh.site.administrator) : undefined;
    await connection?.browser.close();
    const client = scenarioClient(inventory, {
        ...fresh.session,
        token: connection?.token.access_token ?? "",
        tools: connection?.tools ?? [],
    });
    const call = async (capability: string, input: Readonly<Record<string, unknown>>, contract = "ulvia/cms.forms") => {
        const result = await client(contract, capability, "http", input);
        assertCondition(result.observation.validated, `forms-fixture-${capability}-${result.observation.status}`);
        return requireRecord(result.output);
    };
    return { candidate, client, call, close: fresh.close };
}
export type FormsTenant = Awaited<ReturnType<typeof formsTenant>>;
