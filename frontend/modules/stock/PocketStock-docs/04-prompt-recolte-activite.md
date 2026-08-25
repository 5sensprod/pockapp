# Prompt — récolter l'activité de la base client

Prompt de reprise pour la session suivante. À copier tel quel, en corrigeant les
chemins et la date de récupération.

---

Reprendre PocketApp (`I:\pockapp`).

OBJECTIF : **récolter dans NOTRE base l'activité produite par le client depuis
le 25 août 2026**, sans rien perdre et sans rien inventer. Tickets, factures,
acomptes, clients, sessions de caisse, mouvements — **toutes les collections
SAUF le catalogue**.

── LE SENS DU TRANSFERT, ET POURQUOI IL EST INVERSE ──────────────────────
Le 25 août 2026, le catalogue a été repris dans notre base : 3027 produits,
461 catégories, 280 marques, 4706 images, clés stables conservées. C'est un
travail long et non refaisable à la légère.

Pendant ce temps, le client vend. Son activité est irremplaçable et fiscale.

On ne reporte donc PAS notre catalogue chez lui — il faudrait purger et
recharger 1,6 Go d'images sur son poste. **On récolte son delta d'activité chez
nous**, et notre base devient celle à livrer.

── POURQUOI LE Z EST LE REPÈRE, ET CE QUE ÇA AUTORISE ────────────────────
**Le client n'a fait aucun Z.** Le dernier scellé est donc le nôtre :

    Z-2026-000059   créé le 2026-08-24 10:16:44   id ad2vdp4l1uwwjjv

Tout ce qu'il a produit est APRÈS ce Z, donc dans une **période non close**.
Trois conséquences, et elles commandent tout :

1. On n'ajoute que du NON SCELLÉ. Aucun document figé n'est modifié.
2. La chaîne de hachage des `z_reports` n'est pas touchée. On ne rejoue rien.
3. **Le prochain Z couvrira toute cette période, tickets récoltés compris.**

Le point 3 est le risque : **une récolte incomplète produirait un Z faux**, et
un Z part chez le comptable. **L'exhaustivité prime sur la vitesse.** Un
document manquant ne se verra pas — il se traduira par un total plus petit,
crédible, et faux.

Le classificateur du Z ne lit PAS les `z_reports` mais les documents jour par
jour (`backend/reports/z_lignes.go`, partagé avec le X et le journal). C'est
donc bien l'ensemble des documents qui doit être complet, pas un agrégat.

── L'ÉTAT DE NOTRE BASE AU 25 AOÛT 2026 ──────────────────────────────────
Bornes de référence — tout ce qui est postérieur chez le client est à récolter :

    dernier Z         Z-2026-000059      2026-08-24 10:16:44
    dernier ticket    TIK-2026-000829    2026-08-22 15:43:30
    dernière facture  FAC-2026-000106    2026-08-22 16:29:48
    dernier client                       2026-08-22 15:07:01
    dernière session                     2026-08-21 17:47:25

Effectifs (hors catalogue) :

    invoices 1204   orders 16      quotes 63       customers 278
    cash_sessions 65   cash_movements 193   cash_registers 1
    closures 1      z_reports 60   payment_methods 8
    inventory_sessions 196   inventory_entries 2465   product_events 2963
    consignment_items 19   audit_logs 473   app_settings 6   users 3

**Aucun document n'existe après le dernier Z dans notre base** — la période
ouverte est vide chez nous. C'est ce qui rend la récolte simple : tout ce qui
est après cette borne chez le client est nouveau, sans recouvrement.

── CE QUI N'EST PAS DANS LE PÉRIMÈTRE ────────────────────────────────────
`products`, `categories`, `brands`, `suppliers`, `external_refs` : notre
catalogue est la référence, il ne se touche pas. Si le client a créé des
produits en caisse (`legacy_id` préfixé `pa_`), c'est un cas À PART, à mesurer
et à traiter explicitement — pas à récolter en vrac.

── LE STOCK : `product_events` SAIT CE QUI S'EST PASSÉ ───────────────────
**Tranché par le propriétaire.** Le stock ne se devine pas et ne se recopie
pas : il se REJOUE depuis le journal des mouvements.

`product_events` porte, pour chaque mouvement, l'avant, l'après et l'écart —
en JSON, avec l'horodatage, la source et le produit :

    CMA MA540T | before={"stock":8} after={"stock":7} delta={"stock":-1}
               | stock_sale | 2026-08-22 17:07:55

Mesuré au 25 août : 2963 events, dont 2665 portent un delta ; les 595 ventes en
ont toutes un.

**Ne rejouer QUE les mouvements réels** — `sale`, `return`, `inventory_session`,
`manual`. Surtout PAS `apppos_update` (1615 events, plus de la moitié) ni
`import` : ce sont des synchronisations, pas des mouvements. `guard.go` fait
déjà exactement cette distinction, s'en inspirer plutôt que d'en réinventer une.

**⚠️ Le choix qui reste, et il dépend d'une mesure à faire :**
appliquer les `delta` (partir de NOTRE stock, lui appliquer ses mouvements) ou
prendre le dernier `after` (adopter SON stock final) ? Les deux ne coïncident
que si les stocks de départ sont les mêmes.

**Or ils ne le sont probablement pas.** La base reprise chez le client le
25 août portait **0 produit** — le catalogue y avait été détruit le 22 août par
`MigrateCatalogV2`. Notre stock vient donc de NeDB, pas de lui. **Première
chose à faire : mesurer sa base et comprendre sur quoi il a vendu.** Si son
catalogue a été rechargé de son côté, son stock de départ nous est inconnu et
seuls les `delta` sont exploitables.

**Et le stock ne s'écrit que par `POST /api/stock/adjust`**
(`backend/routes/stock_routes.go`) — jamais par un `update` direct sur
`products`. Deux gardiens veillent, dont un faux PocketBase qui lève dès qu'on
touche la collection.

── DEUX QUESTIONS ENCORE OUVERTES ────────────────────────────────────────
1. **`inventory_sessions` / `inventory_entries`** : c'est du stock mais c'est de
   l'activité. Dans le périmètre ou pas ? (Si les comptages sont récoltés,
   leurs `product_events` de source `inventory_session` le sont aussi — ne pas
   compter deux fois.)
2. **Les compteurs de numéros.** Vérifier où ils vivent (`app_settings` ?) et
   s'assurer qu'aucun numéro ne sera attribué deux fois. ⚠️ 115 numéros de
   facture désignent DÉJÀ deux documents dans l'historique (sujet réservé,
   non traité) : ne pas aggraver.

── CE QUI DOIT ÊTRE VÉRIFIÉ DANS LE CODE, PAS SUPPOSÉ ────────────────────
- **Les relations, et leur ordre d'écriture.** Une facture cite un client par
  relation : le client doit exister avant. Un ticket cite des produits par
  `product_id` — qui est un TEXTE, pas une relation (`closures.ts` le
  documente). Nos `legacy_id` ayant été conservés, ces liens se résolvent ;
  le vérifier plutôt que d'y croire.
- **Les identifiants PocketBase de ses nouveaux enregistrements** ne
  collisionneront pas avec les nôtres (ils sont aléatoires), mais il faut le
  CONTRÔLER avant d'écrire : un `UNIQUE constraint` annule la transaction
  entière — c'est arrivé deux fois pendant la reprise du catalogue.
- **`app_settings`, `users`, `companies`, `payment_methods`, `cash_registers`** :
  ne pas écraser les nôtres sans savoir ce qui diffère. Les comparer d'abord.
- **`closures`** — les clôtures de journée. Une seule chez nous ; regarder ce
  qu'il en a produit.

── MÉTHODE, NON NÉGOCIABLE ───────────────────────────────────────────────
- **Le propriétaire fait les copies lui-même** — ne pas en faire, ne pas en
  demander. L'outil prend en paramètre le chemin d'une base source et écrit
  dans la base cible.
- **Simulation d'abord** : ce qui serait ajouté, par collection, avec les cas
  litigieux nommés. Aucune écriture avant qu'elle ait été présentée.
- **Une sauvegarde automatique avant toute écriture**, comme
  `backend/cmd/catalog-reprise` : une consigne se saute, une copie de fichier
  non.
- **Une transaction unique.** Au moindre échec, la base reste dans son état
  d'avant.
- **PocketApp doit être FERMÉ** — vérifier que 8090 et 5173 ne répondent pas.
  Deux fois pendant la reprise du catalogue, l'application tournait et la base
  était verrouillée.
- `gofmt`, `go build ./...`, `go test ./backend/...` verts, et **un gardien pour
  toute règle nouvelle**.
- Répondre en français, distinguer ce qui est LU dans le code (chemin et ligne)
  de ce qui est RAPPORTÉ.

── CE QUE LA REPRISE DU CATALOGUE A APPRIS, ET QUI RESSERVIRA ────────────
Ces leçons ont toutes coûté un aller-retour sur la base de production :

1. **Exécuter trouve ce que raisonner ne trouve pas.** Deux `UNIQUE constraint`
   — sur `products.legacy_id` puis `categories.slug` — n'ont été vus qu'en
   faisant tourner l'écriture sur une copie. Faire l'essai AVANT.
2. **Mesurer, puis re-mesurer autrement.** Une comparaison de chaînes dont
   l'une gardait un retour chariot a produit « 0 sur 3000 » au lieu de
   « 2982 sur 3000 », et un raisonnement entier a été bâti dessus.
   Voir `docs/DECISIONS.md`, 2026-08-25.
3. **Un WAL non intégré fausse toute lecture.** Copier `data.db` sans
   `data.db-wal` fait lire un état périmé. Toujours copier les trois fichiers
   et faire `PRAGMA journal_mode=delete` avant de mesurer.
4. **Une garde qui bloque à tort est aussi coûteuse qu'une garde qui laisse
   passer** : elle pousse à la contourner. `Findings.CatalogueVide` en est né.
5. **Ne pas mélanger deux chantiers.** Reprise et refonte des catégories ont
   été menées ensemble : deux allers-retours, et un catalogue méconnaissable
   entre-temps. La refonte est depuis derrière `-refondre-categories`, faux par
   défaut.

── LIVRABLE ATTENDU ──────────────────────────────────────────────────────
Un outil `backend/cmd/activite-recolte` (ou équivalent), avec sa simulation,
ses gardiens, et un document qui dit ce qui a été récolté, ce qui a été écarté
et pourquoi. Plus un bloc dans `docs/DECISIONS.md` si une règle nouvelle est
tranchée.

── SUJETS OUVERTS, À NE PAS COMMENCER SANS ACCORD ────────────────────────
- 5 factures annulées par un avoir sans moyen de remboursement mais toujours
  marquées payées : 2 108,47 € comptés dans les Z sans être entrés.
- 115 numéros de facture sur 1198 désignent deux documents (numérotation
  redémarrée vers début juin 2026). `number` entre dans le hash.
- 4 produits partiront en ligne comme NEUFS au prochain export (730525, bundle
  QSC CB10, Penta Harp E mineur, Providence V206 0.75m) — conséquence des
  renumérotations de SKU du 25 août.
