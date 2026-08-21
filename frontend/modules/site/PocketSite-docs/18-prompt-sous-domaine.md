# Prompt — servir le nouveau site sur `axe.5sensprod.com`

**Écrit le 20 août 2026.** Version courte. Le détail est dans
[`17-rituel-sous-domaine-test.md`](17-rituel-sous-domaine-test.md) — va le lire
si tu bloques, mais ce qui suit devrait suffire.

---

Tu travailles sur le mutualisé d'axemusique.shop, depuis `I:\pockapp` (où vit
`server/`, versionné mais déposé par FTP) et `I:\divi-child\frontend-wp` (le
bundle React). Lis `CLAUDE.md` à la racine, section « Contraintes à ne pas
franchir ».

## L'objectif

Servir le nouveau build sur **`axe.5sensprod.com`**, pour le tester en réel et
l'auditer avec **Lighthouse**, sans qu'**axemusique.shop** bouge.

Le décor, donné par le propriétaire :

- **même compte d'hébergement**, sous-domaine local ;
- le build va dans un dossier **`frontend/`** de la racine actuelle, celle de
  WordPress ;
- **le sous-domaine pointe sur cette même racine**, pas sur `frontend/` ;
- le site de test lit **l'API PHP et la base SQL existantes**, en relatif ;
- le sous-domaine doit être **`noindex`**.

## Le seul vrai danger

**Un dossier racine, un `.htaccess`, deux domaines.** Une règle sans condition
d'hôte s'applique aussi à la boutique en production. Et une `RewriteCond` ne
vaut que pour la `RewriteRule` qui la suit **immédiatement** : c'est l'erreur
qui ne se voit pas à la relecture.

## Ce que tu fais, dans l'ordre

**1. Relève avant d'écrire.** L'arborescence réelle de la racine, le
`.htaccess` en place, et **vers quel dossier le sous-domaine pointe vraiment**
dans le panneau de l'hébergeur. Le propriétaire dit « la racine » ; vérifie-le.
S'il pointe en fait sur `frontend/`, tout ce ticket devient un `.htaccess`
séparé dans ce dossier, bien plus simple — dis-le plutôt que de compliquer.

[`server/.htaccess`](../../../../server/.htaccess) est la **copie versionnée du
`.htaccess` de production** : lis-la, le motif y est déjà (React servi depuis
`/axemusique-react/`, `/assets/` réécrit, `/server/api` exclu avant WordPress,
`/server/config` interdit). C'est une copie, pas une source : compare-la à ce
qui tourne.

**2. Construis le bundle.** `vite.config.js:5` pose `base: "/"`, donc le build
appelle `/assets/…` à la racine, où WordPress répondra 404. Deux issues :
rebâtir avec `base: "/frontend/"`, ou réécrire `^assets/` vers
`/frontend/assets/` sous condition d'hôte. **Choisis, et dis pourquoi.**
N'oublie pas les autres fichiers du build à la racine : favicon, manifest,
polices.

**3. Écris un bloc unique**, encadré de marqueurs, **posé avant le bloc
WordPress** — jamais dedans, WordPress le regénère. Chaque règle porte sa
condition d'hôte. Le bloc doit être **retirable d'un seul geste** : c'est ton
plan de retour. Ajoute `X-Robots-Tag: noindex, nofollow` pour ce seul hôte.

**Garde une copie horodatée du `.htaccess` avant de déposer.** Une erreur de
syntaxe rend **toute la boutique** en 500.

**4. Vérifie par `curl`, les deux colonnes.**

| Requête | Attendu |
|---|---|
| `axe.5sensprod.com/` | le nouveau `index.html` |
| `axe.5sensprod.com/produit/<slug réel>` | la fiche, pas un 404 |
| `axe.5sensprod.com/assets/<fichier du build>` | 200, `Content-Type` **JavaScript** |
| `axe.5sensprod.com/server/api/catalog.php?action=brands` | **du JSON**, pas la page d'accueil |
| en-têtes de `axe.5sensprod.com/` | `X-Robots-Tag` présent |
| `axemusique.shop/`, `/produit/…`, `/server/api/…`, `/wp-admin/` | **inchangés** |

⚠️ Une couche anti-bot filtre axemusique.shop et rejette
`Go-http-client/1.1` — 503 en HTML. Si tu scriptes, pose un `User-Agent`
explicite, sinon tu accuseras le `.htaccess` à tort.

**5. Lighthouse.** Trois pages au moins — accueil, une catégorie fournie, une
fiche produit avec galerie —, **mobile et desktop**. Consigne les quatre scores
et les métriques qui les portent : LCP, CLS, TBT, poids transféré.

**N'optimise rien dans cette session.** Mesurer et corriger d'un même geste
produit des chiffres qu'on ne peut plus comparer. Le relevé d'abord ; les
corrections seront un ticket qui s'appuiera dessus.

## Interdits

- ne pas toucher à `wp-admin` ni `wp-json` — les EXCLURE de ta règle n'est pas
  y toucher, c'est ce qu'il faut faire ;
- ne pas écrire dans le bloc `# BEGIN WordPress` ;
- ne pas exposer `server/config`, qui porte la clé d'API ;
- pas de FTP depuis PocketApp : c'est un geste manuel (`server/README.md`) ;
- ne pas déposer un `.htaccess` non testé en fin de journée ;
- **si tu modifies le `.htaccess` en ligne, reporte-le dans
  `server/.htaccess`** — sinon la prochaine session lira un fichier périmé.

## Contraintes de travail

- Français partout.
- Distingue ce qui est **lu** — chemin et ligne — de ce qui est **rapporté**.
- **Vérifie en ligne, pas en relisant tes règles.** Apache ne fait pas ce qu'on
  croit avoir écrit.
- Perdre le fil vaut mieux que deviner : le dire.

## Avant de commencer

Écris ce que tu as relevé à l'étape 1 et la forme que tu comptes donner au
bloc. **Puis arrête-toi** : ce fichier-là peut éteindre la boutique.
