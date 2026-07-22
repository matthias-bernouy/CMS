import { RowPersistence } from "./persistence/rows";
import { fetchStripeConnectMock } from "./postgrest/fetch";

export class StripeConnectMock extends RowPersistence {
    async fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
        return await fetchStripeConnectMock(this, input, init);
    }
}
