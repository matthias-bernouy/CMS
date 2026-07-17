import {
    makeEndpointUrn,
    makeSourceUrn,
    type Source,
} from "@bernouy/cms-sources";
import {
    boolean,
    computedUserHeader,
    object,
    text,
    userId,
} from "./shapes";

export function accountsSource(): Source {
    return {
        urn: makeSourceUrn("accounts"),
        endpoints: [{
            urn: makeEndpointUrn("accounts", "getAccountByUserId"),
            method: "GET",
            targetUrl: "https://accounts.test/account",
            headers: computedUserHeader("x-user-id"),
            input: {
                params: [{
                    name: "userId",
                    in: "query",
                    required: true,
                    schema: userId(),
                }],
            },
            output: [{ status: "200", body: {
                ...object({
                    exists: boolean(),
                    userId: userId(),
                    phone: text(true),
                    givenName: text(true),
                    surname: text(true),
                    birthDate: text(true),
                    addressLine1: text(true),
                    addressLine2: text(true),
                    addressLine3: text(true),
                    postalCode: text(true),
                    city: text(true),
                    region: text(true),
                    countryCode: text(true),
                    avatarUrl: text(true),
                    avatarFileId: text(true),
                    locale: text(true),
                    timezone: text(true),
                    createdAt: text(true),
                    updatedAt: text(true),
                }),
                required: ["exists", "userId"],
            } }],
        }],
    };
}
