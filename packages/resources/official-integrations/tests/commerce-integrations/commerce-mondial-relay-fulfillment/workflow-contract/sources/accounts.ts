import type { SourceEndpoint } from "@bernouy/cms-sources";
import { endpoint, object, string } from "./builders";

export const accountEndpoints: SourceEndpoint[] = [
    endpoint(
        "getAccountByUserId",
        "GET",
        "/getAccountByUserId",
        object({
            givenName: string(),
            surname: string(),
            phone: string(),
            addressLine1: string(),
            addressLine2: string(),
            addressLine3: string(),
            postalCode: string(),
            city: string(),
            countryCode: string(),
        }),
        { userId: { type: "string", semantic: "user-id" } },
    ),
];
