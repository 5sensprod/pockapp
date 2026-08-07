Lis CLAUDE.md, docs/DECISIONS.md et le README.md de PocketSite.
Puis : ticket 5, l'endpoint PHP de réception.

Commence par me restituer en quelques lignes ce que tu comprends du projet,
de l'architecture retenue et de ce que ce ticket doit produire. Si quelque
chose te manque, dis-le : c'est un défaut de la doc, pas une question à me
poser en passant.

Ce ticket est différent des précédents : le livrable ne s'exécute pas dans
ce dépôt. Trois bornes.

- Tranche d'abord OÙ le code serveur est versionné. §7.2 de l'audit renvoie
  la question ici. Ma préférence : un dossier `server/` dans ce dépôt-ci —
  un second dépôt pour quelques fichiers PHP est le maillon qu'on oublie.
  Argumente si tu vois mieux, mais décide avant d'écrire, et consigne le
  bloc DECISIONS.
- Aucune clé dans le dépôt. La clé `X-API-Key` vit dans un fichier de
  configuration non versionné, avec un exemple versionné à côté. Le
  mini-SaaS `pocketapp.5sensprod.com` a déjà ce modèle : inspire-t'en.
- Tu n'installes rien en ligne. Pas de FTP, pas de déploiement. Tu écris le
  code et tu me dis comment je le pose et comment je vérifie qu'il marche.

Les validations attendues sont en §6.1 du contrat. Deux choses à ne pas
oublier parce qu'elles ne se rattrapent pas ensuite : l'écriture doit être
atomique — fichier temporaire puis renommage, jamais d'écriture en place,
sans quoi le site peut lire un JSON tronqué — et l'endpoint doit refuser
une version de format qu'il ne connaît pas plutôt que de l'accepter.

Rien ne l'appellera avant le ticket 6.

Le dépôt du site est en local : `I:\divi-child`, un seul dépôt Git contenant
`frontend-wp/` (build React), `child/` (thème enfant WordPress) et `template/`.
Lecture seule.

Deux choses à en tirer avant d'écrire le PHP :

- La question ouverte §7.2 de l'audit est résolue : `/wp-json/wp/v2/menus`
  n'est pas un plugin, c'est `child/functions.php:86`. Consigne-le, et
  corrige la mention « plugin non identifié » là où elle apparaît.
- Le thème enfant est versionné dans ce dépôt-là. Ça fait un second domicile
  possible pour le code serveur du ticket 5. Écarte-le explicitement si tu
  gardes `server/` dans PocketApp, plutôt que de l'ignorer.

La lecture du `.htaccess` citée dans le bloc
« Contrat du menu publié » de DECISIONS.md est dans le repertoire racine de wp du serveur distant d'axemusique.shop

Deux précisions avant que tu proposes quoi que ce soit.

- Le FTP sert à déposer le script PHP, une fois, par moi. Il n'est PAS le
  canal de publication : PocketApp publie en POST avec `X-API-Key`, comme
  le prévoit §4.4. Ne propose pas un dépôt FTP direct depuis PocketApp.
- Pas de MySQL à ce ticket. La décision « A pour le MVP, C ensuite » tient :
  aucun des quatre déclencheurs de §4.5 n'est atteint. En revanche, pose la
  structure d'accueil sur le modèle du mini-SaaS — `api/`, configuration
  hors dépôt, `schema.sql` versionné mais non joué. Le but est que le
  passage à C reste une après-midi, pas de le faire maintenant.

Ajoute un bloc DECISIONS séparé : la cible à terme est que cette couche
distante remplace WooCommerce comme catalogue du site. Intention, rien
d'étudié, les trois questions de §7.3 de l'audit restent ouvertes. C'est
pour ne pas la reperdre, pas pour la commencer.