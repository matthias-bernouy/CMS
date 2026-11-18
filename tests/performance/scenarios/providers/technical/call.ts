import { observeSignedProvider } from "../../../harness/clients/signed";
import type { ClientCall } from "../../../harness/clients/types";

export function callConnection(
    call: ClientCall,
    account: Readonly<{ instanceId: string; secret: string }>,
    connectionId: string,
) {
    return observeSignedProvider(call, { kind: "account", ...account, connectionId });
}
