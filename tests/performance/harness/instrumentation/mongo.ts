import { transactionProbe } from "./transactions";
import { record, scope } from "./records";
import { tenantProfiler } from "./mongo-profile";
import type { ProfilingClient } from "./mongo-profile";

type Method = (this: object, ...args: unknown[]) => unknown;
type MongoModule = {
    Collection: { prototype: Record<string, Method> };
    Db: { prototype: Record<string, Method> };
    MongoClient: { prototype: { connect: Method } };
};
type MonitoredClient = ProfilingClient & {
    monitorCommands: boolean;
    on(
        event: "commandStarted",
        listener: (event: {
            requestId: number;
            databaseName: string;
            commandName: string;
            command: Record<string, unknown>;
        }) => void,
    ): void;
    on(
        event: "commandSucceeded" | "commandFailed",
        listener: (event: { requestId: number; databaseName: string; commandName: string; duration: number }) => void,
    ): void;
};

export function instrumentMongo(mongo: MongoModule, currentTrace: () => string | undefined): void {
    const decorate = (prototype: Record<string, Method>, name: string, position: number) => {
        const method = prototype[name];
        if (!method) {
            throw new Error(`Mongo instrumentation method is missing: ${name}`);
        }
        prototype[name] = function (...args) {
            const traceId = scope.getStore()?.traceId ?? currentTrace();
            if (traceId) {
                const previous = args[position];
                const options = previous && typeof previous === "object" ? previous : {};
                args[position] = {
                    ...options,
                    comment: { ulviaPerformanceTrace: traceId, spanId: scope.getStore()?.spanId },
                };
            }
            return method.apply(this, args);
        };
    };
    for (const [name, position] of [
        ["find", 1],
        ["findOne", 1],
        ["aggregate", 1],
        ["countDocuments", 1],
        ["distinct", 2],
        ["insertOne", 1],
        ["insertMany", 1],
        ["updateOne", 2],
        ["updateMany", 2],
        ["deleteOne", 1],
        ["deleteMany", 1],
        ["replaceOne", 2],
        ["bulkWrite", 1],
        ["findOneAndUpdate", 2],
        ["findOneAndReplace", 2],
        ["findOneAndDelete", 1],
        ["createIndex", 1],
        ["createIndexes", 1],
        ["listIndexes", 0],
        ["dropIndex", 1],
        ["dropIndexes", 0],
        ["drop", 0],
        ["estimatedDocumentCount", 0],
    ] as const) {
        decorate(mongo.Collection.prototype, name, position);
    }
    for (const name of ["createCollection", "listCollections"]) {
        decorate(mongo.Db.prototype, name, 1);
    }
    const connected = new WeakSet<object>();
    const configuring = new WeakSet<object>();
    const profile = tenantProfiler(configuring);
    const connect = mongo.MongoClient.prototype.connect;
    mongo.MongoClient.prototype.connect = function (...args) {
        const client = this as MonitoredClient;
        if (!connected.has(this)) {
            connected.add(this);
            client.monitorCommands = true;
            const transactions = transactionProbe(record);
            client.on("commandSucceeded", (event) => transactions.finished(event, "succeeded"));
            client.on("commandFailed", (event) => transactions.finished(event, "failed"));
            client.on("commandStarted", (event) => {
                if (configuring.has(client)) {
                    return;
                }
                const context = {
                    traceId: scope.getStore()?.traceId ?? currentTrace(),
                    spanId: scope.getStore()?.spanId,
                };
                transactions.started(event, context);
                record({
                    kind: "mongo",
                    requestId: event.requestId,
                    database: event.databaseName,
                    traceId: scope.getStore()?.traceId ?? currentTrace(),
                    operation: event.commandName,
                    collection:
                        typeof event.command[event.commandName] === "string"
                            ? event.command[event.commandName]
                            : event.commandName,
                });
            });
        }
        return Promise.resolve(connect.apply(this, args)).then(async (value) => {
            await profile(client);
            return value;
        });
    };
    record({ kind: "instrumentation", component: "mongo" });
}
