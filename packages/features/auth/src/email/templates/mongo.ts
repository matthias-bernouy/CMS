import type { Collection, Db } from "mongodb";
import type { AccountEmailConfigurationStore } from "./interfaces";
import type { AccountEmailConfiguration } from "./schemas";
import { accountEmailConfigurationSchema } from "./schemas";
type Stored = AccountEmailConfiguration & { _id: "configuration"; format: "ulvia-account-email-configuration/v1" };
export class MongoAccountEmailConfigurationStore implements AccountEmailConfigurationStore {
    private readonly collection: Collection<Stored>;
    constructor(db: Db) {
        this.collection = db.collection<Stored>("account_email_configuration_v1");
    }
    async read() {
        const record = await this.collection.findOne({ _id: "configuration" }, { maxTimeMS: 2000 });
        if (!record) {
            return null;
        }
        if (record.format !== "ulvia-account-email-configuration/v1") {
            throw new TypeError("Invalid account email configuration format");
        }
        const { _id: _id, format: _format, ...configuration } = record;
        return accountEmailConfigurationSchema.parse(configuration);
    }
    async initialize(value: AccountEmailConfiguration) {
        await this.collection.updateOne(
            { _id: "configuration" },
            {
                $setOnInsert: {
                    ...accountEmailConfigurationSchema.parse(value),
                    format: "ulvia-account-email-configuration/v1",
                },
            },
            { upsert: true, maxTimeMS: 2000 },
        );
    }
    async replace(value: AccountEmailConfiguration, expectedRevision: number) {
        return (
            (
                await this.collection.updateOne(
                    { _id: "configuration", revision: expectedRevision },
                    { $set: accountEmailConfigurationSchema.parse(value) },
                    { maxTimeMS: 2000 },
                )
            ).matchedCount === 1
        );
    }
}
