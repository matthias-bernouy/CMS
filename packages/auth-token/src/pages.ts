import type { Subject } from "@bernouy/core";
import { escapeHtml } from "@bernouy/core";
import type { ApiToken } from "./interfaces/ApiTokenRepository";

const BASE_STYLE = `
    body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
    h1 { margin-bottom: 0.25rem; }
    .muted { color: #666; font-size: 0.9rem; }
    table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
    th, td { text-align: left; padding: 0.5rem 0.75rem; border-bottom: 1px solid #eee; font-size: 0.9rem; }
    th { background: #f7f7f7; }
    form { display: inline; }
    button { padding: 0.4rem 0.9rem; cursor: pointer; border: 1px solid #ccc; background: #fff; border-radius: 4px; }
    button.danger { border-color: #c33; color: #c33; }
    button.primary { background: #2563eb; color: #fff; border-color: #2563eb; }
    input[type=text], input[type=number] { padding: 0.4rem; border: 1px solid #ccc; border-radius: 4px; }
    .card { border: 1px solid #e5e5e5; padding: 1rem; border-radius: 6px; margin: 1rem 0; }
    .warn { background: #fff4e5; border-color: #f5c97f; }
    .status-revoked { color: #999; text-decoration: line-through; }
    .status-expired { color: #b38000; }
    code.token { display: block; font-family: ui-monospace, monospace; padding: 0.75rem; background: #111; color: #fff; border-radius: 4px; word-break: break-all; font-size: 0.9rem; }
`;

export function renderTokensPage(data: {
    subject: Subject<string>;
    tokens: ApiToken<string>[];
    activeCount: number;
    maxTokens: number;
    basePath: string;
    innerLogoutUrl: string;
}): string {
    const { subject, tokens, activeCount, maxTokens, basePath, innerLogoutUrl } = data;
    const displayName = escapeHtml(subject.displayName ?? subject.identifier);
    const role = escapeHtml(subject.role);

    const rows = tokens.length === 0
        ? `<tr><td colspan="6" class="muted">Aucun token pour l'instant.</td></tr>`
        : tokens.map((t) => renderTokenRow(t, basePath)).join("");

    const canCreate = activeCount < maxTokens;
    const createForm = canCreate
        ? `
        <div class="card">
            <h2>Créer un nouveau token</h2>
            <form method="post" action="${escapeHtml(basePath)}/">
                <p>
                    <label>Label <input type="text" name="label" required maxlength="120" placeholder="CI production" /></label>
                </p>
                <p>
                    <label>Expire dans (jours, optionnel) <input type="number" name="ttlDays" min="1" max="3650" placeholder="jamais" /></label>
                </p>
                <button type="submit" class="primary">Générer</button>
            </form>
        </div>`
        : `<div class="card warn">Plafond atteint (${activeCount}/${maxTokens}). Révoque un token pour en créer un nouveau.</div>`;

    return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Mes API tokens</title>
<style>${BASE_STYLE}</style>
</head>
<body>
<h1>API tokens</h1>
<p class="muted">
    Connecté en tant que <strong>${displayName}</strong> (rôle <code>${role}</code>).
    · <a href="${escapeHtml(innerLogoutUrl)}">Se déconnecter</a>
</p>

<h2>Tes tokens (${activeCount} / ${maxTokens} actifs)</h2>
<table>
<thead>
    <tr><th>Label</th><th>Créé</th><th>Dernière utilisation</th><th>Expire</th><th>État</th><th></th></tr>
</thead>
<tbody>
${rows}
</tbody>
</table>

${createForm}
</body>
</html>`;
}

function renderTokenRow(t: ApiToken<string>, basePath: string): string {
    const inactive = t.revokedAt || (t.expiresAt && t.expiresAt.getTime() <= Date.now());
    const status = tokenStatus(t);
    const statusClass =
        t.revokedAt ? "status-revoked" :
        t.expiresAt && t.expiresAt.getTime() <= Date.now() ? "status-expired" :
        "";

    const revokeButton = inactive
        ? ""
        : `<form method="post" action="${escapeHtml(basePath)}/${escapeHtml(t.id)}/revoke" onsubmit="return confirm('Révoquer ce token ?');">
            <button type="submit" class="danger">Révoquer</button>
        </form>`;

    return `<tr class="${statusClass}">
        <td>${escapeHtml(t.label)}</td>
        <td>${formatDate(t.createdAt)}</td>
        <td>${formatDate(t.lastUsedAt)}</td>
        <td>${t.expiresAt ? formatDate(t.expiresAt) : "jamais"}</td>
        <td>${escapeHtml(status)}</td>
        <td>${revokeButton}</td>
    </tr>`;
}

export function renderTokenCreatedPage(data: { raw: string; label: string; basePath: string }): string {
    const { raw, label, basePath } = data;
    return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Token créé</title>
<style>${BASE_STYLE}</style>
</head>
<body>
<h1>Token « ${escapeHtml(label)} » créé</h1>
<div class="card warn">
    <strong>⚠️ Copie ce token maintenant.</strong>
    Une fois cette page fermée, il ne pourra plus jamais être affiché — il faudrait en créer un nouveau.
</div>
<code class="token" id="raw-token">${escapeHtml(raw)}</code>
<p>
    <button type="button" class="primary" onclick="copyToken()">Copier dans le presse-papier</button>
    <a href="${escapeHtml(basePath)}"><button type="button">Retour à la liste</button></a>
</p>
<script>
function copyToken() {
    const el = document.getElementById('raw-token');
    navigator.clipboard.writeText(el.textContent).then(() => {
        const btn = event.target;
        const prev = btn.textContent;
        btn.textContent = 'Copié ✓';
        setTimeout(() => btn.textContent = prev, 1500);
    });
}
</script>
</body>
</html>`;
}

export function renderDisabledPage(data: { innerLoginUrl: string; basePath: string }): string {
    const { innerLoginUrl, basePath } = data;
    return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Connexion indisponible</title>
<style>${BASE_STYLE}</style>
</head>
<body>
<h1>Provider bearer uniquement</h1>
<div class="card">
    Ce provider d'authentification ne permet pas de se connecter via l'interface.
    Pour gérer tes API tokens, connecte-toi d'abord avec ton compte principal, puis
    va sur <code>${escapeHtml(basePath)}</code>.
</div>
<p><a href="${escapeHtml(innerLoginUrl)}"><button type="button" class="primary">Se connecter avec le compte principal</button></a></p>
</body>
</html>`;
}

export function renderErrorPage(data: { basePath: string; message: string }): string {
    return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8" />
<title>Erreur</title>
<style>${BASE_STYLE}</style>
</head>
<body>
<h1>Oups</h1>
<div class="card warn">${escapeHtml(data.message)}</div>
<p><a href="${escapeHtml(data.basePath)}"><button type="button">Retour</button></a></p>
</body>
</html>`;
}

// ── helpers ──────────────────────────────────────────────────────────────

function formatDate(d: Date | undefined): string {
    if (!d) return "—";
    return d.toISOString().replace("T", " ").slice(0, 16);
}

function tokenStatus(t: ApiToken<string>): string {
    if (t.revokedAt) return "Révoqué";
    if (t.expiresAt && t.expiresAt.getTime() <= Date.now()) return "Expiré";
    return "Actif";
}
