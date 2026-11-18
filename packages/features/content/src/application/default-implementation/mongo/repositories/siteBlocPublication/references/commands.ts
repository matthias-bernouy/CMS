import type { CommandStartedEvent, MongoClient } from "mongodb";
import { ContentStorageFormatError } from "content/application/core/validation/errors";

type Observation = { sent: boolean };
type Observer = { writes: Map<string, Observation>; started(event: CommandStartedEvent): void };
const observers = new WeakMap<MongoClient, Observer>();

/** One listener per client; correlation contains only technical operation identifiers. */
export function observeReferenceCommand(client: MongoClient, comment: string) {
    if (typeof client.on !== "function") {
        return { known: false, sent: false, close() {} };
    }
    if (!client.options.monitorCommands) {
        throw new ContentStorageFormatError(
            "Content reference writes require a MongoClient constructed with monitorCommands: true",
        );
    }
    let observer = observers.get(client);
    if (!observer) {
        const writes = new Map<string, Observation>();
        observer = {
            writes,
            started: (event) => {
                const observation = writes.get(event.command.comment);
                if (observation) {
                    observation.sent = true;
                }
            },
        };
        observers.set(client, observer);
    }
    if (observer.writes.size >= 256) {
        throw new ContentStorageFormatError("Content storage observation capacity exceeded");
    }
    if (!observer.writes.size) {
        client.on("commandStarted", observer.started);
    }
    const observation = { sent: false };
    observer.writes.set(comment, observation);
    const selected = observer;
    return {
        known: true,
        get sent() {
            return observation.sent;
        },
        close() {
            selected.writes.delete(comment);
            if (!selected.writes.size) {
                client.off("commandStarted", selected.started);
            }
        },
    };
}
