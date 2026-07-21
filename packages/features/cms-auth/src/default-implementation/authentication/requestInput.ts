type CredentialsInput = {
    email?: string;
    password?: string;
    returnTo?: string;
};

export async function readCredentials(req: Request): Promise<CredentialsInput> {
    const url = new URL(req.url);
    let returnTo = url.searchParams.get("returnTo") ?? undefined;
    const contentType = req.headers.get("content-type") ?? "";

    if (contentType.includes("application/json")) {
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        return {
            email: typeof body.email === "string" ? body.email : undefined,
            password: typeof body.password === "string" ? body.password : undefined,
            returnTo: typeof body.returnTo === "string" ? body.returnTo : returnTo,
        };
    }

    const form = await req.formData().catch(() => null);
    if (!form) {
        return { returnTo };
    }
    if (form.get("returnTo")) {
        returnTo = String(form.get("returnTo"));
    }
    return {
        email: formString(form.get("email")),
        password: formString(form.get("password")),
        returnTo,
    };
}

export function readBearer(req: Request): string | null {
    const header = req.headers.get("authorization");
    const match = header ? /^Bearer\s+(.+)$/i.exec(header) : null;
    return match?.[1] ?? null;
}

function formString(value: FormDataEntryValue | null): string | undefined {
    return typeof value === "string" && value ? value : undefined;
}
