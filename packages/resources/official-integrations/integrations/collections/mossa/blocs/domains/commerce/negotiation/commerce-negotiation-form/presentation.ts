type ObjectValue = Record<string, unknown>;

export type ProposalPolicy = {
    offerId: number;
    referenceAmount: number;
    minimumAmount: number;
    maximumAmount: number;
    currency: string;
    wholeUnitPrices: boolean;
};

export const negotiationCopy: Record<string, string> = {
    "amount-hint": "Enter an amount within the displayed range.",
    "amount-label": "Your price (€)",
    "button-label": "Submit my proposal",
    "current-label": "Current price",
    "error-message": "The terms for this offer could not be loaded.",
    "existing-message": "You already submitted a proposal of {amount} for this offer.",
    "message-hint": "You may explain your proposal.",
    "message-label": "Message to seller (optional)",
    "message-placeholder": "Hello, would you accept my proposal?",
    "own-offer-message": "You cannot submit a proposal on your own offer.",
    "range-label": "Allowed proposal",
    "sign-in-message": "Sign in to submit a proposal for this offer.",
    "sign-in-title": "Sign in to make a proposal",
    "success-message": "Your proposal was submitted.",
    title: "Make a proposal",
    unavailable: "This offer is not available for proposals.",
};

export function negotiationPresentation(host: HTMLElement, policyValue: unknown, proposalsValue: unknown) {
    const policy = readPolicy(policyValue);
    const proposal = objectValues(objectValue(proposalsValue)?.items)[0];
    const eligible = policy && policy.enabled && policy.canPropose;
    const existingAmount = safeAmount(proposal?.proposedAmount);
    const existingCurrency = currency(proposal?.currency) || policy?.currency || "USD";
    return {
        amountHint: text(host, "amount-hint"),
        amountLabel: text(host, "amount-label"),
        appearance: host.getAttribute("appearance") || "plain",
        buttonLabel: text(host, "button-label"),
        canSubmit: Boolean(eligible && !proposal),
        copy: host.getAttribute("copy") || "Propose a price to the seller within the allowed range.",
        currentLabel: text(host, "current-label"),
        currentPrice: policy
            ? formatMoney(policy.referenceAmount, policy.currency, locale(host), policy.wholeUnitPrices)
            : "—",
        density: host.getAttribute("density") || "regular",
        errorMessage: text(host, "error-message"),
        existing: Boolean(proposal),
        existingMessage:
            proposal && existingAmount !== null
                ? text(host, "existing-message").replaceAll(
                      "{amount}",
                      formatMoney(existingAmount, existingCurrency, locale(host), policy?.wholeUnitPrices),
                  )
                : "",
        maximum: policy ? decimalAmount(policy.maximumAmount, policy.wholeUnitPrices) : "",
        messageHint: text(host, "message-hint"),
        messageLabel: text(host, "message-label"),
        messagePlaceholder: text(host, "message-placeholder"),
        minimum: policy ? decimalAmount(policy.minimumAmount, policy.wholeUnitPrices) : "",
        offerId: policy?.offerId || "",
        range: policy
            ? `${formatMoney(policy.minimumAmount, policy.currency, locale(host), policy.wholeUnitPrices)} – ${formatMoney(policy.maximumAmount, policy.currency, locale(host), policy.wholeUnitPrices)}`
            : "—",
        rangeLabel: text(host, "range-label"),
        showMessage: host.getAttribute("show-message") !== "false",
        signInMessage: text(host, "sign-in-message"),
        signInTitle: text(host, "sign-in-title"),
        step: policy?.wholeUnitPrices ? "1" : "0.01",
        successMessage: text(host, "success-message"),
        title: text(host, "title"),
        unavailable: Boolean(policy && !eligible),
        unavailableMessage:
            policy?.ineligibilityReason === "own_offer"
                ? text(host, "own-offer-message")
                : host.getAttribute("unavailable-message") || text(host, "unavailable"),
    };
}

export function readPolicy(
    value: unknown,
): (ProposalPolicy & { enabled: boolean; canPropose: boolean; ineligibilityReason: string }) | null {
    const source = objectValue(value);
    const policy = {
        offerId: positiveInteger(source?.offerId),
        referenceAmount: safeAmount(source?.referenceAmount),
        minimumAmount: safeAmount(source?.minimumAmount),
        maximumAmount: safeAmount(source?.maximumAmount),
        currency: currency(source?.currency),
        wholeUnitPrices: source?.wholeUnitPrices === true,
        enabled: source?.enabled !== false,
        canPropose: source?.canPropose !== false,
        ineligibilityReason: String(source?.ineligibilityReason || ""),
    };
    return policy.offerId &&
        policy.referenceAmount !== null &&
        policy.minimumAmount !== null &&
        policy.maximumAmount !== null &&
        policy.currency &&
        policy.minimumAmount <= policy.maximumAmount
        ? (policy as ProposalPolicy & { enabled: boolean; canPropose: boolean; ineligibilityReason: string })
        : null;
}

export function minorUnits(value: unknown): number | null {
    const amount = String(value ?? "")
        .trim()
        .replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(amount)) {
        return null;
    }
    const minor = Math.round(Number(amount) * 100);
    return Number.isSafeInteger(minor) ? minor : null;
}

function decimalAmount(value: number, wholeUnits = false): string {
    return wholeUnits ? String(value / 100) : (value / 100).toFixed(2);
}

function formatMoney(amount: number, code: string, language: string, wholeUnits = false): string {
    try {
        return new Intl.NumberFormat(language, {
            style: "currency",
            currency: code.toUpperCase(),
            minimumFractionDigits: wholeUnits ? 0 : undefined,
            maximumFractionDigits: wholeUnits ? 0 : undefined,
        }).format(amount / 100);
    } catch {
        return `${decimalAmount(amount, wholeUnits)} ${code.toUpperCase()}`;
    }
}

function text(host: HTMLElement, name: string): string {
    return host.getAttribute(name)?.trim() || negotiationCopy[name] || "";
}

function locale(host: HTMLElement): string {
    return host.ownerDocument.documentElement.lang || host.ownerDocument.defaultView?.navigator.language || "en-US";
}

function positiveInteger(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeAmount(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function currency(value: unknown): string | null {
    const code = String(value || "");
    return /^[a-z]{3}$/i.test(code) ? code.toUpperCase() : null;
}

function objectValue(value: unknown): ObjectValue | null {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as ObjectValue) : null;
}

function objectValues(value: unknown): ObjectValue[] {
    return Array.isArray(value) ? value.map(objectValue).filter((item): item is ObjectValue => item !== null) : [];
}
