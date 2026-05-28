# Storage — récap + plan v1

> Source : conversation 2026-05-28. Suite des discussions sur les interfaces de domaine (`.claude/interfaces/resume.md`).
> Statut : **brainstorm fixé**, à transformer en spec à l'implémentation.

---

## 1. Position retenue

Storage est une **dépendance optionnelle du CMS, pas un composant noyau**. Le CMS fonctionne sans aucun backend storage configuré. Seules les *features* qui ont besoin de blobs (upload d'images, file manager, avatars) se désactivent proprement quand rien n'est branché.

**Pas de default implicite.** Un install fresh = `Storage: not configured`. L'admin choisit explicitement.

Backends disponibles en v1 :

| Backend | Statut | Usage attendu |
| --- | --- | --- |
| `Filesystem` (local) | Disponible, **étiqueté "dev only"** | Tests, dev local. Pas pour prod. |
| `S3-compatible` | Cible v1 production | OVH S3, AWS S3, Cloudflare R2, MinIO, Backblaze B2 — tous avec le même adapter. |

## 2. Pourquoi storage *n'est pas* un data-provider en v1

Distinction tirée du brainstorm sur les interfaces (`.claude/interfaces/resume.md`) :

| | mail / paiement | storage |
| --- | --- | --- |
| Le "vendor" est | un service distant avec API métier | un backend où poser des bytes |
| Le SDK pour parler au vendor est | un client HTTP de leur API | une lib in-process (S3 SDK, fs/promises) |
| Doit être un data-provider externe ? | **Oui** | **Non** — driver in-process suffit |

Storage reste un **module local du CMS** avec adapters pluggables. L'interface formelle Couche 2 `storage@1.0` viendra plus tard, si/quand un data-provider externe a besoin de stocker des blobs sans connaître le backend du tenant.

## 3. Ce qui existe déjà

Dans `packages/cms-shared/` :

- `CmsFilesBlobStore` — interface bytes (`put`/`get`/`exists`/`delete` par id).
- `CmsFilesMetadataRepository` — interface metadata (arbo, ids, names).
- `LocalFsCmsFiles` — impl filesystem local (id = path relatif).
- `InMemoryCmsFilesBlob` / `InMemoryCmsFilesMetadata` — pour tests.

Dans `packages/cms-control/src/core/files/` :
- `uploadFile.ts` — metadata-first, blob ensuite, rollback metadata si blob échoue.
- `deleteFileTree.ts`.

Dans `packages/cms-control/src/api/files/` :
- `files.get.ts`, `files.delete.ts`, `files.patch.ts`.

Dans `packages/cms-control/src/static/admin/` :
- `files.html`.

**L'abstraction storage est déjà propre.** Le split metadata/blob est bien posé : metadata reste dans la DB CMS, blobs peuvent migrer où on veut sans toucher au reste.

## 4. Architecture cible v1

### 4.1 Configuration

Settings page **"Storage"** dans l'admin CMS, qui contient :

- État : `not configured` | `configured`.
- Liste de backends configurés (v1 : **un seul actif à la fois** — multi-backend reporté).
- CTA "Add backend" → wizard avec choix `Filesystem` ou `S3-compatible`.

Pour S3 : champs `endpoint` (pour OVH/R2/MinIO), `region`, `bucket`, `accessKeyId`, `secretAccessKey`, optionnellement `pathPrefix`. Champ `secretAccessKey` traité comme `writeOnly` (jamais ré-affiché après save).

Pour Filesystem : champ `rootPath`. Bandeau d'avertissement "Pour dev uniquement — non persistant en prod".

### 4.2 Résolution du backend actif

À l'install / au boot du CMS :

1. Lire la config storage depuis le store de settings du CMS.
2. Si vide → injecter `null` comme `CmsFilesBlobStore` dans la composition root.
3. Si Filesystem → instancier `LocalFsCmsFiles` avec le `rootPath`.
4. Si S3 → instancier `S3CmsFilesBlob` (nouveau, cf. Stage 2) avec la config.

Métadata : reste toujours dans la DB CMS, indépendamment du backend blob. Pas de change.

### 4.3 Gestion du "storage not configured"

Le code consommateur de `CmsFilesBlobStore` doit :

- Accepter une injection `null` sans crasher.
- Exposer un helper `isStorageConfigured(): boolean` pour les vues admin.
- Désactiver proprement les features dépendantes :
  - `POST /api/files` → 503 `{problem: "Storage not configured"}` au lieu de 500.
  - L'admin `files.html` → bandeau "Configure a storage backend to enable file management" + CTA vers settings.
  - Les blocs qui prennent une image en input → champ "image" remplace l'uploader par un message "Configure storage to upload images" (ou accepte une URL externe en attendant).

C'est exactement ce que tu fais aujourd'hui pour un mail backend non configuré : pas de crash, juste la feature off avec un état UI clair.

### 4.4 Upload via proxy — assumé pour v1

Tous les uploads passent par le process CMS (proxy). Limites connues et **non résolues en v1** :

- Bytes tampon en RAM du process CMS.
- Timeout HTTP standard.
- Pas d'upload resumable.
- Pas adapté à des assets >100 MB.

Documenté ("intended for files <100 MB, no resume"), pas résolu. Le contournement (signed URL upload direct vers S3) est noté dans "hors scope" pour le jour où ce sera bloquant.

## 5. Plan d'action incrémental

Respect [[feedback_incremental-commits]] : un commit par stage, review utilisateur entre chaque. Respect [[feedback_per-stage-review-checklist]] : à chaque stage, vérifier simpler / duplication / secure / dead code.

### Stage 0 — Décider (pas de code)

- [ ] Confirmer : storage = optionnel, pas de default implicite. (Position retenue par défaut, à ré-acter explicitement avant Stage 1.)
- [ ] Confirmer : un seul backend actif à la fois en v1 (pas de "media → S3 / docs → FS").
- [ ] Confirmer : S3 + FS sont les deux seuls backends en v1. Pas de GCS, Azure Blob, ni d'OneDrive en v1.
- [ ] Trancher : où est stockée la config storage côté CMS (table dédiée, settings JSON, fichier de conf) ? Probablement dans le même store que les autres settings.

### Stage 1 — Rendre le storage actuel optionnel

- [ ] `CmsFilesBlobStore?` injectable comme `null` dans la composition root.
- [ ] Helper `isStorageConfigured()` exposé aux vues admin.
- [ ] Endpoints `POST/PATCH/DELETE /api/files` retournent 503 `problem+json` quand non configuré.
- [ ] UI `files.html` : bandeau "not configured" + CTA settings.
- [ ] Tests : `uploadFile` sans backend → erreur claire, pas de crash.

**Aucun nouveau backend ajouté à ce stage.** Juste rendre le système tolérant à l'absence.

### Stage 2 — Settings page "Storage"

- [ ] Page `settings/storage.html` (ou intégrée à `settings.html` existant).
- [ ] API `GET /api/settings/storage` → renvoie `{ status, backend?: { type, ...publicFields } }` (jamais le `secretAccessKey`).
- [ ] API `PUT /api/settings/storage` → valide la config, teste la connexion, persiste, hot-reload de la composition root.
- [ ] API `DELETE /api/settings/storage` → unconfigure.
- [ ] UI : wizard "Add backend" avec choix Filesystem / S3.
- [ ] Pour FS : champ `rootPath` + bandeau dev-only.
- [ ] Pour S3 : champs S3 standard, secret en `password` input, test de connexion bouton.

### Stage 3 — Adapter S3-compatible

- [ ] Nouveau fichier `packages/cms-shared/src/S3CmsFilesBlob.ts` (ou équivalent — emplacement à confirmer).
- [ ] Implémente `CmsFilesBlobStore` : `put`, `get`, `exists`, `delete`.
- [ ] Dépend de `@aws-sdk/client-s3` (ou `aws4fetch` plus léger — à choisir).
- [ ] Tests d'intégration avec MinIO local (docker-compose dans `tests/fixtures/`).
- [ ] Test smoke avec creds OVH si dispos (cf. [[project_dev-ovh-s3-creds]] — actuellement AccessDenied côté OVH, à débloquer en parallèle).

### Stage 4 — Wiring et validation end-to-end

- [ ] Boot du CMS lit la config storage, instancie le bon backend.
- [ ] Hot-swap quand la config change via settings (pas besoin de redémarrer).
- [ ] Test e2e : configure FS → upload → switch vers S3 → upload → vérifier que les anciens fichiers FS ne sont plus accessibles (pas de migration auto en v1).
- [ ] Documenter le comportement "pas de migration auto" : changer de backend = repartir de zéro. Migration manuelle = hors scope v1.

### Stage 5 — Polish

- [ ] Messages d'erreur user-friendly côté admin (502 backend down, 503 not configured, quota plein, etc.).
- [ ] Documentation `/docs` : page "Configurer le storage" avec instructions OVH / R2 / MinIO.

## 6. Questions ouvertes

1. **Stockage de la config storage** : table dédiée dans la DB CMS, settings JSON, ou fichier .env ? Probablement la même mécanique que les autres settings — à uniformiser.
2. **Test de connexion S3 à la sauvegarde** : on tente un `HeadBucket` + un `PutObject` test avant de valider ? Confirme rapidement les creds, mais peut polluer le bucket.
3. **Hot-reload du backend** : on swap en mémoire ou on force restart ? Hot-swap est plus user-friendly ; restart est plus simple à raisonner.
4. **Quand storage devient un data-provider Couche 2/3 ?** Reporté. Probablement quand un DP e-commerce externe veut écrire/lire des blobs sans connaître le backend du tenant.

## 7. Hors scope v1

- **Multi-backend simultané** ("media → S3 / documents privés → FS"). Reporté quand cas concret.
- **Upload direct client → S3 via URL signée** (data plane séparé du control plane). Reporté quand >100 MB ou vidéo entrent en jeu.
- **Migration de backend** : changer S3 OVH → S3 AWS et déplacer les fichiers automatiquement. Manuel pour v1.
- **CDN front** : servir les fichiers via un CDN avec cache edge. Le user le mettra devant son S3 lui-même s'il veut.
- **Image transforms** (resize, crop à la volée). Adapter dédié plus tard si besoin.
- **Formalisation `storage@1.0` comme interface Couche 2** : pas en v1. `CmsFilesBlobStore` TS suffit.
- **Quota / rate-limits**. Pas en v1.
- **Versioning de fichiers** (immutable backups). Hors scope.
