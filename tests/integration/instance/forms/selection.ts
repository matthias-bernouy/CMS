import { repositoryApi } from "../repository/client";

/** Select through the existing generic Installations contract, without an operator-only Forms switch. */
export async function formsCandidate(origin: string, cookie: string) {
    const response = await repositoryApi(origin).request(
        "ulvia/cms.installations",
        "/list-provider-installations",
        "GET",
        undefined,
        { cookie },
    );
    if (!response.ok) {
        throw new Error(`Installations discovery failed: ${response.status}`);
    }
    const result = await response.json();
    const route = result.routes.find((item: { contractId: string }) => item.contractId === "ulvia/cms.forms");
    const candidate = route?.options.find((item: { status: string }) => item.status === "ready");
    if (!candidate) {
        throw new Error("Forms is not offered as a ready implementation");
    }
    return candidate.selection as { contractId: string; version: string; digest: string; installationId: string };
}
export async function selectForms(origin: string, cookie: string) {
    const input = await formsCandidate(origin, cookie);
    const response = await repositoryApi(origin).request("ulvia/cms.installations", "/select-contract", "POST", input, {
        cookie,
    });
    if (!response.ok) {
        throw new Error(`Forms selection failed: ${response.status} ${await response.text()}`);
    }
    return response.json();
}
