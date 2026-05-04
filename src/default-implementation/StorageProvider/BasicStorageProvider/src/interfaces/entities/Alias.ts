/** A domain points to at most one bucket; a bucket may have many aliases. */
export type Alias = {
    domain: string;
    bucketId: string;
    createdAt: Date;
};
