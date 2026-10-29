import type { EncryptedSecretDocument } from "@bernouy/secret-store/mongo";
import type { ProviderInstanceDocument } from "../../instances/MongoProviderInstanceRegistry";
import type { CredentialDocument } from "../MongoInstanceCredentialStore";
import type { AuthenticationSelector } from "./InstanceAuthenticationReader";

export type AuthenticationDocument = CredentialDocument & {
    secret: EncryptedSecretDocument;
    instance: ProviderInstanceDocument;
};

export function authenticationPipeline(selector: AuthenticationSelector) {
    return [
        { $match: { [selector.field]: selector.value, enabled: true } },
        {
            $lookup: {
                from: "ulvia_provider_secrets",
                localField: "secretKey",
                foreignField: "_id",
                as: "secret",
            },
        },
        { $unwind: "$secret" },
        {
            $lookup: {
                from: "ulvia_provider_instances",
                localField: "instanceId",
                foreignField: "id",
                pipeline: [{ $match: { status: "ready" } }],
                as: "instance",
            },
        },
        { $unwind: "$instance" },
        { $limit: 2 },
    ];
}
