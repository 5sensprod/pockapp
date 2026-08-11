-- server/sql/schema.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- BASE SQL AXEMUSIQUE — catalogue servi au site
-- ═══════════════════════════════════════════════════════════════════════════
-- À exécuter UNE FOIS dans phpMyAdmin sur le mutualisé. Ce fichier n'est pas
-- lu par PHP : il est versionné pour que le schéma en place soit connu.
--
-- La forme des colonnes suit frontend/modules/site/PocketSite-docs/12-contrat-catalogue.md,
-- qui fait autorité.
--
-- ⚠️ LA CLÉ EST `legacy_id`, PAS L'IDENTIFIANT POCKETBASE.
-- Le catalogue PocketBase est rechargé par purge et ses identifiants sont
-- régénérés à chaque fois ; s'en servir ici produirait des doublons silencieux
-- au premier rechargement. Voir §1 du contrat.

SET NAMES utf8mb4;

-- ── Marques ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `ax_brands` (
  `legacy_id`   VARCHAR(64)  NOT NULL,
  `checksum`    CHAR(40)     NOT NULL,
  `name`        VARCHAR(255) NOT NULL,
  `slug`        VARCHAR(255) DEFAULT NULL,
  `description` MEDIUMTEXT   DEFAULT NULL,
  `exported_at` DATETIME     NOT NULL,
  PRIMARY KEY (`legacy_id`),
  KEY `idx_brands_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Catégories ─────────────────────────────────────────────────────────────
-- `parent` n'est PAS une clé étrangère contrainte : les lots arrivent dans un
-- ordre quelconque (§4 du contrat), et un parent peut être écrit après son
-- enfant. L'intégrité de l'arbre est garantie en amont, à la normalisation.
CREATE TABLE IF NOT EXISTS `ax_categories` (
  `legacy_id`   VARCHAR(64)  NOT NULL,
  `checksum`    CHAR(40)     NOT NULL,
  `name`        VARCHAR(255) NOT NULL,
  `slug`        VARCHAR(255) DEFAULT NULL,
  `description` MEDIUMTEXT   DEFAULT NULL,
  `parent`      VARCHAR(64)  DEFAULT NULL,
  `is_featured` TINYINT(1)   NOT NULL DEFAULT 0,
  `exported_at` DATETIME     NOT NULL,
  PRIMARY KEY (`legacy_id`),
  KEY `idx_categories_parent` (`parent`),
  KEY `idx_categories_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Produits ───────────────────────────────────────────────────────────────
-- `price_ttc` : l'unité est dans le nom, délibérément (docs/DECISIONS.md).
-- DECIMAL et non FLOAT — un prix ne se stocke pas en binaire flottant.
CREATE TABLE IF NOT EXISTS `ax_products` (
  `legacy_id`   VARCHAR(64)   NOT NULL,
  `checksum`    CHAR(40)      NOT NULL,
  `name`        VARCHAR(512)  NOT NULL,
  `site_title`  VARCHAR(512)  DEFAULT NULL,
  `sku`         VARCHAR(128)  DEFAULT NULL,
  `slug`        VARCHAR(255)  DEFAULT NULL,
  `description` MEDIUMTEXT    DEFAULT NULL,
  `price_ttc`   DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  `tax_rate`    DECIMAL(6,3)  NOT NULL DEFAULT 0.000,
  `stock`       INT           NOT NULL DEFAULT 0,
  `status`      VARCHAR(16)   NOT NULL,
  `brand`       VARCHAR(64)   DEFAULT NULL,
  `exported_at` DATETIME      NOT NULL,
  PRIMARY KEY (`legacy_id`),
  KEY `idx_products_brand` (`brand`),
  KEY `idx_products_slug` (`slug`),
  KEY `idx_products_sku` (`sku`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ── Rattachement produit ↔ catégorie ───────────────────────────────────────
-- Un produit a un ENSEMBLE de catégories, sans catégorie principale
-- (docs/DECISIONS.md, modèle cible). D'où une table de liaison, et non une
-- colonne `category_id` sur le produit.
--
-- La cascade sur `product_legacy_id` est le seul effacement automatique du
-- schéma : réexporter un produit remplace ses rattachements, et un rattachement
-- orphelin n'aurait aucun sens.
CREATE TABLE IF NOT EXISTS `ax_product_categories` (
  `product_legacy_id`  VARCHAR(64) NOT NULL,
  `category_legacy_id` VARCHAR(64) NOT NULL,
  PRIMARY KEY (`product_legacy_id`, `category_legacy_id`),
  KEY `idx_pc_category` (`category_legacy_id`),
  CONSTRAINT `fk_pc_product`
    FOREIGN KEY (`product_legacy_id`) REFERENCES `ax_products` (`legacy_id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
