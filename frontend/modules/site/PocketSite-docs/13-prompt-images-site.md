# Prompt de passage de main — les images du catalogue vers axemusique.shop

**Écrit le 19 août 2026.** À donner tel quel à la session qui traitera le §7 du
contrat catalogue — le seul point qu'il déclare explicitement **non couvert**.

---

Tu travailles dans `I:\pockapp`, module `frontend/modules/site` (PocketApp :
Wails, Go + React/TypeScript, PocketBase embarqué ; il pilote le site vitrine
axemusique.shop). Lis d'abord `CLAUDE.md` à la racine — surtout les points 4, 5
et 6 des « points d'entrée réseau » et la section « Contraintes à ne pas
franchir » —, puis
[`12-contrat-catalogue.md`](12-contrat-catalogue.md), qui **fait autorité** sur
ce qui part vers le site, et [`README.md`](README.md) pour l'historique.

## Ta mission, et sa frontière

**Transférer les images des produits vers axemusique.shop, et les servir.**
C'est le §7 du contrat, cité mot pour mot :

> **Les images.** Elles sont des champs fichier PocketBase, servis par un
> serveur local qu'axemusique.shop ne peut pas atteindre. Les transférer est une
> opération distincte — 4665 fichiers, 1,7 Go, à travers un mutualisé — et elle
> n'est pas traitée ici. Aucun champ image ne figure au contrat **tant que ce
> point n'est pas conçu** : en mettre un qui porterait une URL locale
> produirait 2562 images cassées sur le site.

**Ce n'est donc pas une tâche d'implémentation, c'est d'abord une conception.**
La première session produit une décision consignée, pas un transfert.

## L'état mesuré, le 19 août 2026

Lu dans `%LOCALAPPDATA%\PocketReact\pb_data\data.db`, en lecture seule, et sur
le disque :

| Mesure | Valeur |
|---|---|
| produits **publiés** (ceux qui partent au site) | 2562 |
| publiés **avec une image principale** en base | **2411** |
| publiés portant une **URL WordPress** (`wp_image_url`) | **2395** |
| galeries non vides (tout statut) | 747 |
| stockage `pb_data/storage` | **1,7 Go**, 4665 fichiers |

**Le chiffre qui commande tout : 2395 des 2411 images publiées ont déjà une URL
WordPress.** Elles sont donc **déjà en ligne**, dans `wp-content/uploads/` du
site. Il en reste 16 sans URL, et c'est un ordre de grandeur radicalement
différent de « transférer 1,7 Go ».

**Mesure-le toi-même avant de bâtir dessus** : `wp_image_url` peut pointer vers
une image qui n'existe plus, ou vers une taille inadaptée. Une URL en base n'est
pas une image servie.

## Les trois voies, et ce qu'on sait déjà de chacune

1. **Réutiliser `wp_image_url`.** Coût quasi nul, et le contrat gagne un champ
   `image_url` en une ligne. Risque : l'image dépend de la médiathèque
   WordPress, que `CLAUDE.md` interdit de toucher tant qu'elle sert le
   catalogue — c'est une dépendance de plus, pas une de moins, et la refonte
   vise l'inverse. À vérifier : combien de ces 2395 URL répondent en 200 ?
2. **Téléverser les fichiers manquants** vers le mutualisé, puis servir depuis
   `server/`. Il faut alors un point d'entrée d'upload authentifié —
   `server/api/`, en PHP, en `X-API-Key` comme les trois existants — et il
   faudra vivre avec les limites d'un mutualisé : taille de corps, durée
   d'exécution, quota disque. **Aucune n'est connue : mesure-les.**
3. **Un CDN ou un stockage objet tiers.** Sort du périmètre décidé (« pas de
   processus persistant, pas de service tiers » n'est pas écrit tel quel, mais
   l'hébergement mutualisé et l'absence de budget le sont). À écarter
   explicitement plutôt qu'en silence, si tu l'écartes.

## Ce qui est décidé, et ne se rediscute pas

- **`legacy_id` est la clé de l'export**, pas l'identifiant PocketBase (§1 du
  contrat). Une image se rattache à un produit par sa clé stable ;
- **le slug est figé au premier envoi**, le serveur en est gardien (§4.5) ;
- **l'hébergement est un mutualisé PHP/MySQL** : pas de Node, pas de Docker,
  pas de WebSocket serveur, pas de SQLite distant ;
- **une couche anti-bot filtre axemusique.shop avant Apache**, et elle rejette
  l'agent utilisateur par défaut de Go (`Go-http-client/1.1`) : 503 en HTML,
  le PHP n'étant jamais atteint. Tout appel Go vers ce domaine pose un
  `User-Agent` explicite — voir `backend/routes/site_publish_routes.go` ;
- **`wp-admin` et `wp-json` ne se touchent pas** dans le `.htaccess` tant que
  WordPress sert le catalogue et la médiathèque ;
- **aucun champ image n'entre au contrat tant que la conception n'est pas
  faite** : une URL locale donnerait 2562 images cassées.

## Ce que tu ne dois pas faire

- **Ne pas déposer par FTP depuis PocketApp.** Le FTP sert à déposer un script
  PHP, une fois, à la main (`server/README.md`) ;
- **ne pas modifier AppPos** ;
- **ne pas toucher au module `stock`** : il vient d'achever sa migration, et
  ses images sont servies par PocketBase — c'est une autre affaire que le site.

## Contraintes de travail

- Français partout.
- Le code PHP de `server/` **ne s'exécute pas dans PocketApp** : il est
  versionné ici et déposé par FTP. Lis `server/README.md` avant d'y écrire.
- `npx tsc -b`, `pnpm biome check --write` sur ce que tu touches, `pnpm test` ;
  côté Go, `go build ./backend/...`, `go test ./backend/...`, `gofmt`.
- **Distingue ce qui est lu dans le code — chemin et ligne — de ce qui est
  rapporté.** Mesure avant d'affirmer, et dis sur quelle base.
- **Perdre le fil vaut mieux que deviner** : le dire.

## Avant de commencer

**Mesure d'abord les 2395 URL WordPress** — combien répondent, en quelle taille,
en quel format. Cette seule mesure peut faire passer la mission de « transférer
1,7 Go à travers un mutualisé » à « ajouter un champ au contrat ». Écris ce que
tu trouves, propose une voie, **et arrête-toi** : la décision se consigne dans
`docs/DECISIONS.md` avant que le premier octet ne parte.
