export class SourceImageSingleFlight<T> {
    private readonly inFlight = new Map<string, Promise<T>>();

    run(key: string, operation: () => Promise<T>): { promise: Promise<T>; joined: boolean } {
        const active = this.inFlight.get(key);
        if (active) {
            return { promise: active, joined: true };
        }
        const promise = Promise.resolve()
            .then(operation)
            .finally(() => {
                if (this.inFlight.get(key) === promise) {
                    this.inFlight.delete(key);
                }
            });
        this.inFlight.set(key, promise);
        return { promise, joined: false };
    }

    get size(): number {
        return this.inFlight.size;
    }
}

type Waiter = {
    resolve: (release: (() => void) | null) => void;
    timer: ReturnType<typeof setTimeout>;
};

export class SourceImageSemaphore {
    private active = 0;
    private readonly waiting: Waiter[] = [];

    constructor(
        readonly limit = 2,
        private readonly maxQueue = 32,
    ) {
        if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(maxQueue) || maxQueue < 0) {
            throw new TypeError("invalid source image semaphore limits");
        }
    }

    acquire(timeoutMs: number): Promise<(() => void) | null> {
        if (this.active < this.limit) {
            this.active += 1;
            return Promise.resolve(this.releaseOnce());
        }
        if (this.waiting.length >= this.maxQueue || timeoutMs <= 0) {
            return Promise.resolve(null);
        }
        return new Promise((resolve) => {
            const waiter: Waiter = {
                resolve,
                timer: setTimeout(() => {
                    const index = this.waiting.indexOf(waiter);
                    if (index >= 0) {
                        this.waiting.splice(index, 1);
                    }
                    resolve(null);
                }, timeoutMs),
            };
            this.waiting.push(waiter);
        });
    }

    get activeCount(): number {
        return this.active;
    }

    get waitingCount(): number {
        return this.waiting.length;
    }

    private releaseOnce(): () => void {
        let released = false;
        return () => {
            if (released) {
                return;
            }
            released = true;
            const waiter = this.waiting.shift();
            if (waiter) {
                clearTimeout(waiter.timer);
                waiter.resolve(this.releaseOnce());
                return;
            }
            this.active -= 1;
        };
    }
}
