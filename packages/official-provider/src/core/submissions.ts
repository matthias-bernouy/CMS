export type OfficialSubmission = Readonly<{ id: string; email: string; message: string }>;

export interface OfficialSubmissionStore {
    create(input: Pick<OfficialSubmission, "email" | "message">): Promise<OfficialSubmission>;
    get(id: string): Promise<OfficialSubmission | null>;
}
