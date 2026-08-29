# Prompt — reprendre les ventes d'un `pb_data` client actualisé

À copier tel quel dans une session neuve, après avoir remplacé les trois
`<…>`. Écrit le 29 août 2026, après la première reprise réelle (8 documents du
25/08, `Z-2026-000061`) — voir `docs/DECISIONS.md`, bloc « Les ventes du client
se reprennent par l'id, jamais par le numéro ».

---

Dépôt `I:\pockapp` (PocketApp — caisse Wails Go + React + PocketBase). Réponds
en français.

**Contexte, à ne pas redécouvrir.** L'outil de reprise existe et il a déjà
servi. Lis, dans cet ordre, et rien d'autre avant d'avoir fini :

- `backend/reprise/reprise.go` — l'en-tête porte les trois règles
- `docs/DECISIONS.md`, le bloc du 29 août « Les ventes du client se reprennent
  par l'id, jamais par le numéro »
- `backend/cmd/reprise-production/main.go` — l'enchaînement complet

Ce que tu dois savoir sans avoir à le remesurer :

- **L'identité est l'id PocketBase, jamais le numéro.** Le poste du client
  tourne sur un build antérieur à `backend/numbering` : il **réattribue des
  numéros déjà pris** (118 numéros pour 236 documents au 29/08/2026) et ses
  `z_reports` n'ont pas les colonnes v4 à v6. Vérifie si c'est toujours vrai,
  ne le suppose pas.
- **Numéro, séquence et hash sont posés chez nous à la création**, jamais
  recopiés. La chaîne de hachage est **globale, tickets compris**.
- **Une `cash_session` ne s'efface jamais** (`z_repair.go:224-231`).
- **Un seul chemin d'agrégation** : `aggregateZ` + `z_lignes.go`. Rien ne se
  recalcule côté React.

**La copie du client est ici :** `<CHEMIN VERS LE pb_data DU CLIENT>`
**La période à reprendre :** du `<AAAA-MM-JJ>` au `<AAAA-MM-JJ>`

## Ce que je te demande, une étape à la fois, présentée avant la suivante

**1 — Constater, sans rien écrire.** Copie les deux bases (`data.db`, `-wal`,
`-shm`) dans le scratchpad et interroge-les en lecture seule, avec `sqlite3`,
les deux attachées côte à côte. Établis :

- le dernier Z de chaque base, nommé et daté ;
- les documents présents chez lui et **absents de chez nous par id** — c'est le
  delta, dans ce sens uniquement (notre base est un descendant strict ; si ce
  n'est plus vrai, arrête-toi et dis-le) ;
- pour chacun : son numéro est-il **déjà pris** chez nous ? sa **séquence**
  est-elle libre ?
- les clients et les mouvements de caisse absents ;
- l'état des sessions concernées, et **si l'une d'elles est déjà scellée dans
  un de nos Z** ;
- porte-t-il encore des numéros de facture en double ?

L'application peut rester **ouverte** : on ne lit que des copies.

**2 — Me montrer le lot, et me faire trancher ce qui se tranche.** Avant toute
écriture, présente la liste des documents avec leurs montants, et **signale
explicitement** :

- tout document qui ressemble à un doublon chez le client (même client, même
  montant, même jour) — il a déjà facturé deux fois la même vente ;
- tout avoir dont la cible est un document que **nous avons déjà**, car
  l'importer annulerait une vente déjà déclarée ;
- tout élément tombant dans une journée **déjà couverte par un de nos Z**.

Ne décide pas à ma place sur ces trois points : nomme-les, recommande, attends.

**3 — Simulation.** Lance l'outil sans `-apply` et montre-moi la sortie :

```
go run ./backend/cmd/reprise-production -source "<CHEMIN>" -du <date> -au <date> -ignorer <numéros écartés>
```

**4 — Application.** Dis-moi de **fermer PocketApp** et de sauvegarder
`%LOCALAPPDATA%\PocketReact\pb_data` sous un nom que tu nommes, puis enchaîne :

```
go run ./backend/cmd/reprise-production -source "<CHEMIN>" -du <date> -au <date> -ignorer <…> -apply
go run ./backend/cmd/z-clotures -jour <AAAA-MM-JJ>            # simulation, UNE journée
go run ./backend/cmd/z-clotures -jour <AAAA-MM-JJ> -apply     # émet le Z
go run ./backend/cmd/z-repair -apply
go run ./backend/cmd/z-repair                                  # doit rendre 0 / 0 / 0
```

⚠️ **Toujours `-jour` sur `z-clotures`.** Sans lui, il émettrait un Z pour
**toute** session fermée sans clôture — y compris une session vide, ce qui
scellerait un document fiscal numéroté et haché ne portant pas un centime. Un Z
ne se supprime pas.

**5 — Vérifier, et me donner les chiffres avant/après.** Sur la base finale :

- maillons de chaîne rompus : doit valoir **0** ;
- numéros en double : doit valoir **0** ;
- nombre de documents et somme TTC — et confronte-la à celle du client, en
  expliquant tout écart par les documents écartés à l'étape 2 ;
- `z-repair` en simulation : **0 corrigé / 0 enrichi / 0 rechaîné** ;
- les quatre lignes de chaque rapport s'équilibrent ;
- les dates `created` des mouvements repris tombent sur **leur** journée, pas
  sur celle de la reprise.

**6 — Consigner.** Un bloc dans `docs/DECISIONS.md` avec les chiffres, et un
commit à part. Si tu as dû corriger l'outil, dis-le dans le commit.

## Contraintes qui ne bougent pas

- Ne lance ni build, ni serveur. `go test ./backend/...` et
  `npx tsc --noEmit -p tsconfig.app.json` sont admis.
- Commandes en PowerShell (`$env:LOCALAPPDATA`).
- Précise **toujours** si l'application doit être fermée ou non.
- Vérifie `git status` avant de commencer : un correctif en attente se commite
  à part, jamais mélangé à la reprise.
- Distingue ce qui est **lu dans le code** (chemin et ligne) de ce qui est
  **rapporté**. Perdre le fil vaut mieux que deviner : le dire.
