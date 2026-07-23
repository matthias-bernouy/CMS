import type { UsersRepository } from "@bernouy/cms-auth";
import type { IntegrationInstallationRepository } from "@bernouy/cms-integrations";
import type { ExecutorDeps, SourceRepository } from "@bernouy/cms-sources";

export type NotificationDispatchResult = {
    workerId: string;
    runId: string;
    status: "succeeded" | "failed" | "missing" | "already_running";
    claimed: number;
    sent: number;
    failed: number;
    durationMs: number;
};

export type NotificationLogger = {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
};

export type NotificationDispatchOptions = {
    users: Pick<UsersRepository<string>, "getBySub">;
    installations: IntegrationInstallationRepository;
    sources: SourceRepository;
    deps: ExecutorDeps;
    notificationKind: string;
    emailerKind: string;
    workerId?: string;
    limit?: number;
    logger?: NotificationLogger;
    now?: () => Date;
    randomUUID?: () => string;
};

export type ClaimedNotification = {
    deliveryId: string;
    recipientCmsUserId: string;
    templateKey: string;
    idempotencyKey: string;
    context: Record<string, unknown>;
};
