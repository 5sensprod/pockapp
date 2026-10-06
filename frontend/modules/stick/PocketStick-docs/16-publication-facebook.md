# 16 — Publier sur Facebook : état (phase 1)

*6 octobre 2026. **Écrit et testé hors réseau** contre un faux Graph local
(`tests/facebook-test.php` du mini-SaaS, 103 vérifications),
`facebook_routes_test.go` et `lib/facebook.test.ts` (19 cas) ;
`pnpm build:client` passe. **Déposé, puis essayé par le propriétaire le même
jour : la connexion par jeton collé et une publication réelle ont fonctionné**
(sur une Page à lui, application Facebook en mode développement). Ce constat
est rapporté, pas rejoué ici ; ce qu'il ne couvre pas est au §10.*

Notation : **[LU]** = lu dans le code, chemin donné ; **[RAPPORTÉ]** = dit par
le propriétaire ou par la documentation de Meta, lue le 6 octobre à travers un
outil qui la résume ; **[SUPPOSÉ]** = ni l'un ni l'autre.

Dans l'éditeur, un bouton « Publier » de la barre du haut : l'affiche courante
part comme **photo** sur une Page Facebook du magasin, avec un message. La
connexion se fait une fois, par un administrateur ; ensuite tout utilisateur
connecté publie, après un aperçu et une confirmation.

**Phase 1** (ce document) : pas de fenêtre de connexion Facebook. Le jeton est
**collé** une fois. **Phase 2** (§8) : la connexion par fenêtre, qui ne changera
que la façon d'obtenir ce jeton.

---

## 1. Ce que faisait PocketStick **[LU]**, et ce qui change

| PocketStick (`I:\PocketStick`) | Ici |
|---|---|
| Popup OAuth, retour par `postMessage` (`server.js:363-408`, `FacebookPublishModal.jsx:98-159`) | **Pas repris en phase 1** : jeton collé par un admin |
| Secret de l'application dans le `.env` du serveur local (`server.js:66-67`) | Dans `pocketapp-secrets.php` du mini-SaaS, jamais sur le poste |
| Jeton utilisateur dans `localStorage` (`FacebookPublishModal.jsx:184`), jetons de Page rendus au navigateur (`server.js:496`) | **Aucun jeton ne revient au renderer.** Le jeton de Page est gardé chiffré sur le mini-SaaS, qui publie lui-même |
| Jeton dans l'adresse des appels locaux (`server.js:487, 593`) | Tout part en POST, dans le corps |
| Image en base64 dans du JSON (`server.js:525-541`) | Multipart, type lu sur les octets, poids borné |
| « Publier » envoie directement (`FacebookPublishModal.jsx:207`) | **Confirmation explicite** avant tout envoi |
| Message vide remplacé par « Créé avec PocketStick 🎨 » (`:232`) | Message vide = la photo part seule (décision par défaut, à confirmer) |
| Lien fait de `id`, l'identifiant de la PHOTO (`server.js:580`) | Lien fait de `post_id`, l'identifiant du post ; `id` en repli |
| Rendu en `pixelRatio: 2` (`Publish.jsx:53`) | Grand côté de 2048 px (`COTE_PUBLICATION`) |
| La Page se choisit à chaque publication | La Page est choisie UNE fois, par un admin ; « deux clics les fois suivantes » |

**Repris tel quel** : les points d'accès de Graph et leurs paramètres
(`oauth/access_token` en `fb_exchange_token`, `me/accounts`,
`<page>/photos` en multipart `source` + `message` + `access_token`), la version
`v23.0`, et la façon de passer les jetons à Graph (paramètre de requête pour
les lectures, champ du formulaire pour la photo) — c'est ce qui publie en réel
chez le propriétaire **[RAPPORTÉ]**, on n'y a rien « amélioré ».

## 2. Décisions du propriétaire (6 octobre 2026)

- **Jeton collé** (phase 1), généré dans les outils de Meta.
- **Le jeton de Page vit sur le mini-SaaS**, par client, et c'est le mini-SaaS
  qui publie.
- **Tout utilisateur connecté peut publier** ; connecter, choisir la Page et
  déconnecter sont réservés aux administrateurs.
- **Le bouton est dans la barre du haut.**
- Plusieurs Pages possibles : la Page se choisit **[RAPPORTÉ]** (« je
  sélectionne une de mes pages »).

Pris par défaut, annoncés au propriétaire et non contredits — **à confirmer** :
message vide autorisé et sans texte par défaut, pas d'aide de Gemini, photo
seule (ni brouillon ni programmation), publication **non décomptée**, aucune
trace locale des publications, identifiant d'envoi anti-doublon.

## 3. Le trajet

```
PublierFacebook.jsx ── rendrePage ──► l'image (aperçu = ce qui part)
        │  confirmation (useConfirmModal)
        ▼
POST /api/facebook/publier      (Go, session)   image + message + envoi
        ▼
POST facebook.php  action=publier   (mini-SaaS, X-API-Key)
        │  déchiffre le jeton de Page, réserve l'envoi
        ▼
POST graph.facebook.com/v23.0/<page>/photos     ← UN envoi, jamais deux
        ◄── { post_id } ──► { lien, post_id, page } ──► { lien, page }
```

| Ce qui sort du poste | Vers | Journalisé |
|---|---|---|
| Une image de l'affiche (prix et textes compris), 8 Mio au plus | mini-SaaS, puis **publiée** sur Facebook | non |
| Le message du vendeur, 2000 caractères au plus | mini-SaaS, puis **publié** | non |
| Un identifiant d'envoi à usage unique | mini-SaaS | gardé un jour, avec l'identifiant du post |
| À la connexion seulement : un jeton utilisateur Facebook | mini-SaaS, puis Graph | non, et gardé nulle part |

Ce qui entre : du JSON — l'état de la connexion (noms et identifiants de
Pages), ou le lien du post. **Jamais un jeton.**

## 4. Le mini-SaaS **[LU, écrit ici]** (`I:\pocketApp_minisaas`)

| Fichier | Rôle |
|---|---|
| `api/facebook.php` | point d'entrée : POST seul, HTTPS exigé, `X-API-Key` en en-tête seul, cinq actions |
| `api/facebook-lib.php` | réglages, chiffrement, transport, adaptateur de Graph, stockage, connexion, publication |
| `schema-facebook.sql` | deux tables nouvelles (`facebook_pages`, `facebook_envois`) |
| `tests/facebook-test.php`, `tests/fake-graph.php` | 103 vérifications contre un faux Graph (`php -S`) |
| `.htaccess` | `facebook-lib.php` et `schema-facebook.sql` interdits en accès direct |

**Actions** : `etat`, `connecter` (jeton), `choisir` (page_id), `deconnecter`,
`publier` (multipart : image, message, envoi).

- **Connexion** (`connecterFacebook`) : forme du jeton vérifiée → échange contre
  un jeton long → lecture des permissions → `me/accounts`. Les jetons de Page
  sont chiffrés et rangés. **Une seule Page : choisie d'office.** Plusieurs :
  elles attendent `choisir` pendant 15 minutes (`FB_CHOIX_TTL`) ; la Page déjà
  choisie, si elle est du lot, reçoit son nouveau jeton tout de suite — c'est
  le geste de réparation après un `jeton_expire`. Le jeton utilisateur, court
  ou long, n'est écrit nulle part.
- **Permissions** : `pages_show_list`, `pages_read_engagement`,
  `pages_manage_posts`. S'il en manque une, la connexion est refusée en la
  nommant. Si Graph ne dit pas les permissions (appel en échec), la connexion
  continue : c'est la publication qui tranchera.
- **Chiffrement** : AES-256-GCM, clé dérivée de `FB_TOKEN_KEY`
  (`pocketapp-secrets.php`), le client lié au chiffré. Une copie de la base
  seule ne livre aucun jeton ; un chiffré recopié sous un autre client ne se
  relit pas. ⚠️ **Changer `FB_TOKEN_KEY` déconnecte tous les clients** (ils
  verront `jeton_expire`).
- **Publication** (`publierFacebook`), dans cet ordre : configuration → Page
  choisie → message → identifiant d'envoi → image (`lireImageRecue`, celle du
  détourage) → jeton → **réservation de l'envoi** → Graph.
- **Un seul envoi.** `requeteGraph` ne suit aucune redirection et ne réessaie
  jamais. L'identifiant d'envoi est une clé primaire : rejoué, il rend la même
  réponse si la photo était partie, sinon 409 `deja_envoye`. Il n'est libéré
  que si Graph a refusé **nettement** ; après un délai, un 5xx ou une réponse
  illisible, il reste pris et le code est `publication_incertaine`.
- **« Rien n'est parti » ne se dit que quand on le sait** : sans liaison établie
  avec Graph (résolution, connexion, TLS), l'échec est `fournisseur_en_echec`
  et l'envoi est libéré.
- **Journal** : celui du détourage, sous `facebook_<code>`, avec les NUMÉROS
  d'erreur de Graph — jamais son message, jamais un jeton, jamais le message
  du vendeur. Gardé par des tests.
- **`deconnecter` efface les jetons gardés ici ; il ne révoque rien chez
  Facebook.** Le jeton reste valable là-bas tant que l'accès de l'application
  n'est pas retiré dans les réglages du compte Facebook.

| Code | HTTP | Sens |
|---|---|---|
| `configuration_absente` | 503 | `FB_APP_ID`, `FB_APP_SECRET` ou `FB_TOKEN_KEY` (32 caractères au moins) absent |
| `jeton_absent`, `jeton_refuse` | 400 | à la connexion : rien de collé, ou Facebook n'en veut pas |
| `permission_manquante` | 403 | à la connexion (nommée) ou à la publication |
| `aucune_page`, `page_inconnue` | 404 | aucune Page gérée ; Page plus proposée |
| `page_non_connectee` | 409 | personne n'a connecté de Page |
| `jeton_expire` | 403 | Graph refuse le jeton gardé (ou il ne se déchiffre plus). **Rien de publié** ; un admin recolle un jeton |
| `message_trop_long`, `envoi_invalide` | 400 | refus de forme, jamais de troncature |
| `deja_envoye` | 409 | cet envoi est déjà parti, issue inconnue |
| `contenu_refuse` | 422 | Graph a bloqué le contenu : ne pas renvoyer à l'identique |
| `fournisseur_en_echec` | 502 | Graph en panne ou injoignable, rien de publié |
| `publication_incertaine` | 504 | **la photo a PU partir** : vérifier la Page |

Les numéros de Graph traduits (`lireErreurGraph`) sont **[SUPPOSÉS]**, de
mémoire : 190 et 102 = jeton, 10, 3 et 200 à 299 = permission, 368 = contenu.
Un numéro inattendu donne `fournisseur_en_echec` et se lit au journal.

## 5. Les routes Go **[LU, écrit ici]** (`backend/routes/facebook_routes.go`)

| Route | Qui |
|---|---|
| `GET /api/facebook/etat` | session |
| `POST /api/facebook/connecter`, `/choisir`, `/deconnecter` | **admin** |
| `POST /api/facebook/publier` | session |

- **L'authentification est celle que PocketBase a vérifiée**
  (`apis.RequestInfo(c).AuthRecord`), puis `role == "admin"`. Ce n'est pas
  `createAdminMiddleware` de `secrets_routes.go`, qui lit le jeton sans en
  vérifier la signature (`:603`) — signalé à part, non corrigé ici.
- `posterFacebook` : les gardes de `posterPhotos` — clé présente, HTTPS seul,
  `User-Agent`, lecture bornée, codes connus, **un seul envoi**. Délais : 60 s
  pour les actions, 90 s pour la publication (au-delà des 60 s du mini-SaaS).
- **Tout est vérifié avant de partir** : message (2000), identifiant d'envoi,
  image présente, 8 Mio au plus, type lu sur les octets. Un champ que le poste
  n'a pas à décider (`page_id`, `access_token`) n'est pas relayé.
- **La réponse est relue dans une forme fermée** (`facebookEtat`,
  `facebookPublication`) puis réécrite : un champ de plus rendu par le
  mini-SaaS — un jeton, par erreur — ne traverserait pas. Gardé par un test.
- **Ni 401 ni 403 vers le renderer** pour une affaire de Facebook :
  `jeton_expire` et `permission_manquante` sortent en 409, `cle_invalide` en
  503.
- **Après un échec sans réponse nette pendant une publication**
  (délai du poste, coupure, 5xx sans code connu, 200 illisible) :
  `publication_incertaine`. Seul un échec de **liaison** (`rienNestParti` :
  résolution ou connexion) dit « rien n'est parti ».
- Rien n'est journalisé ici.

## 6. L'éditeur **[LU, écrit ici]**

| Quoi | Où |
|---|---|
| Client des routes, erreurs, identifiant d'envoi, un envoi par identifiant | `frontend/lib/facebook/client.ts` |
| Peut-on publier cette page, l'image qui part, le brouillon du message, le texte de la confirmation | `labels/lib/facebook.ts` |
| Le bouton et la fenêtre (aperçu, Page, message, confirmation, lien) | `templates/PublierFacebook.jsx` |
| Le bouton dans la barre du haut | `CanvasArea.jsx` |
| La connexion, pour les admins | `components/settings/FacebookSection.tsx`, `lib/queries/facebook.ts`, monté par `SecretsSettings.tsx` |

- **Jamais en planche** : le bouton n'est pas affiché (`publicationProposee`),
  et `peutPublier` refuse.
- **L'aperçu est l'image qui part** : `preparerAffiche` rend la page par
  `rendrePage` (un clone hors écran, fond blanc) ; le même `Blob` est montré
  puis envoyé. Au-delà de 6 Mio (`SEUIL_ENVOI_OCTETS`), il est réencodé comme
  une image du détourage.
- **Confirmation** (`useConfirmModal`) : elle nomme la Page, dit que la
  publication est publique et qu'on ne la retire pas d'ici, et cite le message.
- **Deux clics** une fois la Page connectée : « Publier… » dans la fenêtre,
  puis « Publier » dans la confirmation.
- **Après un échec incertain**, « Publier » disparaît de la fenêtre : il faut la
  fermer, regarder la Page, puis en rouvrir une (nouvel identifiant d'envoi).
  Après un refus net, le même envoi peut repartir.
- **Le lien** s'ouvre dans le navigateur du poste (`ouvrirDansLeNavigateur`),
  pas dans une seconde fenêtre de l'application. Il n'est accepté que s'il
  commence par `https://www.facebook.com/`.
- **Le message** vit dans la mémoire de l'onglet (`useBrouillonFacebook`) : il
  survit à la fermeture de la fenêtre, pas à un rechargement ; vidé après une
  publication réussie. Ni `localStorage`, ni IndexedDB.
- **Le jeton collé** : champ masqué, vidé dès l'envoi, gardé par aucun cache.
- Ce n'est pas une requête d'IA : `useEtatDetourage` n'est pas pris, rien n'est
  décompté, rien n'est rangé dans la bibliothèque, la page n'est pas touchée.
- Un seul accent, le bleu : pas de bleu Facebook sur les boutons.

## 7. Le mode développement de l'application Facebook **[RAPPORTÉ]**

D'après la documentation de Meta (`developers.facebook.com/docs/development/build-and-test/app-modes`,
`…/facebook-login/guides/access-tokens/get-long-lived`, `…/pages-api/posts`) :

- **Seuls les comptes ayant un rôle sur l'application peuvent lui accorder des
  permissions**, et **ce qu'elle publie n'est visible que d'eux**. Pour les
  essais : le post apparaît sur la Page, mais les clients du magasin ne le
  voient pas tant que l'application n'est pas en ligne.
- **Passer en ligne** demande la revue de l'application (App Review) pour les
  permissions demandées. La vérification de l'entreprise est probable
  **[SUPPOSÉ]**.
- **Durées** : un jeton utilisateur long dure environ 60 jours. Un jeton de
  Page obtenu depuis un jeton utilisateur long **n'a pas de date d'expiration**,
  mais peut être invalidé « sous certaines conditions » que la page ne détaille
  pas (changement de mot de passe, rôle retiré, accès révoqué **[SUPPOSÉ]**).
- Publier une photo exige `pages_manage_posts` et `pages_read_engagement` ; la
  réponse porte `id` (la photo) et `post_id` (le post).

Le propriétaire publie déjà en réel depuis `I:\PocketStick` avec cette
application **[RAPPORTÉ]** : les permissions et son rôle sont donc en place.

## 8. Ce que la phase 2 devra ajouter (non codé)

La phase 1 est faite pour que la phase 2 ne change que **la façon d'obtenir le
jeton utilisateur**. Restent tels quels : `connecterFacebook` à partir de
l'échange, le stockage, `choisir`, `publier`, tous les codes, les routes Go de
publication et la fenêtre.

À ajouter :

1. **Une adresse de retour sur `pocketapp.5sensprod.com`** (par exemple
   `/api/facebook-retour.php`), à **enregistrer chez Facebook** dans les
   « URI de redirection OAuth valides » de l'application. C'est elle, et non
   une adresse locale : sous Wails l'origine n'est pas une adresse que Facebook
   accepte en retour **[SUPPOSÉ, non essayé]**.
2. **Un état à usage unique** : une action `demarrer` rend l'adresse de la
   fenêtre Facebook avec un `state` aléatoire, lié au client et gardé quelques
   minutes côté mini-SaaS. Le retour le consomme ; un `state` inconnu, expiré
   ou rejoué est refusé.
3. **L'échange du code** côté mini-SaaS (`code` → jeton court, avec
   `FB_APP_SECRET` et la même adresse de retour), puis la suite existante de
   `connecterFacebook`.
4. **Le retour vers le poste, sans y faire passer de jeton** : le poste ouvre
   la fenêtre dans le navigateur du poste (`BrowserOpenURL` sous Wails) et
   **interroge `etat`** jusqu'à voir la connexion ou les Pages à choisir. La
   page de retour n'a qu'à dire « vous pouvez fermer cette fenêtre ». Pas de
   `postMessage` : il n'y a pas de fenêtre parente sous Wails.
5. **`FB_APP_ID` côté adresse de la fenêtre** : il est public par nature, mais
   reste rendu par le mini-SaaS, pas écrit dans le bundle.
6. Garder la saisie du jeton collé comme repli, ou la retirer : à trancher.

## 9. À faire à la main

**Dans `pocketapp-secrets.php`** (jamais dans le chat, jamais dans un dépôt) :

```php
define('FB_APP_ID', '…');
define('FB_APP_SECRET', '…');
define('FB_TOKEN_KEY', '…');   // 32 caractères au moins, aléatoires, à ne plus changer
```

**Sur le mini-SaaS, dans cet ordre :**

1. Jouer `schema-facebook.sql` (deux tables nouvelles, rien de modifié).
2. Déposer `api/facebook-lib.php`, puis `api/facebook.php`.
3. Déposer `.htaccess`.

Vérification : `https://pocketapp.5sensprod.com/api/facebook-lib.php` doit
répondre 403, et un GET sur `facebook.php` un 405 `methode_refusee`.

**Dans l'application** (un admin) : Réglages → Clés API & Secrets → « Page
Facebook ». Générer un jeton utilisateur dans l'explorateur de l'API Graph de
Meta, pour l'application du magasin, avec les trois permissions du §4 ; le
coller ; choisir la Page.

**Chez Facebook** : rien à changer pour la phase 1. L'adresse de retour ne
sera à enregistrer qu'en phase 2.

## 10. Vérifié en réel, et ce qui ne l'est pas

**Rapporté par le propriétaire le 6 octobre 2026** : jeton utilisateur généré
dans l'explorateur de l'API Graph, collé, Page retenue d'office (le jeton n'en
donnait qu'une), puis une affiche publiée. Cela lève, pour le chemin du succès :
l'échange du jeton, `me/permissions`, `me/accounts`, `<page>/photos` et `v23.0`.
Piège rencontré : le « Token client » des paramètres de l'application n'est PAS
un jeton utilisateur (Graph : 190, sous-code 0, « Cannot parse access token »).

**Une seule Page proposée** n'est pas un défaut : Facebook ne rend que les Pages
cochées quand l'application a été autorisée. Pour en avoir d'autres, modifier
l'accès dans la fenêtre Facebook en générant le jeton.

**La connexion est PAR CLIENT du mini-SaaS** (la clé PocketApp du poste) : la
Page connectée depuis le poste de développement ne l'est pas chez un client.

Ce que ce constat ne dit pas :


- **Les chemins d'échec n'ont pas été vus en réel.** Ils sont testés contre
  `tests/fake-graph.php`. Inconnues, par ordre de risque :
  1. **Les numéros d'erreur** (§4) : supposés. Un jeton expiré mal reconnu
     sortirait en `fournisseur_en_echec` au lieu de `jeton_expire` — rien ne
     serait publié, mais le message orienterait mal.
  2. **`me/permissions`** : sa forme (`data[].permission`, `status: granted`)
     est de mémoire. Si elle diffère, la connexion continue sans ce contrôle ;
     si elle rendait des permissions sous d'autres noms, la connexion serait
     refusée à tort (`permission_manquante`).
  3. **Le lien `https://www.facebook.com/<post_id>`** : le propriétaire n'a pas
     dit s'il l'a ouvert.
- **Le choix entre plusieurs Pages**, la reconnexion après expiration, la
  déconnexion : non essayés en réel.
- **L'interface** : le bouton et le bloc des réglages ont été vus par le
  propriétaire ; pas de retour sur le thème sombre ni sur la barre du haut quand
  les options rapides sont longues.
- **`rendrePage` pour cet usage** : pas de canvas sous Node, donc non testé
  ici ; c'est le rendu d'« Embellir », déjà en service.
- **Les limites de Facebook sur une photo** (poids, dimensions) : non lues. Le
  rendu fait 2048 px au plus et 6 Mio au plus.
- **Le schéma sur MySQL** : testé en SQLite. La clé étrangère vers `clients`
  suppose le même jeu de caractères que cette table.
- **Un test voisin est instable** : `retouche.test.ts` (« un historique par
  qualité ») a échoué une fois sur quatre lancements de la suite complète de
  `labels/lib`, et passe seul. Il ne touche à rien de cette mission.

## 11. Dette

- Pas de trace locale des publications (date, lien) : seul le lien affiché
  après l'envoi, et la ligne d'un jour sur le mini-SaaS.
- Pas d'état « connexion à refaire » visible AVANT de publier : un jeton
  invalidé ne se découvre qu'à la publication (`jeton_expire`).
- La Page se choisit pour tout le magasin : pas de choix à la publication,
  contrairement à PocketStick.
- `me/accounts` n'est lu que sur sa première page (100 Pages).
- `deconnecter` ne révoque pas l'accès chez Facebook.
