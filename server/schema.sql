-- =============================================================================
-- Couche distante — schéma MySQL de l'option C
--
-- CE FICHIER N'EST PAS JOUÉ. Il est versionné et rien de plus.
--
-- Le ticket 5 met en œuvre l'option A de §4.3 de
-- `frontend/modules/site/PocketSite-docs/03-audit-resultats.md` : le script PHP
-- écrit un fichier JSON statique, aucun MySQL sur le chemin de publication ni
-- sur le chemin de lecture. Aucun des quatre déclencheurs de §4.5 n'est atteint.
--
-- Ce schéma existe pour que le passage à l'option C — MySQL en stockage, JSON
-- statique en lecture — reste une après-midi. Le jour venu, `publish-menu.php`
-- insère ici AVANT d'écrire le fichier ; le site, lui, ne change pas : ni l'URL
-- ni la forme du document ne bougent (§4.5, dernier paragraphe).
--
-- Le déclencheur le plus probable est le second : pouvoir annuler une mauvaise
-- publication sans redéployer le site (faille 3.7). D'où une table qui garde
-- les charges utiles entières plutôt qu'un modèle relationnel des entrées :
-- annuler, c'est réécrire le fichier depuis une ligne précédente, pas
-- reconstruire un arbre.
--
-- Le jour où ce fichier est joué, le consigner dans docs/DECISIONS.md.
-- =============================================================================

-- Historique des publications reçues et acceptées.
-- Une ligne par publication validée ; les refus ne sont pas stockés.
CREATE TABLE IF NOT EXISTS `menu_publication` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,

  -- Repris de l'enveloppe du document (05-contrat-menu.md §2.1).
  `contract_version` SMALLINT UNSIGNED NOT NULL,
  `published_at`     DATETIME NOT NULL COMMENT 'instant produit par PocketApp, UTC',

  -- Ajouté par le serveur.
  `received_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'UTC',
  `byte_size`        INT UNSIGNED NOT NULL,
  `item_count`       INT UNSIGNED NOT NULL,

  -- Le document entier, tel qu'il a été écrit dans menu.json après validation.
  -- C'est ce qui rend le retour arrière trivial : on réécrit le fichier depuis
  -- cette colonne, sans rien reconstruire.
  `payload`          MEDIUMTEXT NOT NULL,

  -- Empreinte du document : permet de repérer une republication à l'identique
  -- sans comparer des mégaoctets.
  `payload_sha256`   CHAR(64) NOT NULL,

  -- Publication actuellement servie à /data/menu.json. Une seule à la fois ;
  -- l'index unique partiel est simulé par NULL (MySQL ignore les NULL en UNIQUE).
  `is_current`       TINYINT(1) NULL DEFAULT NULL COMMENT '1 si servie, NULL sinon',

  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_current` (`is_current`),
  KEY `idx_published_at` (`published_at`),
  KEY `idx_sha` (`payload_sha256`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
