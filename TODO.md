# TODO — Extension de la CLI : `p9r push`

Étendre la CLI au-delà de l'import de blocs : pousser depuis le filesystem
toute la configuration d'un site (pages, snippets, templates, system).

## Contexte

Aujourd'hui :
- Le client final édite via l'UI visuelle dans le navigateur (workflow simple)
- Le dev pousse uniquement les blocs via `p9r import` (compilés Bun.build)

But : permettre au dev de scaffold/restaurer/migrer un site complet depuis
un dossier versionné en git, sans casser la simplicité de l'UI pour le client.

## Décisions de design (déjà actées)

- **Scope** : pages, snippets, templates, system (pas de "layouts" séparé).
- **Conflits** : push protège le remote par défaut. `--force` bypass.
  Réglable globalement via un flag `forcePushDefault: true` dans la config CLI
  pour les workflows solo-dev.
- **Ordre de push** : `system` → `blocs` → `snippets` → `templates` → `pages`.
  Validation serveur : reject si une page référence un bloc/snippet absent.
- **Tenant** : la CLI scope un seul tenant via `P9R_URL` (déjà le cas).
- **Récap pré-push** : afficher tenant cible + comptage par type +
  status individuel (`new` / `update` / `conflict` / `unchanged`) +
  confirmation `[y/N]` sauf si `--yes`.
- **Renommage** : `p9r push` remplace progressivement `p9r import`. Garder
  `import` comme alias deprecated pour compat.

## Format on-disk

```
site/
  blocs/                    # arbo actuelle — inchangée
    button/
      manifest.json
      Bloc.ts
      ...
  snippets/
    header.html             # filename = identifier
    footer.html
  templates/
    cta-section.html
    cta-section.meta.json   # { category, name }
  pages/
    index.html              # frontmatter YAML en tête
    about.html
    blog/post-1.html
  system.json               # site config (name, theme, favicon, host, language, notFound, serverError)
  .p9r-state.json           # hashes/timestamps remote dernier-pull — gitignore
```

Frontmatter pages :
```yaml
---
title: "About us"
description: "Our story"
visible: true
tags: ["public"]
---
<bloc-card>...</bloc-card>
```

## État local de synchronisation

`.p9r-state.json` (gitignored) :
```json
{
  "tenant": "<id>",
  "lastPulled": "2026-05-06T12:00:00Z",
  "entities": {
    "page:/about":      { "hash": "abc...", "lastSeenRemote": "..." },
    "snippet:header":   { "hash": "def..." },
    "system":           { "hash": "ghi..." }
  }
}
```

À chaque pull/push, on met à jour les hashes. Au push suivant, on compare
le hash local au hash remote actuel. Si remote != lastSeenRemote → conflit.

## Découpage en PRs

### PR 1 — Push pages

**Contenu**
1. Format frontmatter + parser (`gray-matter` ou simple regex YAML).
2. Walker `pages/` + load des fichiers.
3. Hash content (sha256) pour détection diff.
4. `.p9r-state.json` read/write helpers.
5. Récap interactif (tenant + table d'entités + confirm).
6. Endpoint server existant : `PUT /api/page` (déjà OK), accepte path/content/title/description/visible/tags.
7. CLI : `p9r push --type=pages` (default `--type=*`).
8. Tests unitaires : parser frontmatter, hash compare, conflict detection.

**Fichiers à toucher**
- `packages/cms/src/cli/CLI_push.ts` — nouvelle entrée
- `packages/cms/src/cli/dev-server/scan-site.ts` — walker du dossier site/
- `packages/cms/src/cli/push/{state,frontmatter,recap,pushPages}.ts`
- `packages/cms/src/cli/index.ts` — wire la commande
- `packages/cms/package.json` — bin entry si besoin

**Risque** : attributs éphémères (`p9r-is-creating`, `contenteditable`, etc.)
qui traînent dans le HTML sauvegardé. À nettoyer côté CLI avant push (regex
sur les attributs `p9r-*` runtime — garder uniquement `p9r-persistent-identifier`).

### PR 2 — Push snippets + templates

Réutilise l'infra de PR 1.
- Endpoints : `PUT /api/snippet`, `PUT /api/template` (existent).
- Validation serveur : reject si content référence un bloc absent (introduit en PR 4).
- Templates : meta sidecar JSON `<name>.meta.json` pour la catégorie.

### PR 3 — Push system

- Endpoint : voir `src/control/api/system/*` — sans doute déjà un PUT.
- `system.json` schema : `{ site: { name, favicon: "media:<id>", host, language, theme, notFound, serverError }, editor: { layoutCategory } }`.
- Référence favicon : `media:<id>` ou URL absolue. À cadrer.

### PR 4 — Validation serveur cross-référence

Ajouter dans les endpoints PUT :
- `page.put.ts` : parser le content, extraire les `<bloc-tag>` et `<w13c-snippet identifier="…">`, vérifier que chaque ref existe dans le repo. Rejet 400 sinon.
- `snippet.put.ts` : pareil pour les blocs référencés.

Réutilise `validateBloc.ts` ? Plutôt créer `validatePageContent` séparé.
Tests : push d'une page qui référence un bloc fantôme → 400.

### PR 5 — `p9r pull` + `p9r diff` + `p9r status`

Lecture seule, sans risque.
- `pull` : récupère l'état remote dans `site/`. Confirmation si overwrite local.
- `diff` : montre ce que push ferait. Pas d'effet.
- `status` : table des entités modifiées (local vs remote).

Endpoints GET existent déjà pour la plupart (`/api/page/list`, `/api/snippet/list`, etc.).

### PR 6 (optionnel) — Nettoyage attrs éphémères + media URLs

- Côté CLI : strip `p9r-identifier`, `p9r-parent-identifier`, `p9r-is-editor`, `contenteditable`, `tabindex` avant push.
- Côté serveur : sanitize side-pass dans `sanitizePageContent` (déjà juste un check de longueur).
- Media URLs : warn quand le HTML poussé contient une URL d'un autre bucket que celui du tenant cible. Pas de re-write automatique en v1.

## Ordre de réalisation suggéré

PR 1 → PR 2 → PR 4 (validation cross-ref a besoin du push pages/snippets pour être testable)
→ PR 3 → PR 5 → PR 6.

PR 1 + 2 + 4 forment le MVP utilisable. 3 + 5 + 6 enrichissent l'UX.

## Avant de démarrer

À cadrer en début de PR 1 :
- Choix du parser frontmatter (`gray-matter` ajoute une dépendance — alternative : parser YAML maison ~30 lignes).
- Choix du format de la confirmation interactive (Bun a `prompt()` ou utiliser `readline`).
- Convention du dossier racine : `site/` à la racine du repo, ou config via `p9r.config.json` qui pointe vers le dossier ?

## Hors scope (à voir plus tard)

- Push multi-tenant en une commande
- Migrations (changement de schéma entre versions)
- Rollback automatique
- Webhooks / CI integration
- Push de blocs précompilés (sans rebuild) — actuellement chaque push rebuild
