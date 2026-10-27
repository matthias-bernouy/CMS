import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { gatewayRoute } from "../fixtures";

export async function handlerContract() {
    const query = (await gatewayRoute()).requestedRelease.admission.release;
    const command = (await gatewayRoute({ behavior: { effect: "command", execution: "sync", idempotency: "natural" } }))
        .requestedRelease.admission.release;
    const binary = (await gatewayRoute({ binary: true })).requestedRelease.admission.release;
    const list = query.capabilities[0]!;
    const create = command.capabilities[0]!;
    const file = binary.capabilities[0]!;
    return admitContractRelease({
        ...query,
        capabilities: [
            { ...list, bindings: [{ ...list.bindings[0], method: "QUERY", input: { body: true } }] },
            {
                ...create,
                id: "item.create",
                input: {
                    type: "object",
                    properties: { term: { type: "string", maxLength: 50 }, title: { type: "string", maxLength: 50 } },
                    required: [],
                },
            },
            { ...file, id: "files.read", bindings: [{ ...file.bindings[0], path: "/files/{fileId}" }] },
        ],
    });
}
