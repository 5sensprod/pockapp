-- server/sql/promo-stock-b.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Le prix promo, sa période, et le Stock B d'un produit
-- ═══════════════════════════════════════════════════════════════════════════
-- Écrit le 11 septembre 2026. À passer UNE FOIS sur la base du mutualisé,
-- AVANT de déposer les versions de `products-sync.php` et `catalog.php` qui
-- les portent — et `server/lib/promo.php`, qu'elles incluent toutes deux.
-- Ce fichier n'est pas lu par PHP : il est versionné pour que le schéma en
-- place soit connu.
--
-- Contrat : frontend/modules/site/PocketSite-docs/12-contrat-catalogue.md,
-- §4.1 ter, qui fait autorité.
--
-- ─── NULL VEUT DIRE « AUCUN » ───────────────────────────────────────────
-- Contrairement à `sale_state`, où la chaîne vide EST une valeur, ici
-- l'absence est le cas ordinaire et NULL la dit sans ambiguïté : pas de prix
-- promo, pas de borne de période, pas de prix B. PocketApp n'envoie d'ailleurs
-- ces clés que lorsqu'elles portent une valeur, pour ne pas changer l'empreinte
-- des produits qui n'en ont pas (§4.1 ter).
--
-- `stock_b` fait exception, `NOT NULL DEFAULT 0` comme `stock` : une quantité
-- absente est une quantité nulle.
--
-- Les 2563 lignes déjà en base prennent NULL et 0 immédiatement, ce qui est
-- leur état exact : aucun produit n'avait de promo chiffrée ni de Stock B en
-- ligne avant ce jour. Aucun rattrapage.
--
-- ─── DATE, ET NON DATETIME ───────────────────────────────────────────────
-- Une période de promo est faite de JOURS, bornes incluses, jugés à Paris
-- (`server/lib/promo.php`). Un DATETIME ferait resurgir la question du fuseau
-- que PocketApp a précisément évitée en stockant « AAAA-MM-JJ ».
--
-- ─── PAS D'INDEX ─────────────────────────────────────────────────────────
-- Aucune requête ne filtre ni ne trie sur ces colonnes : `catalog.php` les
-- sélectionne et décide en PHP. Même raisonnement que `sale-state.sql`.

ALTER TABLE `ax_products`
  ADD COLUMN `promo_price_ttc`   DECIMAL(10,2) DEFAULT NULL,
  ADD COLUMN `promo_start`       DATE          DEFAULT NULL,
  ADD COLUMN `promo_end`         DATE          DEFAULT NULL,
  ADD COLUMN `stock_b`           INT           NOT NULL DEFAULT 0,
  ADD COLUMN `stock_b_price_ttc` DECIMAL(10,2) DEFAULT NULL;
