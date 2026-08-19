-- server/sql/images.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- MIROIR DES IMAGES — colonnes à ajouter aux tables du catalogue
-- ═══════════════════════════════════════════════════════════════════════════
-- À exécuter UNE FOIS dans phpMyAdmin, sur une base déjà créée par
-- `schema.sql`. Ce fichier n'est pas lu par PHP : il est versionné pour que le
-- schéma en place soit connu.
--
-- Mécanisme : frontend/modules/site/PocketSite-docs/16-conception-images.md,
-- §4. Trois colonnes par table, et pas une de plus — **aucune table d'état de
-- synchronisation** : l'état EST l'inventaire, le doubler créerait une
-- divergence à réconcilier (§5).
--
-- ⚠️ `image_checksum` N'EST PAS le `checksum` d'à côté.
-- `checksum` couvre nom, slug, description, prix, stock et relations (§4.4 du
-- contrat) — rien qui parle d'image. Promouvoir une image ou réordonner une
-- galerie n'écrit aucun de ces champs. Les élargir marquerait les 2563
-- produits « modifiés » et déclencherait un réexport complet du catalogue pour
-- rien. D'où une SECONDE empreinte, à côté :
--
--   image_checksum = SHA-1 de la liste ORDONNÉE des SHA-256 des octets,
--                    principale en tête ; « aucune-image » si l'entité n'en a
--                    aucune — état distinct de NULL, qui veut dire « jamais
--                    envoyé ».
--
-- Le serveur ne la recalcule jamais : il la reçoit et la réémet (§2 du
-- contrat).
--
-- `image_paths` porte la liste ordonnée des chemins relatifs, en JSON —
-- `["brands/pa_x/0.png"]`. **C'est elle qui fait foi pour le site**, pas le
-- `ls` du répertoire : les rangs devenus inutiles et les extensions
-- abandonnées y restent, inertes et invisibles (§3 de la conception).
--
-- TEXT et non JSON : MySQL 5.7 connaît le type JSON, mais rien ici ne
-- l'interroge en SQL — la liste est lue telle quelle et rendue au site. Un
-- TEXT ne coûte pas de validation à chaque écriture.
--
-- `ax_products` reçoit les mêmes colonnes bien que les produits ne soient PAS
-- encore acceptés par images-sync.php : ajouter une colonne à 2999 lignes plus
-- tard coûte un verrou de table sur un mutualisé, alors qu'ici elle ne coûte
-- rien et reste NULL.

ALTER TABLE `ax_brands`
  ADD COLUMN `image_checksum`     VARCHAR(64) DEFAULT NULL,
  ADD COLUMN `image_paths`        TEXT        DEFAULT NULL,
  ADD COLUMN `images_exported_at` DATETIME    DEFAULT NULL;

ALTER TABLE `ax_categories`
  ADD COLUMN `image_checksum`     VARCHAR(64) DEFAULT NULL,
  ADD COLUMN `image_paths`        TEXT        DEFAULT NULL,
  ADD COLUMN `images_exported_at` DATETIME    DEFAULT NULL;

ALTER TABLE `ax_products`
  ADD COLUMN `image_checksum`     VARCHAR(64) DEFAULT NULL,
  ADD COLUMN `image_paths`        TEXT        DEFAULT NULL,
  ADD COLUMN `images_exported_at` DATETIME    DEFAULT NULL;
