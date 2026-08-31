# Décisions

Ce que le code ne peut pas dire : pourquoi il est comme ça, et surtout ce qui a
été écarté. Une décision = un bloc. On ajoute en haut. **On ne réécrit jamais un
bloc existant** — une décision annulée reçoit un nouveau bloc qui l'annule, et
la mention `— annulée le <date> par <titre>` est ajoutée sur l'ancienne.

Format : titre, date, la décision en une phrase, les options écartées et
pourquoi, ce qui pourrait la remettre en cause.

---

## Deuxième reprise de production — 24 documents du 26 au 29 août — 2026-08-31

**Fait, pas décidé.** Application de la règle du 29 août (« Les ventes du client
se reprennent par l'id, jamais par le numéro ») à la copie
`pb_data_31_08` du poste client. Aucune ligne de code modifiée : l'outil a servi
tel quel, ce qui était son but.

**Le lot :** 24 documents, **1 416,92 € TTC**, du 26 au 29 août — 19 tickets,
5 factures —, **3 clients** (`CL-000281` à `CL-000283`) et **4 mouvements de
caisse** espèces du 26/08 (123,00 €). Séquences 1209 à 1232 chez nous.

**La règle de l'id a encore payé.** Aucun id du delta n'existait chez nous ;
**trois numéros étaient déjà pris** — `FAC-2026-000111` à `000113`, devenus
`FAC-2026-000283` à `000285`. Les tickets, eux, ont gardé leurs numéros parce
qu'ils étaient libres. La base du client porte toujours **122 numéros dupliqués
sur 1238 documents** : son poste n'a pas été mis à jour.

**Rien à écarter cette fois** : aucun doublon client sur la période, aucun avoir,
aucune journée déjà couverte par un de nos Z (le dernier était le Z-061 du 25).
Les deux seuls documents du delta laissés dehors sont **la double facturation de
2 000 € du 22/08 et son avoir du 25/08**, écartés le 29 août et toujours
écartés.

**Quatre Z émis, un par journée, `-jour` à chaque fois :** `Z-2026-000062`
(26/08, 481,48 €), `000063` (27/08, 530,21 €), `000064` (28/08, 229,17 €),
`000065` (29/08, 176,06 €) — somme **1 416,92 €**, le lot exact. Les trois
factures hors caisse tombent en ligne 1 de leur journée, émises et encaissées le
même jour.

**La session vide du 29/08 n'a pas gêné.** Notre base portait déjà
`rutysxyxdtd0hwu`, fermée et sans un document — née de l'essai du 29. La
journée a été clôturée sur **deux sessions**, 5 tickets, 176,06 € : le total ne
bouge pas, une session vide n'apporte rien. C'était le seul point ouvert avant
l'écriture, et il est refermé par la mesure.

**Vérifications sur la base finale :** `z-repair` en simulation rend
**0 corrigé / 0 enrichi / 0 rechaîné / 0 en erreur** sur 65 rapports, et « tous
les rapports égalent la somme de leurs quatre lignes » ; **0 numéro en double**,
**0 séquence en double** ; les 4 mouvements repris sont datés au **26/08**, leur
propre journée, pas à celle de la reprise — le défaut de `created` corrigé le
29 août ne s'est pas reproduit. **Le total TTC tombe au centime sur celui du
client : 122 888,30 € des deux côtés**, 1236 documents contre 1238, l'écart
étant exactement la paire à ±2 000 € écartée.

**Un maillon « rompu » subsiste, et il préexistait :** `FAC-2025-000004`, en
séquence 5, porte un `previous_hash` de genèse alors qu'aucun document ne
porte la séquence 4. Il était déjà là avant la reprise ; `z-repair` ne le
signale pas.

**Le journal des ventes et celui des espèces n'ont rien demandé.** Ils lisent
les documents et les mouvements jour par jour (`/api/reports/journal`), pas les
`z_reports` : reprendre les documents suffit à les faire apparaître.

**Remise en cause si :** le poste du client est mis à jour — même remarque
qu'au 29 août.

## Les ventes du client se reprennent par l'id, jamais par le numéro — 2026-08-29

**Décision.** Ramener dans notre base ce que la caisse du client a produit depuis
la divergence est une opération RÉCURRENTE : elle passe par un outil,
`backend/cmd/reprise-production`, simulation par défaut, et sa règle vit dans
`backend/reprise`. Appliqué le 29 août 2026 : **8 documents du 25/08, 2 clients,
2 mouvements de caisse**, puis `Z-2026-000061` (1 350,56 €).

**L'identité est l'id PocketBase, pas le numéro — mesuré.** Aucun des documents à
reprendre ne portait un id déjà présent chez nous ; **quatre portaient un numéro
déjà attribué** (`FAC-2026-000107` à `000110`). La base du client **fabrique
encore des doublons** — 118 numéros pour 236 documents — parce qu'elle tourne sur
un build antérieur à `backend/numbering` : ses `z_reports` n'ont aucune colonne
v4+. Reprendre par le numéro aurait recréé le défaut des 114 doublons du 28 août.
C'est aussi ce qui rend l'outil **idempotent sans mémoire** : un second passage
retrouve les id et ne trouve plus rien.

**Le numéro, la séquence et le hash sont posés CHEZ NOUS, jamais recopiés.** Un
`previous_hash` venu d'une autre chaîne produirait un maillon incohérent sans
aucune erreur. Les relations, elles, se résolvent par l'id : l'avoir
`AVO-2026-000041` annulait `tacc49ewf6nyf46`, que nous avions déjà — sous un
AUTRE numéro depuis la renumérotation.

**Les tickets se rattachent à la session de LEUR journée**, ouverte par
`SessionDuJourLe` puis refermée par `FermerAuPassageDeJournee` — deux fonctions
existantes simplement exportées, aucune règle dupliquée. Leur session d'origine
était close chez nous depuis le 23/08 et scellée dans le Z-060 :
`GenerateRapportZ` ne retient que les sessions fermées DANS la journée du
rapport (`cash_reports.go:1490-1496`), le Z du 25 ne les aurait jamais vus.

**Un mouvement suit son document quand ce document est dans le lot** (par
`related_invoice`) ; sinon il garde la session de la source. Le dépôt banque de
100 € du 22/08 reste ainsi sur la session que le Z-060 couvre, plutôt que de se
voir inventer une journée de clôture qui n'a jamais existé.

**Écarté — reprendre la vente de 2 000 € du 22/08 et son avoir.** Le client avait
facturé DEUX FOIS la même vente à 37 minutes d'intervalle (16:30 et 17:07, même
client, même chèque) puis annulé la première le 25 — celle que nous avons déjà,
scellée dans le Z-060. Reprendre l'avoir seul aurait annulé une vraie vente déjà
déclarée. Les deux sont écartés ; le total TTC de notre base tombe au centime sur
celui du client, 121 471,38 €.

**Trois défauts trouvés en chemin, tous corrigés.**

1. **`created` n'était pas recopié.** PocketBase ne le repose que s'il est vide
   (`daos/base.go:317`) ; la boucle ne parcourait que les champs du schéma. Sans
   effet sur un document — le Z, le journal et le hash lisent `date` — mais un
   **mouvement de caisse est daté par `created`** : les deux mouvements repris se
   sont retrouvés au 29 août dans le journal des espèces. L'outil sait désormais
   **recaler** ce qu'une reprise antérieure a mal daté.
2. **`z-clotures` proposait d'émettre un Z VIDE** — 0 ticket, 0,00 € — pour une
   session de test. Un Z est numéroté, haché, et ne se supprime pas. D'où un
   drapeau **`-jour`** : on ne devine pas ce qui mérite une clôture, on le
   désigne.
3. **`z-repair` n'affichait que les rapports dont le HASH change.** Or le
   rapprochement espèces n'entre pas dans le hash (`z_repair.go:189-196`) : un
   rapport « aux MONTANTS corrigés » était compté sans jamais être montré. C'est
   exactement ce qui masquait la correction du Z-060.

**Assumé — le Z-060 affiche désormais +100 € d'excédent** (attendu 127,68 €,
compté 227,68 €). Deux autres voies ont été écartées : corriger le comptage à
127,68 € reviendrait à inventer un comptage que personne n'a fait — chez le
client cette session n'a JAMAIS été comptée (`counted_cash_total = 0`, encore
ouverte) et nos 227,68 € valent exactement le théorique `198,20 + 21,00 + 8,48` ;
supprimer le mouvement effacerait un retrait réel. Sans effet sur le CA ni la
TVA : le rapprochement n'est pas haché.

**Remise en cause si :** le poste du client est mis à jour. Il cesserait alors de
produire des doublons de numéro, et ses `z_reports` porteraient enfin les
colonnes v4 à v6 — la reprise resterait la même, mais son principal danger
disparaîtrait.

## La journée s'ouvre d'un geste, mais son fonds ne se saisit plus — 2026-08-29

**Décision, prise après essai en production le jour même.** L'ouverture
totalement invisible ne convient pas : le terminal affiche, tant que la journée
n'a pas commencé, **le numéro du dernier Z, le tiroir de la veille au soir, et
un bouton « Commencer la journée »**. Au clic, une modale propose le fonds
**prérempli**, modifiable — soit on garde le tiroir de la veille, soit on
recompte.

**Ce qui a été gardé de la version invisible, et c'était l'essentiel :** le
fonds n'est **jamais ressaisi de mémoire**. C'est cette saisie à blanc qui a
produit 32 fonds à zéro sur 65 sessions et deux tiroirs négatifs
(−154,04 € et −170,24 €). Le geste explicite ne la réintroduit pas : il valide
une proposition.

**Dès qu'une dénomination est saisie, le comptage l'emporte** sur la
proposition : on vient de recompter le tiroir, la valeur calculée ne vaut plus.

**`OpenSessionDialog` a été remonté** — il avait été débranché quelques heures
par E-3. C'est l'argument pratique de la règle « on débranche, on n'efface
pas » : le fichier était intact, il a suffi de le rebrancher et de préremplir
son champ.

**`SessionDuJour` reste, en filet.** Elle sert toujours à
`CreateCashMovementIfEspeces` : un encaissement espèces hors caisse, un jour où
personne n'a ouvert le terminal, doit avoir une session — sinon il est **perdu**,
comme avant le 29 août. Le terminal, lui, demande le geste explicite.

**Un défaut de fuseau trouvé sur la première session implicite de production.**
`opened_at` valait `11:26:24Z` pour un ticket créé à `09:26:24Z` : l'heure
**locale** écrite avec un « Z » qui la fait passer pour de l'UTC, **deux heures
inventées**. Sans effet en pleine journée ; entre minuit et 2 h, la journée
stockée aurait été la suivante. L'instant est désormais en UTC comme tout ce
que PocketBase écrit, et la **journée reste locale** — c'est la journée
commerciale. Gardien : `TestLaJourneeEstCelleDuCommercantPasCelleDUTC`.

**`facture-supprimer` corrigé, sur le bon critère.** Il refusait **tout**
document portant une session — un refus qui datait d'un temps où une session se
créait à la main. Depuis que tout ticket en porte une, il interdisait d'en
retirer le moindre, **même le dernier, même jamais clôturé**. Le critère devient
« sa session est-elle scellée dans un rapport Z ? » : un Z est haché, et le
rejouer réécrirait un document déjà remis. L'outil ne réclame plus non plus un
`z-repair` quand aucun Z n'est concerné — même fausse alerte que celle relevée
sur `facture-doublons` le 28 août.

**Appliqué :** `TIK-2026-000830` (2,90 €, **carte**, donc aucun mouvement de
caisse, séquence 1201, dernier maillon, session dans aucun Z) supprimé le 29 août
2026, application fermée, après sauvegarde. Aucun rejeu nécessaire.

**Remise en cause si :** le geste du matin devient une gêne sur un poste
secondaire. Le filet existe déjà — `SessionDuJour` ouvrirait la journée au
premier encaissement — mais le terminal, lui, l'exige.

## Le comptage du tiroir est une étape de la clôture, pas un geste à part — 2026-08-29

**Décision, prise par le propriétaire après avoir essayé la version précédente
le jour même.** Le bouton « Compter le tiroir » de E-3 est remplacé par
**« Clôturer la journée »**, et c'est la modale de clôture qui propose le
comptage. Ses mots : « le matin j'ouvre la caisse et le soir je dois faire le Z
pour clore la journée, et c'est à ce moment que s'affiche la modale pour compter
ce qu'il y a en caisse ».

**Ce que E-3 avait mal compris.** Sortir le comptage de la clôture l'avait rendu
autonome — un bouton qu'il aurait fallu penser à presser, sans moment naturel
pour le faire. Le comptage n'est pas une action : c'est **une étape** du seul
geste de fin de journée. « Facultatif » veut dire qu'on peut clôturer sans avoir
compté, pas que le comptage vit ailleurs.

**Le comptage seul survit en action secondaire** — « Enregistrer sans
clôturer » — pour un contrôle en cours de journée. Il écrit
`counted_cash_total` sans rien fermer, par la route `/count`.

**Le découpage du Z n'a pas bougé d'une ligne.** `bornesDeLaPeriodeZ`,
`session_ids` et `GenerateRapportZ` sont intacts : c'est ce qui rend le rejeu
par `z-repair` possible, donc la vérification d'un document déjà remis.

**Le gardien qui couvre toute la chaîne.**
`TestUneJourneeImpliciteEntreDansLeZDeSaJournee` rejoue une journée entièrement
implicite — ouverture au premier encaissement, un ticket de 50 €, fermeture au
passage de journée — et exige que le Z de cette journée porte **50,00 € et un
ticket**. Si la fermeture automatique posait l'heure courante au lieu de la fin
de la journée de la session, **ce Z serait vide et personne ne le saurait** :
`GenerateRapportZ` filtre sur `closed_at` dans sa journée.

**Écarté — annuler le ticket de test par un avoir.** Proposé puis retiré : un
avoir enregistre un remboursement qui n'a jamais eu lieu, sur un document
fiscal. On ne fabrique pas un mouvement d'argent pour effacer une erreur de
saisie.

**Remise en cause si :** deux postes clôturent en même temps. La modale vérifie
déjà qu'aucune autre session n'est ouverte et qu'aucun Z n'existe pour la
journée, mais la vérification est côté écran.

## Compter le tiroir ne clôture plus, et l'écran nomme l'utilisateur — 2026-08-29

**Décision.** L'ouverture et la fermeture manuelles de session disparaissent des
écrans (E-3). Le bouton « Ouvrir / Clôturer » devient **« Compter le tiroir »**,
le terminal encaisse sans qu'aucune session soit ouverte à la main, et le badge
de l'en-tête affiche **le nom de l'utilisateur** au lieu de l'état de la session.

**Le comptage passe par une route neuve, `POST /api/cash/session/:id/count`**,
qui écrit `counted_cash_total` et rien d'autre. **Il ne pouvait pas passer par
`/close`** : `SessionDuJour` cherche une session *ouverte*, donc une session
fermée en milieu de journée serait remplacée par une seconde au prochain
encaissement et la journée en porterait **deux au lieu d'une** — exactement ce
que le gardien de E-1 interdit. Le comptage cesse donc d'être une clôture ; la
fermeture appartient au Z et au passage de journée.

**Pourquoi le badge nomme l'utilisateur.** « Aucune session ouverte » ne
désignait plus une anomalie mais une journée sans encaissement, et le commerçant
n'a rien à en faire. Ce qu'il veut lire, c'est **qui tient la caisse** — la même
donnée que le ticket porte déjà en `sold_by` / `cashier_id`.

**Écarté — supprimer `OpenSessionDialog`, `useOpenCashSession` et
`/api/cash/session/open`.** Vérifié par grep : le dialogue n'avait qu'un
appelant, `CashModuleShell`. Ils sont **débranchés, pas effacés**, et le fichier
porte un en-tête qui dit pourquoi le remonter réintroduirait la saisie manuelle
du fonds. Même geste que pour le rapprochement espèces du v3 et le détail des
sessions du v4.

**Un défaut trouvé en débranchant.** Les invalidations de cache qui suivent la
création d'un ticket lisaient `variables.session_id` — désormais possiblement
absent, puisque c'est le backend qui ouvre la session. Elles lisent maintenant
la session du **ticket rendu**. Sans cela, le rapport X et le journal des
mouvements seraient restés périmés après une vente, **sans erreur**.

**Code mort signalé, non touché :** `TerminalHeader.tsx` affiche « Session
ouverte » et un `sessionIdShort`, et n'a **aucun appelant** — ni avant ni après
cette mission.

**Remise en cause si :** un poste doit pouvoir constater un écart de caisse en
milieu de journée et repartir d'un tiroir neuf. Le comptage n'ouvre plus de
nouvelle session ; il faudrait alors un geste distinct, qui n'existe pas.

## Le fonds de caisse ne se saisit plus : c'est le tiroir compté, sinon le théorique — 2026-08-29

**Décision.** L'`opening_float` d'une session n'est plus une saisie. Il vaut le
**dernier tiroir COMPTÉ**, augmenté des flux des journées écoulées depuis ; sans
aucun comptage en base, il vaut le **solde théorique**. Le calcul est
`FondsReporte` (`backend/reports/fonds_reporte.go`), appelé par `SessionDuJour`.

**La saisie n'apportait aucune information — mesuré.** Le fonds saisi EST déjà
le tiroir compté de la session précédente : 285,40 puis 263,01 se recopient
exactement d'une session à l'autre sur la base de production. Elle apportait en
revanche ses fautes : **0,50 € de frappe le 21/08** (198,20 saisi pour 198,70
compté), **32 fonds à zéro sur 65** alors que le tiroir précédent n'était pas
vide, et surtout les deux tiroirs **négatifs** de −154,04 € et −170,24 €
(`04-refonte-du-z.md` §7), où le fonds saisi était déjà net d'une remise que le
mouvement retranchait une seconde fois.

**Écarté — toujours le solde théorique**, ce que prescrivait la mission. Un
écart constaté le soir — compté 227,68 pour un théorique de 230 — se reporterait
**indéfiniment** au lieu d'être soldé le jour où il a été mesuré. Le comptage est
le seul point de contact avec le tiroir réel : on s'y ancre.

**Écarté — toujours le comptage.** **23 sessions sur 65 n'en ont aucun.** Le
fonds tomberait à zéro ces jours-là, c'est-à-dire exactement le défaut qu'on
répare.

**Aucune seconde implémentation du tiroir.** Les flux sont lus dans le journal
des espèces, chemin unique depuis le 28 août : ni les signes des mouvements, ni
le discriminant vente / tiroir ne sont réécrits. `JournalDesEspeces` a été
scindée en une enveloppe (signature `app` inchangée) et un cœur
`JournalDesEspecesDao` qui ne prend qu'un dao, parce que `SessionDuJour` n'a pas
d'app sous la main. C'est la règle de `aggregateZ`, appliquée au tiroir.

**Les FLUX seulement, jamais les soldes.** Le `SoldeOuverture` des journées
traversées n'entre pas dans le cumul : l'ajouter compterait comme un apport
l'argent déjà présent dans le tiroir. Un gardien le chiffre — **220 € attendus,
420 € si l'on se trompe.**

**Le fonds est borné à zéro.** Un tiroir négatif n'existe pas : un calcul qui en
produirait un signale une anomalie de données en amont, pas un fonds. On rend 0
plutôt que de la propager dans une session neuve, et le journal des espèces la
montre.

**Limite assumée :** un mouvement enregistré le jour du comptage mais APRÈS la
fermeture n'est pas repris dans le report. Il suppose qu'on encaisse après avoir
compté et fermé ; le comptage du lendemain le solde.

**Remise en cause si :** le comptage du tiroir, devenu facultatif en E-3, cesse
d'être fait pendant des semaines. Le report resterait juste — il retomberait sur
le théorique — mais plus rien ne le confronterait au réel.

## La session de caisse devient implicite, et aucune n'est jamais effacée — 2026-08-29

**Décision.** Les sessions de caisse sortent de l'usage : plus personne n'en
ouvre ni n'en ferme une à la main. Une session est ouverte **automatiquement au
premier encaissement de la journée** (`backend/session_du_jour.go`,
`SessionDuJour`), et c'est le nom de l'utilisateur connecté, non la session, qui
dit qui a encaissé. Une seule caisse, deux postes.

**Et la collection reste, avec tous ses enregistrements.** `recalculerRapport`
(`z_repair.go:224-231`) relit `session_ids` et **échoue si une session manque** :
effacer les `cash_sessions` rendrait les 60 rapports Z irréparables — plus de
vérification par recalcul, plus de correction, et `z-repair` renverrait 60
erreurs. C'est l'outil qui a réparé la régression du 20 mai et qui a servi trois
fois le 28 août. **On cache, on n'efface pas** — même geste que pour les
`total_cash_*` du v3 et le détail des sessions du v4.

**Le constat qui rend la refonte sûre**, mesuré le 29 août 2026 sur la base de
production, en lecture seule : **65 sessions, toutes fermées**, 0 ouverte, 0
fermée sans Z, **0 ticket sans session, 0 mouvement sans session**. Et 48
journées sur 56 (86 %) ne portent déjà qu'une session. La reprise des sessions
restées ouvertes — l'étape qu'on redoutait — est donc **sans objet**.

**Une porte se ferme, et elle perdait de l'argent.**
`CreateCashMovementIfEspeces` cherchait une session ouverte et **abandonnait en
silence** s'il n'en trouvait pas. Un encaissement espèces reçu hors session
n'était pas orphelin : il était **perdu**, aucun mouvement n'était écrit et le
tiroir ne le voyait jamais (`04-refonte-du-z.md` §2). Il ouvre désormais la
session du jour. Aucun cas en base aujourd'hui — mais 8 jours se sont écoulés
depuis la dernière session, du 21 au 29 août, avec de l'activité hors caisse.

**Le piège de `closed_at`, trouvé en lisant le code.** `GenerateRapportZ` ne
retient que les sessions dont le `closed_at` tombe **dans la journée du
rapport** (`cash_reports.go:1490-1496`). Une session de la veille fermée à
l'instant du premier encaissement du lendemain porterait un `closed_at` du
lendemain, et le Z de la veille ne la verrait plus : **ses tickets sortiraient
de toute clôture, sans erreur**. La fermeture par passage de journée pose donc
`closed_at` à la fin de la journée de la session, jamais à l'heure courante. Un
gardien le vérifie.

**Ce que le report du fonds va corriger, et il ne l'invente pas.** Le fonds
d'ouverture d'une session **est déjà** le tiroir compté de la précédente —
285,40 puis 263,01 se recopient exactement d'une session à l'autre. Mais à la
main : **0,50 € de faute de frappe** le 21/08 (198,20 saisi pour 198,70 compté)
et **32 sessions sur 65 à fonds zéro** alors que le tiroir précédent n'était pas
vide. Le report automatique (E-2) supprime les deux. Il partira du **solde
théorique** du journal des espèces, jamais du comptage : **23 sessions sur 65
n'ont aucun comptage**.

**Écarté — supprimer les `cash_sessions`.** C'était la lecture littérale de
« sortir des sessions ». Elle casse le rejeu des 60 Z, c'est-à-dire la seule
manière de vérifier et de corriger un document fiscal déjà remis.

**Écarté — `opened_by` comme « qui a encaissé » pour l'historique.** Les 65
sessions ne portent **qu'un seul** `opened_by` : le champ ne distingue personne
sur le passé. C'est `sold_by` / `cashier_id`, posés par ticket
(`pos_routes.go:376-379`), qui nomment le vendeur.

**Remise en cause si :** une seconde caisse apparaît. `SessionDuJour` résout
aujourd'hui « la caisse active de la société » et n'en attend qu'une ; deux
caisses simultanées demanderaient une session par caisse, ce que la fonction
sait faire (le paramètre existe) mais que les appelants ne renseignent pas
tous.

## Le journal des espèces, par journée, et la question D refermée — 2026-08-28

**Décision.** Le journal des espèces (ticket B-1 du contrat v3) existe :
`GET /api/reports/journal-especes`, écran `/stats/especes`. Il lit
**tous** les mouvements du tiroir — espèces des ventes comprises —, **par
journée**, et décompose le solde. Route locale, lecture seule : pas de nouvelle
sortie réseau.

**Pourquoi tous les mouvements, et pas seulement les libres.** C'est la seule
vue qui reconstitue le tiroir : `fonds + espèces des ventes + apports − sorties
− remises − remboursements`. Ne montrer que les 23 mouvements libres donnerait
un journal plus court dont le solde ne se vérifie contre rien.

**Le fonds d'ouverture est un SOLDE, jamais un flux.** Il est celui de la
première session ouverte ce jour-là, et il est affiché à part. Le compter comme
un apport ferait entrer chaque jour l'argent qui était déjà là la veille. Le
journal rend visible le défaut inverse — 7 Z portent un `total_cash_expected`
négatif, un fonds saisi déjà net d'une remise — mais ne le crée pas : un solde
négatif est affiché en rouge avec sa cause probable.

**Un seul signe pour un seul tiroir.** La ventilation suit exactement celle
d'`aggregateZ` : `cash_in` et `adjustment` entrent, `cash_out`, `refund_out` et
`safe_drop` sortent. Deux signes différents pour la même donnée, ce serait deux
vérités sur le même tiroir.

**Question D du contrat v3, refermée.** `isCashInFromSale` était morte depuis
des mois (aucun appelant). Elle est **supprimée** ; la règle vit dans
`estMouvementDeVente`, **branchée**, et son critère est `related_invoice` **OU**
`meta` — arbitrage du 27 août.

**Et un défaut trouvé en la branchant, qui ne s'était jamais vu.** `getMetaMap`
ne testait que `raw.(map[string]any)`, alors que PocketBase rend un champ JSON
en `types.JsonRaw` — des octets. Elle rendait donc **toujours nil**, et
`isCashInFromSale`, sa seule cliente, aurait classé **tous** les mouvements
comme « pas une vente ». Le défaut n'a jamais eu d'effet parce que la fonction
n'était jamais appelée : il en aurait eu un le jour où on l'aurait branchée.
Mesuré en la branchant : 0 mouvement de vente reconnu au lieu de tous.
`getMetaMap` décode désormais `JsonRaw`, `[]byte` et `string`.

**Écarté — un journal par session.** Cohérent avec le Z, mais une session peut
s'étendre sur plusieurs journées et le commerçant compte son tiroir par jour.
Arbitré le 27 août (§6 question B).

**Remise en cause si :** des mouvements apparaissent hors de toute session —
`CreateCashMovementIfEspeces` abandonne aujourd'hui en silence sans session
ouverte, et un tel mouvement est perdu, pas orphelin. Le journal, qui lit par
journée, les verrait le jour où ils existeraient.

## La liste du Z couvre les quatre lignes, comme le journal des ventes — 2026-08-28

**Décision.** `sales_documents` ne se limite plus à la ligne 1 : elle porte les
**quatre lignes** — ventes du jour, créances, acomptes, avoirs — et chaque pièce
porte son **heure**, son **client** et **sa ligne**, exactement comme le journal
des ventes. `schema_version` passe à **6**.

**Pourquoi les quatre lignes.** La liste explique alors le **total encaissé**,
qui est le nombre que le commerçant reconnaît, et non le seul chiffre
d'affaires. C'est déjà ce que fait le journal ; un Z qui listerait autre chose
que le journal, sur la même période, serait un second récit des mêmes faits.

**Un seul vocabulaire, parce qu'un seul code.** `Kind` vient de `natureDe`,
`Heure` de `heureDe` (`journal.go`), `Line` de `LigneZ.String()`
(`z_lignes.go`) — toutes déjà partagées. Le nom du client était la seule règle
en double : `resolveurNomClient` est extraite de `journal.go` et appelée par
`aggregateZ`. Deux résolutions auraient fini par diverger (un `company_name`
ici, un `firstname lastname` là) et les deux écrans auraient nommé
différemment le même document.

**Le montant listé est celui COMPTÉ, pas le total du document.** Pour une
facture parente amputée de ses acomptes, les deux diffèrent — c'est le
classificateur qui tranche, et la liste lit sa décision plutôt que de relire le
document. Corollaire : les pièces des lignes 2 à 4 n'ont **ni base HT ni TVA**,
ce qui interdit de les additionner à la ligne 1 depuis la liste, comme le
contrat du 23 août l'interdit depuis les totaux. Un gardien le vérifie.

**Une conversion de ticket n'est listée nulle part**, puisqu'elle n'est comptée
dans aucune ligne (`LigneAucune`). Elle ne doit pas se lire, sinon le lecteur la
compterait de l'œil.

**Le nom du client est FIGÉ à la clôture.** Un client renommé ou effacé gardera
son ancien nom dans les Z passés. C'est ce qu'on attend d'un document scellé —
il reflète ce qui a été comptabilisé — mais c'est une donnée nominative de plus
dans `z_reports`, sur un poste partagé. Accepté sciemment.

**Remise en cause si :** la liste devient trop longue pour un PDF envoyé au
comptable — auquel cas c'est la pagination qu'il faut traiter, pas le périmètre.

## Le Z porte lui-même la liste de ses pièces, et cesse d'affirmer quand la TVA est due — 2026-08-28

**Décision.** Le rapport Z stocke `sales_documents` — la liste des documents de
sa ligne 1, pièce par pièce — dans le document et **dans son hash**.
`schema_version` passe à **5**. Et le libellé « leur TVA a déjà été déclarée à
l'émission » est retiré des écrans : il affirmait une règle fiscale qui n'est
vraie que pour une partie des ventes.

**Pourquoi stockée, et non rechargée.** Le PDF listait déjà les tickets, mais en
interrogeant `/api/pos/session/:id/tickets` **au moment de l'impression**
(`usePrintReport.tsx`). Trois défauts, tous dans le même geste : la liste
imprimée était celle d'**aujourd'hui** et non celle qui avait été comptée ; un
document modifié après la clôture changeait donc le PDF **sans rompre le hash**
du Z ; et les factures hors caisse n'y figuraient pas, alors qu'elles sont dans
la ligne 1. Ce chargement est supprimé.

**L'ordre de la liste est du calcul, pas de la présentation.**
`FindRecordsByFilter` est appelée sans tri et PocketBase n'en promet aucun :
sans tri explicite (date, numéro, id), deux rejeux du même rapport produiraient
deux hash. Le tri est dans `aggregateZ`, et un gardien le vérifie.

**Écarté — rechargée à l'affichage.** Aucune migration, aucun rejeu, mais on
gardait un document scellé dont le contenu imprimé pouvait changer après coup.
C'est précisément ce que la chaîne d'intégrité existe pour interdire.

**Ce que le Z citait jusqu'ici.** Aucun numéro de pièce — mesuré le 28 août
2026, 0 occurrence de `FAC-…` dans les 60 `full_report`. Ce contrat change cela
délibérément : à partir de la v5, un Z **nomme** les pièces qu'il agrège.

**La TVA des créances : une affirmation trop générale.** Le code disait « sa TVA
a déjà été déclarée à son émission ». Vrai pour une **livraison de biens**
(exigible à la livraison), **faux pour une prestation de services**, exigible à
l'encaissement sauf option pour les débits (CGI art. 269-2). Le doute vient du
propriétaire, il est fondé.

**Le calcul n'est pas en cause :** la ligne 2 est en **TTC seul**. Le Z
n'affirme rien sur cette TVA, il refuse seulement de la remettre dans la
ligne 1 — position juste sous les deux régimes. Seule la **justification
écrite** change : « leur TVA relève de la période d'exigibilité du document
d'origine ». **Question ouverte au comptable** : si des prestations sont
concernées, le Z devra porter une TVA de ligne 2 qu'il ne calcule pas
aujourd'hui.

**Remise en cause si :** le comptable confirme que des prestations relèvent de
l'exigibilité à l'encaissement — la ligne 2 devra alors porter une base HT et
une TVA, ce qui rouvre la décision « les lignes 2 à 4 sont en TTC seul » du
23 août.

## Le Z sort le détail des sessions et compte ses documents de vente — 2026-08-28

**Décision.** Le rapport Z cesse d'afficher le bloc « Détail des sessions » et
`sessions_count` ; il affiche à la place **combien de tickets de caisse** et
**combien de factures hors caisse** composent sa ligne 1. `schema_version` passe
à **4**, les deux compteurs entrent dans le hash, et les rapports existants sont
rejoués.

**Pourquoi le détail des sessions part.** Un Z couvre la **période écoulée
depuis la clôture précédente**, pas sa seule date (`04-refonte-du-z.md`, §7, et
le commentaire de `GenerateRapportZ`). Une session peut donc s'étendre sur
plusieurs journées, et le détail par session donnait à lire un découpage qui
n'est pas celui du document. Comme le rapprochement espèces la veille, la donnée
n'est pas fausse : elle est **hors sujet dans un document fiscal**, et le PDF du
Z part chez le comptable. Elle aura sa propre statistique dans `/stats`, où un Z
étalé sur trois jours se relira en trois journées — décision du propriétaire,
c'est ce redécoupage qui rend le retrait sans perte.

**On cache, on n'efface pas.** `SessionSummary` reste calculée, reste dans
`full_report`, `sessions_count` reste stocké et haché. C'est la statistique qui
les relira. Même geste que pour les `total_cash_*` du v3.

**Ce que comptent les deux compteurs neufs.** `pos_ticket_count` = tickets de
caisse des sessions du Z ; `external_invoice_count` = factures hors caisse
**émises ET encaissées le jour**, celles que le classificateur range en
`LigneVentesDuJour`. Invariant, et il est testé :
`pos_ticket_count + external_invoice_count = invoice_count`. `invoice_count` ne
change ni de nom ni de valeur — il mêlait déjà les deux populations
(`cash_reports.go:1047` puis `:1198`) ; le v4 le **scinde**, il ne le corrige
pas.

N'entrent dans aucun des trois compteurs : les avoirs (ligne 4), les créances
(ligne 2), les acomptes (ligne 3), et les conversions de ticket en facture, que
`estConversionDeTicket` (`z_lignes.go:139-145`) range en `LigneAucune` — mesuré
le 28 août 2026 : 35 conversions payées, 6 581,36 €, exactement ce qui serait
compté deux fois sans cette règle.

**Écarté — « factures créées dans connect » au sens littéral.** Le module
`frontend/modules/connect` **n'écrit aucun marqueur d'origine** sur `invoices` :
le seul discriminant existant est `is_pos_ticket`
(`backend/hooks/invoice_hooks.go:402-409`). Compter « ce qui vient de connect »
aurait demandé un champ neuf, une migration et une reprise des 1204 documents
existants, qui n'en portent aucun — c'est-à-dire une donnée inventée
rétroactivement sur un document fiscal. « Hors caisse » est la seule lecture que
la base permet.

**Écarté — compteurs de simple affichage, calculés à la lecture.** Un Z scellé
doit se relire **sans recalcul** : recalculer aujourd'hui sur des documents qui
ont pu changer depuis, c'est exactement ce que la chaîne de hachage existe pour
interdire. D'où : dans le hash, `schema_version = 4`, rejeu par `z-repair`.

**Écarté — un prédicat par égalité (`=== 4`).** Deux branchements seulement,
`RapportZPage.tsx` et `ZReportPDF.tsx`, et par **seuil** — `estZSansDetailSessions`
et `estZCompteLesDocuments`, `>= 4`. Une égalité afficherait un futur rapport v5
comme un v1, sans erreur.

**Aucun montant ne bouge.** Le v4 n'ajoute que deux entiers et retire de
l'affichage un bloc déjà calculé. Le rejeu ne déplace pas un centime ; il refait
60 hash, mécaniquement, parce que `schema_version` est haché.

**Remise en cause si :** la statistique des sessions (ticket C) montre que le
découpage par journée perd une information que seul le découpage par session
portait.

## Les 114 numéros de facture en double sont renumérotés — 2026-08-28

**Les 228 documents portant un numéro déjà utilisé ont été séparés : le premier
émis garde son numéro, les 114 autres passent à la suite de leur série.**
`FAC-2026-` va désormais jusqu'à `000279`, `FAC-2025-` jusqu'à `000028`.
Appliqué en production le 28 août 2026, application fermée, après sauvegarde
dans `pb_data-sauvegarde-avant-RENUM-20260828-115440`.

**Ce n'étaient pas des doublons de saisie.** Les 114 paires ont toutes des
dates ET des montants différents : 228 factures réelles et distinctes.
Supprimer l'une d'elles aurait détruit une vraie facture. Mesuré : les numéros
avaient été attribués une première fois de décembre 2025 à avril 2026, puis
réattribués depuis 1 entre juin et août 2026.

**La cause était déjà fermée** (`backend/numbering`, tri sur `-number`, refus
d'inventer). Ces 228 documents étaient les séquelles, que rien n'avait
reprises : `facture-doublons` est un diagnostic sans `-apply`, par choix.

**Résultat, mesuré avant/après :** 114 → **0** numéro en double, **1204
documents** (aucun perdu), somme TTC **120 305,72 € inchangée au centime**, et
la chaîne de hachage passe de **1 maillon rompu à 0** — la rupture du
10/12/2025, où `FAC-2025-000004` portait le GENESIS_HASH, est réparée au
passage. 1196 documents rehachés, 0 erreur, « toute la chaîne est intègre ».

**Trois erreurs de documentation corrigées en chemin, chacune mesurée.**

1. **`facture-doublons` criait au loup.** Son §1 simulait l'ANCIEN hook, trié
   sur `-sequence_number`, et annonçait « la prochaine facture sortira sur un
   numéro DÉJÀ UTILISÉ » alors que la cause était fermée. La fausse alerte
   vivait sur l'outil même qu'on consulte pour savoir si le problème est réglé.
2. **La chaîne de hachage est GLOBALE, tickets compris.** `getLastInvoice`
   (`invoice_hooks.go:1287`) ne filtre que sur `owner_company` et trie sur
   `-sequence_number`. Mesuré : la chaîne globale portait **1 maillon rompu sur
   1198**, celle « sans tickets POS » en portait **209** — c'est la première qui
   existe. **`migrate_invoices_only.go` est donc inadapté** à toute reprise de
   chaîne : il aurait réécrit 369 documents sur une chaîne fictive. Le bon
   chemin est `hash.MigrateRecalculateAllHashes`.
3. **Les rapports Z ne citent aucun numéro de pièce.** Les deux outils
   annonçaient qu'un `z-repair -apply` serait nécessaire ensuite. Mesuré : **0
   occurrence de `FAC-…` dans les 60 `full_report`**, et un `z-repair` lancé
   après renumérotation sur copie n'a réécrit **aucun** rapport. Un Z agrège des
   montants, il ne cite pas ses pièces.

**Un paquet partagé plutôt que deux règles.** `backend/renumbering` porte le
plan, utilisé par `facture-doublons` (qui le montre) ET `facture-renumeroter`
(qui l'exécute) : écrire la règle deux fois, c'est accepter qu'un jour l'une
renumérote autrement que ce que l'autre annonçait, sur des documents fiscaux
déjà remis. Même consigne que pour `aggregateZ` et `backend/numbering`. Six
gardiens dans `renumbering_test.go`.

**Options écartées.**

- **Supprimer un document de chaque paire** : ce sont des factures distinctes,
  pas des copies.
- **Combler les trous de la série** : un numéro remis à un client lui
  appartient ; le rendre à un autre document produirait deux pièces différentes
  portant la même référence chez deux clients — ce qu'on répare.
- **Renuméroter le plus ancien** : c'est celui dont le papier circule depuis le
  plus longtemps.

**Ce qu'il faut savoir et assumer.** Les 114 documents renumérotés ont été
remis à des clients avec leur ANCIEN numéro imprimé dessus : la base et le
papier divergent pour ceux-là. C'est inévitable — deux pièces ne peuvent pas
garder le même numéro — et c'est le prix de la réparation, accepté par le
propriétaire le 28 août 2026.

---

## Le rapport Z ne porte plus le rapprochement espèces — 2026-08-27

**Le Z devient un document purement fiscal : un total, quatre lignes, la TVA.
Le tiroir en sort — attendu, compté, écart, et leur déclinaison par session
disparaissent de l'écran et du PDF.** `schema_version` passe à **3**.

**Pourquoi.** Un apport de fonds n'est ni une vente, ni un encaissement de
vente. Décision du propriétaire, mesurée avant d'être appliquée
(`frontend/modules/cash/PocketCash-docs/05-le-z-v3-et-le-journal-especes.md`,
sur copie lecture seule de la base de production).

**Ce que la mesure a établi.** Les mouvements de caisse ne touchaient **déjà**
aucune des quatre lignes : `collectedTTC` vaut `totalTTC + créances + acomptes
− avoirs` (`cash_reports.go:1241`), et `z_lignes.go` classe des documents,
jamais des mouvements. Ils n'alimentaient que `expectedCash` (`:1032`), et le Z
n'en stockait aucun champ. Le retrait ne déplace donc **pas un centime** :
simulation sur les 60 rapports, **0 aux montants corrigés**, 60 enrichis, cumul
encaissé inchangé à 95 216,85 €, toutes lignes équilibrées.

**Le rapprochement ne disparaît de nulle part.** Il reste là où on le vérifie :
`CloseSessionDialog.tsx:376-408` l'affiche **au moment du comptage du tiroir**,
en lisant le rapport X comme source de vérité, et `ExpectedCashCard`
(`RapportXDialog.tsx:202`) le porte déjà décomposé — fonds, ventes espèces,
mouvements, total. Son détail ligne à ligne ira au journal espèces de `/stats`.

**Les trois champs `total_cash_*` restent calculés et stockés.** Ils sont
justes, portent 2 930,08 € d'écart cumulé, et **n'ont jamais été hachés**
(`computeZReportHash` ne les contient pas ; `z_repair.go:189` l'écrit). Les
effacer d'un document scellé serait détruire de la donnée sans y être
contraint. Le contrat dit qu'on ne les **montre** plus, pas qu'ils n'existent
plus — d'où un prédicat de seuil, `estZSansRapprochementEspeces` (`>= 3`,
jamais `=== 3`), et deux branchements seulement : `RapportZPage` et
`ZReportPDF`. Le dialogue X n'en est pas un : il n'est pas un document scellé.

**Options écartées.**

- **Retirer les mouvements libres de l'attendu** tout en gardant le
  rapprochement dans le Z : **+7 686,14 € d'écart FICTIF sur 17 rapports**,
  dont cinq au-dessus de 900 €. Le `Z-2026-000034`, ramené à 1,35 € d'écart au
  prix de trois outils et d'une sauvegarde le 24 août, serait reparti à
  301,35 €. Le rapprochement est une équation de tiroir : chacun de ses termes
  y est indispensable quelle que soit sa nature comptable.
- **Afficher le tiroir décomposé dans le Z** (recommandation du §3.2 du
  contrat) : écartée par le propriétaire — la fiscalité n'en a pas besoin, et
  le X porte déjà cette décomposition.
- **Poser `cash_from_sales` et `cash_drawer_movements` sur `z_reports`**
  (ticket V-1) : **abandonné**. Leur seul objet était de décomposer un attendu
  affiché ; sans affichage, aucun lecteur — et le journal espèces, décidé **par
  journée**, lira les `cash_movements` directement, pas les `z_reports`. Pas de
  migration : le champ `schema_version` existe depuis
  `z_reports_collected.go`.
- **Effacer les trois champs du rapprochement** : non demandé, et destructeur
  sur 60 documents scellés.

**Ce qui pourrait la remettre en cause.** Le jour où le journal espèces
n'existe toujours pas et où un écart de caisse doit se constater a posteriori
sur un document scellé : le Z ne le dira plus, seule la session le dira.

---

## PocketApp pose aussi le slug des catégories — 2026-08-27

**Une catégorie créée dans PocketApp reçoit désormais son slug dans la couche
d’accès, avant l’écriture PocketBase, par la même règle que les produits.** Le
serveur du site continue de ne rien inventer, et un slug non vide ne se
retouche jamais.

**Cause établie.** `useCreateCategory` posait `legacy_id`, mais aucun slug ;
`toExportCategory` transmettait ensuite la chaîne vide sous forme `null`. Le
PHP respectait le contrat en la conservant, puis la lecture publique rendait
une catégorie sans adresse. Ce n’est donc ni une règle d’export ni un défaut à
corriger côté site.

**Mesuré en lecture seule dans la base active le 27 août 2026 :** 462
catégories, **une seule sans slug**, « La catégorie du Test ». Elle est citée
directement par un produit publié. La base porte **198 catégories directement
citées** et **206 destinées au site** en comptant leurs ancêtres.
`BackfillCategorySlugs`, migration idempotente inscrite dans `RunMigrations`,
lui donne `la-categorie-du-test`. Une empreinte de catégorie change donc ; cette
catégorie repasse « modifiée » et doit être renvoyée.

**Écarté — fabriquer le slug dans `products-sync.php` ou dans le site :** le
serveur recevrait alors une question au lieu du résultat décidé par PocketApp,
en contradiction avec le §2 du contrat catalogue. **Écarté — recalculer au
renommage :** cela déplacerait une page déjà indexée. **Écarté — ne corriger
que la ligne observée :** une installation portant une autre catégorie vide
resterait cassée ; le backfill traite la propriété, pas l’exemple.

**Ce qui pourrait la remettre en cause :** une opération explicite de
changement d’URL, avec redirection et reprise des liens. Elle n’existe pas
aujourd’hui.

---

## `solde` / `promo` sont un champ à part, pas des valeurs de `commercial_state` — 2026-08-27

**L'état commercial d'un produit se dit désormais sur DEUX axes indépendants.**
`commercial_state` (`used` / `rental`, vide = neuf) dit ce que l'objet EST ;
`sale_state` (`sale` / `promo`, vide = normal) dit l'OPÉRATION commerciale en
cours. Posé par `AddSaleStateToProducts`
(`backend/migrations/add_sale_state_to_products.go`).

**Ce qui l'a emporté.** `commercial_state` est MONO-VALEUR, et ce choix repose
sur une mesure précise : aucun produit n'est à la fois en occasion et en
location, 0 sur 3055 (bloc du 2026-08-24). Cette mesure ne dit rien de
`solde`/`promo`, et le magasin dit l'inverse : **un instrument d'occasion soldé
est un cas ordinaire.** Verser `sale`/`promo` dans le même select le rendrait
inexprimable — il faudrait choisir entre « occasion » et « soldé ».

**Options écartées.** Passer `commercial_state` à `MaxSelect: 2` : le tableau
mélangerait deux axes de nature différente, et chaque écran devrait deviner à
la lecture quelle valeur relève de quel axe — un filtre « occasions » ramènerait
les soldes dès qu'on se tromperait d'index. Deux booléens `is_sale` /
`is_promo` : autorisent « soldé ET en promo », qui n'a pas de sens, et deux
champs à tenir au lieu d'un. Un champ de remise chiffrée tout de suite : la
demande est une ÉTIQUETTE, pas un prix ; `price_ttc` reste le prix de vente.

**Les deux axes n'ont pas la même durée de vie**, et c'est l'argument de fond :
la nature d'un objet ne change qu'une fois — on le reprend d'occasion —, alors
qu'une opération commerciale se pose et se retire par campagnes.

**L'absence vaut « normal »**, comme l'absence de `commercial_state` vaut
« neuf » : le champ n'est pas `Required`, sinon il faudrait écrire les ~3000
fiches du catalogue pour n'exprimer que « rien de particulier ».

**Ce champ ne décide PAS de la publication** — `status` seul (bloc du
2026-08-21). Croiser les deux ferait disparaître des pages sans que rien ne le
dise.

**IL PART VERS LE SITE, et le ré-export intégral est ASSUMÉ.** Décision du
propriétaire, le même jour, après remontée du coût : `sale_state` entre dans
`site-catalog.ts`, dans `toExportProduct` et donc dans le checksum. Or
`canonical()` sérialise TOUTES les clés du corps : ajouter celle-ci a changé
l'empreinte de **chaque** produit, et **les 2412 fiches publiées sont repassées
« modifiées » et reparties en une fois**. Ce n'est pas un défaut — c'est le prix
payé sciemment, une fois. **Retirer la clé pour « réparer » le repaierait
à l'identique.** C'est la même mécanique que la note sur `site_title`
(`frontend/modules/site/lib/catalog-export.ts`), à ceci près qu'ici on a
tranché.

`commercial_state`, lui, **ne voyage toujours pas** : le contrat ne le connaît
pas. Gardien des deux règles :
`frontend/lib/queries/catalog-fields.test.ts`.

**Ce qui pourrait la remettre en cause :** la demande d'une remise CHIFFRÉE
(montant ou pourcentage, avec des dates de campagne) — ce serait des champs de
plus, pas des valeurs de plus ici. Et la symétrie : le jour où le site voudra
une vue « occasions », c'est `commercial_state` qu'il faudra ajouter au
contrat — au même prix, et il devra être assumé de la même façon.

---

## La synchro se propose à l'enregistrement, et deux caches la faisaient mentir — 2026-08-26

**La décision.** Enregistrer un produit **déjà en ligne** propose désormais de
le synchroniser, dans un dialogue court : deux cases — la fiche, les images —,
deux boutons. « Synchroniser » empile un travail dans la file
(`frontend/lib/sync/SyncQueueProvider.tsx`) et rend la main ; c'est le toast
persistant qui raconte la suite. Le composant est
`frontend/lib/sync/SyncAfterSaveDialog.tsx`, rangé dans `lib/sync/` et non dans
`modules/stock/` : il ne connaît rien du formulaire produit, et la future fiche
produit le réutilisera tel quel. **`stock` importe donc de `site`, jamais
l'inverse.**

Le dialogue ne s'affiche QUE si l'inventaire distant connaît le `legacy_id` de
la fiche. Jamais exporté, inventaire injoignable, création : silence. « Plus
tard » ne perd rien — le produit reste `modified` dans la bande de synchro, le
dialogue est un raccourci, jamais le seul chemin. **Aucune préférence « ne plus
demander »** n'a été ajoutée : on veut d'abord voir si la question rassure ou
agace.

**Écarté :** synchroniser automatiquement à l'enregistrement. Un envoi vers le
mutualisé n'est pas un effet de bord d'un clic sur « Enregistrer », et la case
images doit rester un choix — calculer une empreinte LIT LES OCTETS.

### Deux caches faisaient échouer l'envoi en silence, et ils se reprendront

Le mécanisme a été écrit d'un bloc et n'a **rien envoyé du tout** pendant trois
essais, sans jamais lever d'erreur visible. Deux causes, toutes deux mesurées,
toutes deux invisibles depuis `/site/catalogue` — l'écran où le mécanisme avait
été mis au point :

**1. `ensureQueryData` rend le cache, même invalidé.** Lu dans la version
installée (`node_modules/@tanstack/query-core/build/modern/queryClient.js`) :
dès qu'une donnée existe, elle est rendue telle quelle ; `revalidateIfStale` ne
déclenche qu'une revalidation **en arrière-plan**, qui ne change pas
l'instantané rendu à l'appel en cours. Les requêtes catalogue ont
`staleTime = 5 min`. La file exportait donc le produit **d'AVANT
l'enregistrement** ; le serveur stockait fidèlement ce checksum-là
(`products-sync.php` ne recalcule rien), et `/site/catalogue`, qui relit
vraiment, calculait celui d'APRÈS. D'où « modifié » après un export à zéro
refus, et une page publique inchangée. Le correctif est `fetchQuery`, dont
`isStaleByTime` est vrai dès qu'une requête est invalidée : il refait l'appel
après un enregistrement et sert le cache quand il est réellement frais.
**Ne pas remettre `ensureQueryData` en croyant optimiser.**

**2. Le SDK PocketBase auto-annule deux requêtes de même chemin.** La clé
d'annulation se dérive de la méthode et du chemin, pas des paramètres : les
listes « publiés » et « brouillons » ne diffèrent que par leur `filter`, donc
elles la partagent. Lancées ensemble par le `Promise.all` de la file, la seconde
tuait la première — « The request was autocancelled ». D'où un `requestKey`
explicite sur les trois options de `site-catalog.ts` ; celles des catégories et
des marques en portent un aussi, le module `stock` lisant les mêmes collections
de son côté.

**Pourquoi ni l'une ni l'autre ne s'était vue :** depuis `/site/catalogue`, les
listes sont déjà en cache et actives — `ensureQueryData` rendait la bonne
valeur, et aucun chargement concurrent ne partait. Les deux pannes n'existent
que lorsque la file est déclenchée **depuis un autre écran**, ce qui n'était
possible d'aucun endroit avant ce chantier.

### Une file qui n'envoie rien doit le dire

Trois trous fermés dans `SyncQueueProvider.tsx`, du même genre : un produit qui
ne se résout pas dans le catalogue est un échec nommé et non une sélection vide ;
le cas « rien du tout » affiche « Rien n'a été envoyé » au lieu de refermer le
toast en silence ; et la boucle a désormais un `catch` — l'erreur de préparation
s'échappait en promesse non gérée pendant que le bilan concluait normalement.
C'est ce silence, plus que les caches, qui a coûté le temps de diagnostic.

**Ce qui pourrait remettre en cause :** une montée de TanStack Query changeant
la sémantique de `fetchQuery`, ou une évolution du SDK PocketBase sur les clés
d'auto-annulation. Les deux se rejugent au même endroit : la boucle de
`SyncQueueProvider.tsx` et les options de `site-catalog.ts`.

---

## Le pont des identifiants n'avait jamais été rompu — 2026-08-25

**Correction d'un fait, et donc d'une règle.** Le bloc du 24 août ci-dessous
affirme que les `_id` NeDB ont été régénérés. **C'est faux.** La mesure
comparait deux listes dont l'une gardait un retour chariot de fin de ligne :
aucune chaîne ne pouvait correspondre, et « 0 sur 3000 » était un artefact.

**Le décompte exact est 2982 sur 3000** : les `_id` NeDB SONT les clés stables,
posées par l'import du 11 août et jamais bougées depuis. Le pont
`PB-PROD.product_id == NeDB._id == PB-DEV.legacy_id` est direct.

**Ce que la décision de conserver les clés devient.** Elle reste juste, mais
elle est presque automatique : le chargeur écrit `legacy_id = <_id NeDB>` depuis
toujours. `cles-stables.json` ne sert qu'aux **46 produits** dont l'`_id` n'est
pas une clé connue — 18 retrouvés par SKU, 28 réellement nouveaux. C'est un
filet, pas le pont.

**En revanche l'ORDRE d'application est devenu critique, et il a été mis à
l'endroit après un échec d'écriture sur copie** : `UNIQUE constraint failed:
products.legacy_id`. La règle est **identité, puis SKU, puis nom**. Un SKU peut
changer de propriétaire — le dédoublonnage du 25 août a laissé « QSC CB10 » au
bundle et renuméroté l'enceinte : avec le SKU en premier, la clé de l'enceinte,
donc son dossier d'images en ligne, partait au bundle. Le SKU décrit ce qu'on
vend ; l'identifiant décrit la fiche. Quand les deux se contredisent, c'est
l'identifiant qui dit la vérité sur ce qui est déjà en ligne.

**Le contrôle porte désormais sur le `legacy_id` FINAL**, pas sur les seules
clés attribuées : un produit devancé conserve son `_id`, qui peut heurter la clé
retenue par un autre. C'est précisément ce que l'index unique a refusé.

**Ce que l'erreur a coûté, et ce qu'elle a rapporté.** Coûté : une table de
clés largement redondante, et un raisonnement (a)/(b) construit sur une prémisse
fausse. Rapporté : la mesure des instantanés d'historique — `inventory_entries`
porte 2441 SKU sur 2465 lignes, `product_events` 2860 sur 2963 — qui prouve que
même si le pont cassait un jour, l'historique resterait recollable à 96,7 %. Et
la certitude que `grep product_id backend/reports/` ne rend rien : aucun lien
produit n'entre dans un calcul fiscal.

**Ce qui pourrait la remettre en cause :** une future régénération des `_id`
NeDB, qui ferait de `cles-stables.json` le pont principal. Elle ne s'est pas
produite ; si elle se produit, c'est l'ordre des passes qui devra changer.

---

## La reprise CONSERVE les clés stables existantes — 2026-08-24

**— partiellement corrigée le 2026-08-25 par « Le pont des identifiants n'avait
jamais été rompu » : la prémisse sur les identifiants régénérés était fausse.**

**Décision du propriétaire.** L'import de reprise reprend les `legacy_id` déjà
en service plutôt que d'en générer de neufs. La correspondance est figée dans
`backend/catalog/mapping/cles-stables.json`, extraite de la PocketBase de
développement : jointure par SKU, puis par nom **s'il est unique**.

**Ce qu'une clé neuve aurait coûté.** Le miroir d'images distant nomme son
arborescence `<kind>/<legacy_id>/…`. Régénérer les clés rendait orphelin tout ce
qui est en ligne — marques, catégories et 2412 produits, ~1,5 Gio — sans que le
ménage distant puisse jamais les reprendre : il n'efface que dans le dossier
d'une entité qu'on lui envoie. On aurait payé un ré-envoi complet pour laisser
un doublon permanent sur le mutualisé. Conserver les clés annule ce coût entier,
et le pont `legacy_id` des lignes de facture survit à 90 %.

**Mesuré à la simulation : 2898 clés reprises par SKU, 128 par nom, 29 neuves.**

**Une clé neuve est un moindre mal ; une clé FAUSSE est un dégât.** 25 noms
désignent plusieurs produits et sont écartés de la table : joindre dessus
donnerait à un produit le dossier d'images d'un autre, en ligne, sans qu'aucune
erreur ne soit levée. En cas de doute, on ne joint pas.

**Ce que la simulation a découvert, et qui bloque : 33 SKU sont portés par deux
fiches NeDB différentes** — 68 produits, 35 collisions de clé. Ce sont de vrais
doublons de saisie, l'une des fiches portant souvent le SKU en guise de nom
(« MXR M108S » / « Pédale équalizer MXR - MXR M108S »). Ils invalident au
passage le décompte « 63 produits à créer » du premier état des lieux : ce ne
sont pas des nouveautés.

**`Plan.Bloquant()` refuse donc l'application tant qu'une collision subsiste**,
et c'est la SEULE chose qui bloque. Les produits sans rayon et les lignes à
arbitrer, eux, ne bloquent pas : ce sont des dettes chiffrées et visibles, qu'une
reprise peut assumer. Une garde qui refuse tout ne protège de rien.

**Options écartées.** Laisser le premier réclamant garder la clé : « premier »
dépend de l'ordre de lecture, donc le gagnant aurait changé d'une exécution à
l'autre. Générer une clé neuve pour les deux : orphelinise le dossier d'images
qui existe déjà. Lire la base de dév à chaque exécution plutôt qu'une table
figée : le résultat dépendrait d'une base absente du dépôt, que personne ne
relit, et qui peut bouger entre la simulation et l'application — c'est-à-dire
entre le moment où l'on vérifie et celui où l'on écrit.

**Ce qui pourrait la remettre en cause :** le dédoublonnage des 33 paires. Il se
fait dans AppPos — **jamais depuis PocketApp, qui n'y écrit pas** — ou par un
arbitrage clé par clé consigné dans la table.

---

## L'état commercial sort de l'arbre : `Occasion` et `LOCATION` deviennent un champ — 2026-08-24

**Décision du propriétaire.** Les catégories `Occasion` (10 produits) et
`LOCATION` (9 produits) ne seront pas reprises comme branches de la nouvelle
arborescence. Elles deviennent `commercial_state` sur `products` — un `select`
mono-valeur, `used` ou `rental` — posé par `AddCommercialStateToProducts`.

**Ce qui l'a emporté.** L'arbre cible est LOGISTIQUE : une catégorie dit ce que
l'objet EST, ce qu'on range, ce qu'on compte, ce qu'on réassortit. Ces deux-là
disaient comment il se VEND. Les garder force un choix sans bonne réponse —
ranger un ukulélé d'occasion avec les ukulélés, ou avec les occasions ? On veut
les deux, et surtout on veut inventorier les ukulélés sans en oublier neuf.

**La mesure qui a rendu le défaut visible : 18 des 19 produits concernés n'ont
AUCUNE autre catégorie** (NeDB de production, 24 août 2026). L'état commercial
avait mangé le rangement — c'est exactement le symptôme, et il se paie
maintenant : ces 19 produits doivent recevoir un rayon un par un, seul travail
produit-par-produit de toute la reprise.

**Mono-valeur, et ce n'est pas un pari :** aucun produit n'est à la fois en
occasion et en location, 0 sur 3055. PocketBase stockant un `select` en tableau
JSON quel que soit `MaxSelect`, passer à 2 le jour où le cas se présente est
une migration d'une ligne, sans réécriture. Partir d'un multi-valeurs « au cas
où » coûterait tout de suite, dans chaque écran et chaque filtre, un cas qui ne
s'est jamais produit.

**L'absence vaut « neuf ».** Le champ n'est pas `Required` : imposer une valeur
obligerait à écrire 3036 enregistrements pour n'exprimer que « rien de
particulier ».

**Ce champ ne décide PAS de la publication.** C'est `status` qui tranche, et lui
seul (bloc du 2026-08-21). Croiser les deux ferait disparaître des pages sans
que rien ne le dise.

**Options écartées.** Deux booléens `is_used` / `is_rental` : autorisent
l'état incohérent « les deux », qu'aucune donnée ne réclame, et deux champs à
tenir au lieu d'un. Garder les catégories ET ajouter le champ : la double
source revient, et c'est précisément ce que la refonte supprime. Réutiliser
`type` (`simple` / `service`) : il dit la nature du produit, pas son état ; les
9 `service` sont des prestations, pas des locations.

**Ce qui pourrait la remettre en cause :** un instrument d'occasion mis en
location — le premier cas fera passer `MaxSelect` à 2. Et l'exposition au
site : `commercial_state` n'entre aujourd'hui ni dans le contrat catalogue ni
dans le checksum d'export, donc rien n'en part. Le jour où le site voudra une
vue « occasions », c'est le contrat qu'il faudra ouvrir.

---

## Dépublier un produit, c'est l'exporter en `draft` — 2026-08-21

**Le retrait d'une page du site est un EXPORT, pas une suppression.**
`products-sync.php` accepte désormais `status = "draft"` et l'écrit tel quel ;
`catalog.php` ne servant que `published`, la page disparaît. La ligne SQL, elle,
reste : `first_seen_at`, images et rattachements survivent, et republier remet
la fiche en ligne telle quelle.

**Le trou qu'elle bouche.** Repasser un produit en brouillon dans PocketApp le
faisait sortir de `usePublishedProducts` (filtre `status = "published"`), donc
de l'écran, donc des compteurs, donc de l'export — pendant que sa ligne SQL
gardait `published`. Le site continuait de le servir, sans qu'aucun bouton ne
puisse rattraper l'écart. Constaté par le propriétaire sur une guitare Iberia
C5 : « 2564 sur le site, 2563 à jour, 0 à envoyer ». Trois verrous en série, et
c'est ce qui l'avait rendu invisible : l'écran ne voyait plus la fiche,
`toExportProduct` écrivait `status: 'published'` **en dur**, et le PHP refusait
tout autre statut. Chacun était défendable seul ; ensemble ils fermaient la
porte.

**Ce qui fait marcher le mécanisme : `status` entre dans le checksum d'export.**
Une fiche passée en brouillon devient donc `modified` d'elle-même, part avec le
lot, et l'empreinte alors stockée la rend `synced`. Le compteur retombe à zéro
seul, sans que rien n'ait à mémoriser l'opération — pas de table de retraits, pas
de drapeau, pas d'état à réconcilier.

**Options écartées.** Une action `DELETE` au contrat : elle détruirait
`first_seen_at` et les images, et republier repartirait de zéro ; le contrat n'a
aucune opération destructrice et n'en veut pas. Un `UPDATE` manuel sur la base
distante : répare un cas, laisse le trou. Faire décider le serveur (« ne pas
écrire ce qui n'est pas publiable ») : §2 du contrat le lui interdit, la règle
de publication vit dans PocketApp.

**Ce qui pourrait la remettre en cause :** un produit SUPPRIMÉ de PocketBase,
pas seulement dépublié, reste hors d'atteinte — plus aucune fiche locale ne
porte son `legacy_id`, donc rien ne peut envoyer son retrait. Le cas n'est pas
traité et ne l'est volontairement pas tant qu'il ne s'est pas présenté.

---

## `first_seen_at` : le site aura une vraie date d'arrivée, mais seulement pour l'avenir — 2026-08-20

Décision du propriétaire, le jour même, **annulant l'option 2 du bloc
ci-dessous** (« écarté : ouvrir `first_seen_at` tout de suite »).

**Une colonne `first_seen_at` est ajoutée à `ax_products`**
(`server/sql/first-seen.sql`), écrite au seul `INSERT` de `products-sync.php`
et **absente de son `ON DUPLICATE KEY UPDATE`**. Cette absence n'est pas un
détail d'implémentation : c'est le mécanisme entier. L'y ajouter en ferait un
second `exported_at`, sans que rien ne le signale.

**Ce qu'elle vaut, et il faut le dire d'emblée : elle ne rattrape rien.** Les
2563 produits déjà en base resteront `NULL` pour toujours — ils sont déjà là,
chacun de leurs exports passe donc par la branche `UPDATE`. Aucun rattrapage
n'est possible, la date d'arrivée réelle n'existant nulle part dans la chaîne
(`frontend/modules/site/PocketSite-docs/13-dates-produits.md`).

**C'est précisément ce qui la rend exacte** : `first_seen_at` non nul veut dire
« apparu sur le site ce jour-là », et rien d'autre. `catalog.php?action=latest`
trie donc `first_seen_at IS NULL` d'abord — les vraies arrivées en tête, le
fond de catalogue derrière, classé par `exported_at`.

**Options écartées :** remonter `dateSoumission` depuis NeDB (quatre couches,
une version de contrat, et on n'a toujours pas tranché si le champ veut dire
« créé » ou « soumis pour la dernière fois ») ; attendre le `created` de
PocketBase (ne rattrape pas davantage l'historique, et arrive plus tard).

**Ce qui a emporté la décision : le calendrier.** Chaque export qui passait
sans cette colonne était un lot de produits dont on ne pourrait jamais dire
quand ils sont arrivés.

**Ordre de déploiement, et il n'est pas commutatif :** le `ALTER TABLE`
d'abord, `products-sync.php` ensuite, `catalog.php` en dernier. Déposer
`catalog.php` avant l'`ALTER` fait répondre `action=latest` « Lecture du
catalogue impossible » — la colonne n'existerait pas.

---

## L'accueil du site est branchée sur `catalog.php` — et la faille 3.1 n'a pas la cause qu'on lui prêtait — 2026-08-20

Trois actions ajoutées à `server/api/catalog.php` le même jour — `stats`,
`brands`, `latest` — pour que la page d'accueil du site cesse de dépendre de
WooCommerce : bandeau de chiffres, carrousel de marques, aperçu du catalogue.
Détail et règles de comptage au §6 bis du contrat
(`frontend/modules/site/PocketSite-docs/12-contrat-catalogue.md`).

**Deux arbitrages ont été tranchés en écrivant, et ils tiennent ensemble :**

1. **`stats` compte ce que le SITE expose**, pas ce que la caisse porte —
   produits `published`, marques et catégories portant au moins un produit
   publié. Écarté : compter toutes les lignes des trois tables, demandé en cours
   de session puis retiré. Annoncer 287 marques quand le site en montre 218
   serait le défaut même qui avait fait masquer ce bandeau le 13 août.
2. **`latest` trie sur `exported_at`, faute de mieux, et le libellé du site le
   dit** : « Dernières mises à jour du catalogue », jamais « Nouveautés ». Une
   vente redate un produit — l'empreinte d'export couvre `stock` et
   `price_ttc`. Écarté : ouvrir `first_seen_at` tout de suite. Le sujet reste
   entier (`13-dates-produits.md`), et **le tri actuel donne l'illusion qu'il
   est traité**.
   *— ce point 2 annulé le 2026-08-20, quelques heures plus tard, par
   « `first_seen_at` : le site aura une vraie date d'arrivée, mais seulement
   pour l'avenir ». Le tri de `latest` a changé avec lui.*

**Ce qui pourrait la remettre en cause :** une vraie date de première parution.
Seul l'`ORDER BY` de `catalog.php` changerait.

### L'audit de découplage du même jour, qui corrige une affirmation

Les dix importateurs de `services/woocommerce.js` ont été suivis un par un sous
`VITE_USE_AXE_CATALOG=true` : **aucun n'est atteignable**. Le `README.md` de
PocketSite-docs affirmait que `HeroContent.jsx` monte `SoldesCarousel` et que
c'était la cause des clés dans le bundle. **C'est faux** : la slide « soldes »
est en commentaire (`config/components.js:107-109`), aucun appel `wc/v3` ne part
du site.

**La faille 3.1 est intacte pour une autre raison** : `App.jsx` importe
statiquement `services/woocommerce.js` et les quatre pages WooCommerce. Le code
mort part dans le bundle avec les clés. **Couper les appels ne referme donc
rien** — c'est le code qu'il faut sortir du bundle, ou les clés du code.

Deux restes mesurés : `SoldesCarousel` ne tient qu'à du code commenté, pas à un
drapeau ; et `wp-json/wp/v2/site-data` est appelé sans condition à chaque
chargement de page, alors qu'il répond `200` **sans authentification** — le
`VITE_WP_APP_PASSWORD` qu'`axios` y pose part dans le bundle pour rien.

---

## Les images en ligne se rangent par `legacy_id`, pas par l'identifiant PocketBase — 2026-08-19

Décision du propriétaire, en préparant la mise en ligne des images.

**L'arborescence distante des images est nommée par `legacy_id`** — la clé
stable de l'entité —, et non par l'identifiant de l'enregistrement PocketBase,
alors même que le stockage local, lui, est rangé par identifiant PocketBase :
`storage/<collectionId>/<recordId>/<nom_suffixé>.<ext>`. Le déversement en
masse se fera donc par une copie **renommante**, pas par un copier-coller brut.

C'est l'application du §1 du contrat d'export
(`frontend/modules/site/PocketSite-docs/12-contrat-catalogue.md`) à un objet
qu'il ne couvrait pas encore.

**Ce qui a emporté la décision, et c'est une mesure, pas un principe :** la
collection `product_events` est le seul endroit du dépôt où un référentiel de
clés a déjà bougé sous des données déjà écrites. Sur 2792 événements, **2710 se
résolvent par `legacy_id`, 5 par l'identifiant PocketBase, et 77 par aucun des
deux**. `legacy_id` est donc la seule clé dont on ait la preuve empirique
qu'elle traverse un changement de base — elle a survécu à la migration
NeDB → PocketBase.

Couverture vérifiée le jour de la décision : **aucune entité sans clé**, sur
les quatre collections (2999 produits, 288 marques, 464 catégories, 43
fournisseurs). Les entités nées ici reçoivent une clé `pa_…` posée par la
couche d'accès et jamais par l'écran — `catalog-products.ts:321`,
`categories.ts:160`, `brands.ts:91`.

**Écarté — reproduire à l'identique l'arborescence locale, pour pouvoir
copier-coller les dossiers sans transformation.** C'était l'intention de
départ, et elle avait sa force : la mise en ligne du reste du catalogue devait
coûter une commande. Elle est abandonnée parce qu'elle ferait dépendre 1,7 Go
de fichiers d'une clé régénérée par le rechargement par purge. Le refus de
purge (`backend/catalog/load/guard.go`) atténue le risque mais ne le supprime
pas : `-force-purge` existe. Le coût réel de l'abandon est faible — la copie
renomme au lieu de copier, elle reste une commande.

**Écarté — convertir `product_events.product_id` vers les identifiants
PocketBase par un script.** Cela aurait troqué la clé qui a survécu contre celle
qui ne survit pas, rendu les 77 orphelins indiagnosticables — les deux
référentiels se distinguent aujourd'hui à la longueur, 16 caractères pour NeDB
et 15 pour PocketBase — et réécrit un journal qui se déclare append-only
(`frontend/lib/product-events/product-events-pocketbase.ts:3`). Le gain aurait
été nul : la résolution coûte un `||` sur deux colonnes indexées
(`backend/routes/stock_routes.go:131`).

**Conséquence à traiter, et elle est ouverte :** le journal dérive **en ce
moment** vers l'identifiant PocketBase. `stock-adjust.ts:220` journalise
`ligne.record_id`, l'identifiant que la route Go renvoie ; les 5 lignes en
référentiel PocketBase datent toutes du 19 août, et chaque vente en ajoute.
Arrêter la dérive — faire renvoyer `legacy_id` par la route et journaliser
celui-là — n'est pas fait.

**Manque connu :** aucun test ne vérifie que les trois `create` posent bien la
clé. `legacy-key.test.ts` couvre le générateur, pas ses appelants. C'est
pourtant la règle dont dépend le nommage des dossiers distants.

**Remise en cause si :** `legacy_id` cesse d'être garanti non vide à la
création — pour les fournisseurs, c'est déjà le cas, `suppliers.ts:21` exclut
volontairement le champ du type d'écriture, sans conséquence tant que les
fournisseurs ne sont pas au contrat d'export.

---

## Le slug est figé, mais quelqu'un doit le POSER — 2026-08-20

Défaut trouvé à l'usage par le propriétaire : un produit créé au comptoir
(« Soucoupe », `pa_z01ub59ehh638mgd`) se trouvait bien dans la recherche du
site, mais son adresse rendait « Produit introuvable ».

**La cause : personne ne posait de slug.** La règle §4.5 du contrat — « le slug
est figé au premier envoi, le serveur en est le gardien » — a été écrite pour
les produits venus de NeDB, qui arrivaient avec un slug WooCommerce. Elle dit
qui a le droit de le CHANGER (personne) ; elle ne disait pas qui le POSE quand
il n'y en a pas. La chaîne entière était cohérente et le laissait vide :

- PocketBase : `slug = ''` — mesuré, 1 produit publié sur 2563 ;
- `catalog-export.ts:147` envoie `null` ;
- `products-sync.php:409` **protège** un slug existant, n'en invente jamais —
  c'est exactement ce qu'on lui a demandé ;
- `catalog.php` rend `slug: null` ;
- le site retombe sur le `legacy_id` (`AxeSearch.jsx:189`,
  `` `/produit/${product.slug || product.id}` ``) ;
- `catalog.php` action `product` interroge `WHERE p.slug = ?` → 404.

**Décision : la couche d'accès de PocketApp pose le slug à la création**,
au même endroit et pour la même raison que `legacy_id` — « le serveur ne décide
de rien » (§2 du contrat). `frontend/lib/queries/slug.ts`, dérivation du nom,
unicité vérifiée dans PocketBase, suffixe `-2` en cas de collision.

**Ce qui ne change pas :** un slug non vide n'est JAMAIS retouché. Renommer un
produit ne déplace pas sa page — c'est tout l'intérêt d'une adresse figée.

**Écarté — le faire côté PHP :** le serveur aurait alors décidé d'une donnée,
contre le §2. Il aurait aussi fallu y écrire une translittération d'accents,
là où la règle vit déjà en TypeScript.

**Écarté — faire résoudre l'`id` par la page produit du site :** `catalog.php`
sait déjà répondre par `legacy_id` (`?action=product&id=…`), et le site ne s'en
sert jamais. Ce repli aurait fait marcher les liens cassés, mais `pa_z01ub…`
n'est pas une adresse de boutique. Le repli reste disponible pour un usage
interne.

**Conséquence à surveiller :** `ax_products.slug` n'a qu'un index simple
(`server/sql/schema.sql:67`), pas de contrainte d'unicité. L'unicité est donc
tenue par PocketApp seul. Deux produits qui arriveraient avec le même slug
s'écraseraient à l'affichage, sans erreur.

**Remise en cause si :** le site doit servir plusieurs langues, ou des adresses
historiques à faire suivre. Ce serait alors une table de redirections, pas un
slug de plus.

---

## L'image principale se désigne, elle ne s'écrase pas — 2026-08-19

Décision du propriétaire, en ouvrant la session « galerie ».

**Remplacer l'image principale d'un produit ne la détruit pas : l'ancienne
rejoint la galerie.** Et réciproquement, **n'importe quelle image de la galerie
peut être promue principale** — promouvoir B rétrograde A, sans qu'aucun fichier
ne bouge sur le disque : `image` et `gallery` vivent déjà dans le même dossier
de stockage, seuls les deux champs changent.

**L'ordre de la galerie est une donnée**, pas un hasard de tri : c'est lui qui
décidera de l'ordre des vignettes sur le site.

**Écarté — remplacer purement et simplement :** le geste courant est « celle-ci
sera meilleure en vitrine », pas « supprime l'autre ». Une photo prise en
boutique ne se retrouve pas.

**Écarté — une case « image principale » sur chaque vignette, sans notion
d'ordre :** le site a besoin d'un ordre pour ses vignettes secondaires ; le lui
inventer à l'export serait une décision prise au mauvais endroit.

**Conséquence à surveiller :** promouvoir écrit `image` ET `gallery` dans la
même requête, et PocketBase remplace la liste entière d'un champ fichier
multiple. Une liste incomplète supprime des fichiers **sans confirmation**.

**Remise en cause si :** un produit doit porter plusieurs images principales
selon le canal — vitrine, ticket, étiquette. Ce serait alors un champ par
usage, pas une désignation.

### Mise en œuvre, le même jour — ce que la mesure a imposé

La règle supposait un échange des deux champs en une requête. **PocketBase le
refuse**, et c'est lu dans la bibliothèque, pas supposé :
`forms/record_upsert.go:428-435` (v0.22.22) compare les noms de fichiers soumis
aux anciens **du même champ**, et rend `validation_unknown_filenames` — refus
reproduit : « image: The field contains unknown filenames. » Promouvoir depuis
le client obligerait à téléverser l'octet une seconde fois, donc à dupliquer le
fichier : exactement ce que la règle interdit.

**La promotion est donc une route Go** — `POST /api/catalog/products/:id/promote-image`,
`backend/routes/product_image_routes.go`. `Dao().SaveRecord` n'a ni validation
des noms ni liste de suppression : il écrit les deux colonnes, et rien ne bouge
sur le disque. Le fait que les deux champs partagent le dossier du produit est
vérifié sur la donnée réelle (`m1xazzk84koylog`, 19 août 2026).

**En sens inverse, l'ordre par le tableau est une capacité déclarée** de la
bibliothèque — `record_upsert.go:461`, « allow file key reasignments for file
names sorting ». L'ordre de la galerie n'est donc pas un contournement.

**Conséquence retenue, et c'est ce qui rend la règle structurelle :** tout
fichier importé entre par la GALERIE, et la principale n'est qu'une
désignation. Il n'existe plus, sur l'écran produit, de geste qui écrase une
image — la forme des logiciels de vente modernes, adoptée ici pour une raison
mesurée autant que par convention.

**À revérifier à chaque mise à jour de PocketBase**, comme l'atomicité du
stock : `backend/routes/product_image_test.go` porte un test qui échouera le
jour où l'API REST acceptera l'échange. Ce jour-là, la route pourra être
reconsidérée — pas avant.

---

## Le temps réel multi-postes passe par PocketBase, pas par le SSE Go — 2026-08-19

**Les écrans se mettent à jour d'un poste à l'autre sans rechargement.**
`frontend/lib/realtime/` s'abonne au temps réel natif de PocketBase sur les
quatre collections du catalogue et invalide les caches TanStack Query
correspondants. C'est la réponse à la question laissée ouverte par
« Le canal WebSocket AppPos est retiré » : plusieurs postes, donc du temps
réel, donc lequel des mécanismes déjà présents.

**Pourquoi PocketBase et pas le SSE Go**, qui existait déjà
(`backend/routes/sse_routes.go`) : le SSE demande qu'on **publie** l'événement
à la main depuis chaque endroit qui écrit. Un chemin d'écriture oublié, et
l'écran ment sans que rien ne le signale. Le temps réel de PocketBase est
accroché aux événements de **modèle** — vérifié dans la v0.22.22,
`apis/realtime.go:257` s'abonne à `OnModelAfterUpdate` — donc **toute**
écriture diffuse, y compris le `SaveRecord` de `POST /api/stock/adjust` à
l'intérieur de sa transaction. Rien à ne pas oublier. Le SSE Go reste ce qu'il
était : le canal de la présence, qui ne porte pas de données de collection.

**Écarté — un abonnement qui invalide tout le cache à chaque événement :** le
piège annoncé. La table `COLLECTIONS_SURVEILLEES` associe chaque collection
aux seules clés qu'elle périme ; une marque renommée ne fait pas repartir la
page de produits. Et l'invalidation ne recharge pas 2999 produits :
`invalidateQueries` ne refait partir que les requêtes **actives**, donc la page
affichée — vérifié par test plutôt que supposé, tout le dimensionnement en
dépendant.

**Écarté — ne pas regrouper les événements :** un ticket de trente lignes
produit trente événements. Le premier arme un délai de 400 ms, les suivants s'y
rangent. Le délai **n'est pas repoussé** à chaque événement : pendant un
inventaire qui se déverse, l'écran ne se mettrait jamais à jour.

**Coût accepté :** l'invalidation refait une requête, elle ne transporte pas la
donnée de l'événement. Un poste voit donc le changement après un aller-retour,
pas instantanément. C'est le bon compromis tant que rien ne demande mieux : la
donnée de l'événement n'est pas filtrée par les mêmes règles que la requête, et
l'écrire dans le cache ferait diverger les deux.

**Remise en cause si :** le nombre de postes rend les invalidations coûteuses —
alors on lit la donnée de l'événement plutôt que de refaire la requête, et ça
se mesure avant de se décider.

## Le mouvement de stock devient atomique, côté serveur — 2026-08-19

**Le stock ne se lit ni ne s'écrit plus depuis le client.**
`frontend/lib/queries/stock-adjust.ts` appelle `POST /api/stock/adjust`
(`backend/routes/stock_routes.go`), qui fait tenir la lecture et l'écriture
dans une seule transaction. C'est le correctif ouvert par la décision
« Le canal WebSocket AppPos est retiré » du même jour.

**Le défaut corrigé, mesuré :** avec l'ancien chemin, 60 ventes concurrentes
d'une unité sur un stock de 100 le laissaient à **85** — 45 mouvements perdus.
Constaté en retirant la transaction du nouveau code et en relançant
`TestMouvementsConcurrentsNeSEcrasentPas`
(`backend/routes/stock_atomic_test.go`), qui passe à 40 avec elle.

**Ce qui rend la transaction suffisante — et c'est une propriété de la
bibliothèque, pas du métier :** PocketBase n'ouvre qu'une connexion
d'écriture. Lu dans la v0.22.22 : `core/base.go:1035` pose
`nonconcurrentDB.SetMaxOpenConns(1)`, et `daos/base.go:130` fait tourner
`RunInTransaction` dessus. Les transactions se sérialisent donc à la connexion.
**C'est le point à revérifier lors d'une mise à jour de PocketBase**, pas le
code de la route.

**Écarté — une garde côté client** (verrou, relecture, réessai) : elle ne voit
pas l'autre poste. C'est exactement ce que le défaut était.

**Écarté — journaliser dans la route.** `product_events` reste écrit par le
client, best-effort comme avant : une trace ratée ne défait pas un mouvement
appliqué. Seul le nombre avait besoin d'être atomique, et élargir la
transaction au journal aurait fait tomber un mouvement valide sur une trace
refusée. La route rend en revanche `product_name` et `product_sku`, que le
client ne peut plus lire lui-même et dont le journal a besoin.

**Écarté — une transaction pour le lot entier.** Chaque mouvement a la sienne :
un produit introuvable — il y en a — n'a pas à annuler la vente des autres
lignes du ticket. C'était déjà la sémantique du client.

**Conséquence sur le calcul :** `nextStock`, `productFilter` et
`looksLikePocketBaseId` ont quitté le client pour le serveur. Le filtre
s'écrit maintenant en paramètres liés (`dbx.Params`), ce qui règle en passant
l'échappement des guillemets que le client bricolait.

**Remise en cause si :** PocketBase change de mode de connexion en écriture, ou
si un besoin de stock réservé (panier en cours) apparaît — ce n'est pas le même
problème et ça ne se résout pas par la même transaction.

## Le canal WebSocket AppPos est retiré ; le temps réel multi-postes reste à bâtir — 2026-08-19

**Les 1009 lignes de WebSocket AppPos sont supprimées** —
`frontend/lib/apppos/apppos-websocket.ts` et `apppos-hooks-websocket.ts`, plus
leurs ré-exports d'`index.ts`. Elles n'avaient plus aucun consommateur depuis le
front E : mesuré le 19 août 2026, seul `index.ts` les importait, et il les
ré-exportait vers personne.

**Le déploiement est multi-postes** — décision du propriétaire, le 19 août
2026 : **un poste sur l'application bureau (Wails), les autres au navigateur**,
sur le même PocketBase. Ce fait n'était écrit nulle part dans le dépôt ;
`frontend/lib/queries/stock-adjust.ts:135-137` supposait l'inverse (« un poste
de caisse, un opérateur ») pour justifier une lecture-puis-écriture sans
transaction. **Cette justification tombe** : deux postes vendant le même produit
en même temps peuvent s'écraser. Le correctif est un hook PocketBase côté
serveur, pas une garde côté client — il n'est pas écrit par cette décision, il
est ouvert par elle.

**L'afficheur client n'était pas concerné.** Les événements `lcd.*` d'AppPos ne
pilotaient rien dans PocketApp : l'afficheur réel est un VFD série local, par
binding Wails (`backend/pos/vfd.go`, `app.go:248`), consommé une seule fois
depuis `frontend/modules/cash/CashTerminalPage.tsx:204`. Le retrait ne le
touche pas. La scanette non plus : `frontend/lib/pos/scanner.ts:65` parle au
backend Go local, pas à AppPos.

**Ce qui reste d'AppPos, et pourquoi :** l'API REST et
`AppPosSessionProvider` (`frontend/main.tsx:6`), parce que
`frontend/modules/site/components/MenuTreeEditor.tsx:55` lit encore le catalogue
AppPos pour nommer les destinations du menu. C'est le dernier lecteur.

**Écarté — remplacer le canal poste pour poste par un abonnement PocketBase :**
les quatre premiers groupes d'événements (`products.*`, arbres,
`stock.statistics`) portaient des données qui vivent maintenant dans
PocketBase ; les remplacer d'abord, c'est recréer un besoin avant de l'avoir
mesuré. Le front n'utilise aujourd'hui **aucun** `subscribe()` PocketBase ; son
seul temps réel est le SSE Go (`backend/routes/sse_routes.go:101`,
`frontend/lib/presence/use-presence-events.ts:120`). Le choix entre les deux se
fait quand un écran en aura besoin, pas maintenant.

**Remise en cause si :** un écran multi-postes montre des données périmées de
façon gênante — alors on tranche SSE Go contre abonnement PocketBase. La
concurrence d'écriture sur le stock, elle, ne dépend pas de ce choix et se
corrige indépendamment.

## Les entrées d'inventaire s'écrivent en identifiant PocketBase et se lisent sur les deux clés — 2026-08-19

Une entrée d'inventaire créée à partir d'aujourd'hui porte l'**identifiant
PocketBase** du produit dans `product_id`. **La lecture, elle, interroge les
deux clés** — `id` et `legacy_id` — par `indexCatalogueParCle`
(`frontend/lib/queries/catalog-snapshot.ts`), comme le fait déjà
`applyStockMovements` côté écriture.

**Pourquoi cette dissymétrie :** mesuré sur la base installée le 19 août 2026,
sur 2465 entrées, **0** se résout par `products.id`, **2370** par
`legacy_id`, **95** par aucun des deux. Écrire en `legacy_id` pour rester
homogène ferait dépendre toute session neuve d'un pont qu'on démonte ; lire sur
la seule clé neuve rendrait illisibles 196 sessions.

**Écarté — migrer les 2465 entrées vers l'identifiant PocketBase :** 95 n'ont
pas de cible, et une entrée d'inventaire est une **mesure datée**, pas une
donnée courante. La réécrire, c'est réécrire un comptage.

**Écarté — masquer les 95 orphelines :** elles portent un comptage réel. Elles
s'affichent avec leur nom et leur code figés au snapshot, marquées « produit
absent du catalogue ».

**Remise en cause si :** `legacy_id` disparaît du schéma — ce qui suppose
d'avoir d'abord tranché le sort de l'historique d'inventaire, pas l'inverse.

## Le rechargement par purge est gardé, pas supprimé — 2026-08-19

**`catalog-import -load` refuse de purger dès que la base porte des données que
NeDB n'a pas** : entités nées ici (`legacy_id` en `pa_`), mouvements de stock
locaux, documents citant des produits. `-force-purge` passe outre, à la main.

C'est ce qui achève la migration : PocketBase n'est plus une projection
reconstructible, c'est une base. La contrainte « les saisies éditoriales ne
survivent pas à `catalog-import -load` » (2026-08-12) tombe.

**Mesuré le jour même sur une copie de la base réelle** : 513 ventes,
735 comptages d'inventaire, 10 retours, 1153 factures, 63 devis, 16 commandes.
**Le rechargement était déjà destructeur, et rien ne le disait.**

**Écarté — supprimer la purge :** une installation neuve doit pouvoir charger
son catalogue depuis un dossier AppPos, et une base de test doit pouvoir être
remise à zéro. Ce n'est pas la purge qui était dangereuse, c'est son silence.

**Écarté — un simple avertissement à l'écran :** un message qu'on peut ignorer
en tapant Entrée ne protège rien. Le refus est le défaut ; le forçage s'écrit.

**Remise en cause si :** un besoin de resynchronisation régulière depuis NeDB
apparaît — auquel cas il faudra une convergence, pas une purge.

---

## La caisse écrit dans PocketBase — 2026-08-19

**Le catalogue, les produits créés au comptoir et le stock vendu vivent dans
PocketBase.** AppPos n'est plus écrit par PocketApp, nulle part.

C'est l'aboutissement de « AppPos sort de la logique à la prochaine release »
(2026-08-13) et la fermeture du point dur nommé le même jour : tant que la
caisse créait ses produits dans NeDB, PocketBase était en retard **par
construction**.

**Écarté — une bascule progressive, la caisse écrivant dans les deux :** c'est
la double écriture, refusée le 13 août. Une écriture double sans transaction
produit deux bases qui divergent au premier échec partiel.

**Écarté — garder la garde `getAppPosToken()` sur les mouvements de stock :**
elle ne protégeait plus rien depuis que le stock est local, et empêchait la
marchandise retournée de rentrer en stock quand AppPos ne tournait pas.

**Conséquences assumées, et datées :**

- **le stock d'AppPos ne bouge plus depuis PocketApp.** Si AppPos continue
  d'être utilisé en parallèle, ses chiffres et les nôtres divergent ;
- **le canal WebSocket d'AppPos n'est plus écouté par la caisse** : un
  mouvement fait dans AppPos n'est plus vu ici ;
- **lecture puis écriture sans transaction** (`stock-adjust.ts`) : deux postes
  vendant en même temps peuvent s'écraser. À reprendre par un hook serveur si
  un second poste apparaît.

**Remise en cause si :** un client doit faire tourner AppPos et PocketApp
ensemble durablement — auquel cas ce n'est plus une migration mais une
synchronisation, et c'est une autre décision.

---

## La fiche IA ne touche pas au titre ; l'icône titre écrit le nom canonique — 2026-08-19

**Les deux gestes IA sont séparés.** L'assistant de fiche n'écrit que la
`description` et sa route Gemini ne demande ni ne renvoie de titre. Le champ
« Titre / nom du produit » garde sa propre icône IA, branchée sur la route
historique `product-title`. Seule cette icône, ou une saisie manuelle explicite
dans le champ, peut modifier `products.name` au moment d'enregistrer.

`site_title` reste envoyé à `null`. Le serveur du site retombe donc sur
`products.name`, ce qui garantit le même nom dans PocketApp et sur le catalogue
public. Le titre généré et validé devient ce nom canonique ; si l'utilisateur
ne génère rien, la référence déjà présente reste inchangée. Le nom reste dans
le contexte de la fiche uniquement pour identifier correctement le produit et
cibler une éventuelle recherche Web.

Cette décision révise la génération « titre et description » du 19 août, le
schéma court qui contenait encore un titre, mais pas la logique dédiée du champ
titre. Après une écriture réussie de `name`, le cache de la grille est mis à
jour immédiatement puis invalidé : la carte montre le titre validé sans
attendre le rechargement réseau.

**Écarté — utiliser `site_title` pour conserver une proposition différente :**
cela créerait précisément deux noms possibles pour le même produit, alors que
la règle demandée est qu'une seule identité fasse foi.

**Remise en cause si :** le métier demande explicitement un titre public
distinct du nom/référence de caisse et définit quelle valeur est canonique.

---

## La longueur de fiche est un choix explicite — 2026-08-19 — partiellement révisée le 2026-08-19 par « La fiche IA ne touche pas au titre ; l'icône titre écrit le nom canonique »

**Avant chaque génération, l'utilisateur choisit entre « Description courte »
et « Fiche détaillée ».** Le format court vise les piles, vis et petits
accessoires : deux ou trois phrases, sans section, liste, tableau ni conseil.
Son schéma ne contient que le titre et l'introduction, avec 350 jetons de sortie
maximum. La fiche détaillée conserve les points forts, caractéristiques et
conseils, avec 1 400 jetons maximum.

Le choix vaut aussi bien pour les documents que pour la recherche Web. Le Go
impose le schéma court quand il est disponible et valide dans tous les cas le
résultat avant de composer le HTML.

**Écarté — déduire automatiquement le format de la catégorie :** une catégorie
ne suffit pas à distinguer un accessoire complexe d'une pièce simple, et une
mauvaise déduction gaspillerait précisément les jetons que le format court doit
économiser.

**Remise en cause si :** l'usage montre qu'un troisième format intermédiaire
est réellement nécessaire.

---

## Le Web reste gratuit via Gemini 2.5 Flash-Lite — 2026-08-19

**Le mode Google Search utilise `gemini-2.5-flash-lite`, tandis que le titre et
les fiches fondées sur des documents restent sur `gemini-3.1-flash-lite`.** La
tarification Google du 19 août 2026 rend Search indisponible au niveau gratuit
de Gemini 3.1 Flash-Lite, alors que 2.5 Flash-Lite conserve 500 recherches par
jour, partagées avec 2.5 Flash. C'est la cause observée d'un `429` sur la fiche
Web alors que le titre 3.1 réussissait avec la même clé.

Le mode Web 2.5 demande toujours un JSON strict, mais n'envoie pas le schéma de
sortie ni `thinkingLevel`, combinaison propre aux modèles Gemini 3 dans ce
flux. Le Go extrait et valide le JSON avant de composer le HTML ; aucune fiche
mal formée n'atteint le formulaire. Cette décision révise uniquement la phrase
« la sortie reste sur 3.1 » de la décision suivante ; la séparation documents
ou Web et tous ses garde-fous restent valides.

**Écarté — imposer l'activation de la facturation Google :** elle ferait
fonctionner Search 3.1, mais transformerait une fonction annoncée comme
utilisable avec le quota gratuit en réglage externe obligatoire.

**Écarté — retomber silencieusement sur les connaissances internes de 3.1 :**
l'utilisateur demande explicitement le Web et les sources. Une fiche sans
recherche ne doit jamais se présenter comme recherchée.

**Remise en cause si :** Google retire le quota Search de 2.5, déprécie ce
modèle, ou active Search 3.1 au niveau gratuit.

---

## La fiche produit choisit une seule source : documents ou Web — 2026-08-19 — partiellement révisée le 2026-08-19 par « Le Web reste gratuit via Gemini 2.5 Flash-Lite » et « La fiche IA ne touche pas au titre ; l'icône titre écrit le nom canonique »

**L'assistant éditorial peut générer ensemble le titre et la description depuis
des documents fournis par l'utilisateur, ou depuis Google Search quand il n'en
a aucun.** Les deux modes sont mutuellement exclusifs dans une requête. Le mode
Web est un geste explicite, construit une recherche ciblée depuis la marque, la
désignation, la référence et la catégorie, puis affiche les requêtes et les
sources renvoyées par Gemini. Une proposition remplit le formulaire mais
n'écrit rien avant la validation humaine existante.

La sortie reste sur `gemini-3.1-flash-lite`, en JSON structuré et raisonnement
minimal. La description HTML est composée et échappée par le Go depuis des
champs structurés ; le modèle ne livre jamais du HTML arbitraire au catalogue.
Les pièces jointes sont limitées à trois images ou PDF, 2 Mo chacune et 5 Mo au
total ; le texte collé est limité à 12 000 caractères. Le reporting de jetons
continue vers le mini-SaaS avec un libellé distinguant Web et documents.

**Écarté — rechercher automatiquement dès qu'une information manque :** une
recherche Gemini 3 est facturée par requête décidée par le modèle et rendrait la
dépense invisible. Le choix Web reste donc visible et volontaire.

**Écarté — envoyer documents et Web ensemble :** cela augmente le contexte et
peut faire préférer une page web moins fiable à une documentation fournie. Si
l'utilisateur possède une source, elle suffit ; sinon le Web prend le relais.

**Remise en cause si :** les recherches réelles nécessitent régulièrement plus
d'une requête ou si les fiches obtenues avec Flash-Lite demandent davantage de
corrections humaines que celles d'un modèle supérieur.

---

## Le titre produit passe au modèle économique Gemini 3.1 Flash-Lite — 2026-08-19

**L'assistant du champ « Nom » utilise désormais `gemini-3.1-flash-lite`, la
version stable sans suffixe `preview`.** Cette tâche produit une courte chaîne
factuelle de 70 caractères maximum avec un raisonnement minimal : le surcoût de
`gemini-3.5-flash-lite` n'est pas justifié. Le 3.1 coûte 0,25 $ par million de
jetons d'entrée et 1,50 $ par million de jetons de sortie, contre 0,30 $ et
2,50 $ pour le 3.5 au 19 août 2026.

Cette décision ne réintroduit pas l'ancien
`gemini-3.1-flash-lite-preview`, arrêté le 25 mai 2026. Le modèle choisi est
`gemini-3.1-flash-lite`, désormais GA. Le prompt contraint, la sortie JSON, la
route Go et la validation humaine restent inchangés.

**Écarté — conserver le 3.5 par principe :** aucune exigence mesurée de cette
tâche simple ne justifie son tarif de sortie supérieur.

**Remise en cause si :** le modèle stable 3.1 est déprécié ou si un jeu de
produits mesuré montre une baisse de qualité que le prompt ne corrige pas.

---

## Gemini propose les titres, le Go garde la clé et l'humain garde l'écriture — 2026-08-18 — annulée le 2026-08-19 par « Le titre produit passe au modèle économique Gemini 3.1 Flash-Lite »

**L'assistant du champ « Nom » appelle `gemini-3.5-flash-lite` depuis une route
Go authentifiée.** Il remplit le champ avec une proposition ; il n'enregistre
pas le produit et ne déclenche aucun export. La clé `GEMINI_API_KEY` ne descend
jamais dans le renderer et n'est pas mise dans l'URL distante.

Le modèle est stable, disponible au niveau gratuit et dimensionné pour cette
tâche courte. Le prompt interdit d'inventer une caractéristique, sépare les
données produit de l'instruction système et demande une sortie JSON structurée.
Le raisonnement est `minimal`, sans `temperature`, `topP` ni `topK`, paramètres
dépréciés sur les modèles Gemini actuels. Le niveau gratuit autorise Google à
utiliser les requêtes pour améliorer ses produits ; seules des données de
catalogue destinées à être publiques sont envoyées, et la description est
limitée à 1 500 caractères pour ne pas gaspiller le quota.

**Écarté — reprendre tel quel `GeminiDirectService.js` d'AppPos :** son modèle
principal `gemini-3.1-flash-lite-preview` est arrêté depuis le 25 mai 2026, son
repli automatique sur `gemini-2.5-flash` masque un quota épuisé en lançant une
seconde requête, et sa consigne « titre accrocheur » autorise des faits
commerciaux non fournis. Ses sorties sont nettoyées après coup au lieu d'être
contraintes par un schéma.

**Écarté — appeler Gemini depuis React :** une variable `VITE_` mettrait la clé
en clair dans le bundle. Une route qui rendrait la clé au front déplacerait le
même défaut sans le corriger.

**Remise en cause si :** le niveau gratuit disparaît, le modèle est déprécié,
ou les propositions mesurées ne respectent pas assez les données source. Dans
ce dernier cas on évalue d'abord le prompt et un jeu de produits, pas un modèle
plus coûteux par réflexe.

---

## Le catalogue AppPos passe en lecture seule — 2026-08-18

**`/stock-apppos` n'écrit plus rien.** Les boutons « Modifier » et « Supprimer »
de `ProductTable` sont retirés ; l'édition d'un produit se fait sous
`/stock/produits`, dans PocketBase, par `CatalogProductDialog`.

Ce n'est pas un choix de confort, c'est la conséquence de deux règles déjà
prises et d'une mesure faite le jour même :

- « Modifier » appelait `updateAppPosProduct` — donc **écrivait dans AppPos**,
  ce que la décision du 2026-08-13 interdit ;
- « Supprimer » appelait `useDeleteProduct` — une suppression **PocketBase**
  avec un identifiant **NeDB**. Elle ne pouvait pas aboutir : les deux espaces
  d'identifiants ne se recouvrent pas, le pont est `legacy_id`.

**Écarté — faire pointer ces deux boutons vers PocketBase :** les produits
affichés viennent d'AppPos ; leur identifiant n'y désigne rien. Il aurait fallu
résoudre par `legacy_id` à chaque clic, c'est-à-dire construire un second écran
d'édition PocketBase à côté de celui qui existe déjà.

**Écarté — garder le routeur `useUpdateProductUniversal` en le typant :** un
routeur suppose deux destinations. Il n'y en a plus qu'une.

**Conséquence assumée :** l'écran qui liste le catalogue AppPos ne permet plus
de le corriger. Tant que la caisse et l'inventaire écrivent dans NeDB, cette
correction se fait dans AppPos lui-même.

**Remise en cause si :** les produits affichés sous `/stock-apppos` viennent un
jour de PocketBase — auquel cas l'écran fusionne avec `/stock/produits` plutôt
que de retrouver ses boutons.

---

## `legacy_id` devient « clé stable », et PocketApp en génère une à la création — 2026-08-13

Décision du propriétaire, après un refus constaté à l'export : *« 1 entité
refusée — legacy_id : chaîne non vide attendue »*.

**Toute entité créée dans PocketApp reçoit un `legacy_id` généré**, préfixé
`pa_`. Vaut pour les produits, les catégories et les marques — les trois que le
contrat exporte.

**Le champ change de sens, pas de rôle.** Il voulait dire « identifiant NeDB
d'origine » ; il veut désormais dire **« clé stable de l'entité, hors
PocketBase »**. C'était de toute façon son destin : AppPos sort de la logique à
la prochaine release, et le champ lui survit parce que c'est lui qui identifie
une entité côté site.

**Le préfixe n'est pas décoratif :** il distingue au premier regard ce qui vient
de NeDB de ce qui est né ici, et rend une collision arithmétiquement impossible
avec les identifiants NeDB, qui n'en portent pas.

**Ce que ça répare, et qui était silencieux.** Une entité sans clé n'est pas
seulement refusée : elle disparaît des relations. `toExportProduct` résout
marque et catégories en `legacy_id` puis élimine les vides — un produit partait
donc **sans sa catégorie et sans sa marque, sans un mot**. Le refus visible ne
concernait que la catégorie elle-même ; la marque, elle, partait à `null` sans
rien signaler.

**Écarté — que le serveur accepte l'identifiant PocketBase en repli.** Ce serait
rouvrir ce que §1 du contrat ferme : les identifiants PocketBase sont régénérés
à chaque rechargement par purge, et 2562 produits en double apparaîtraient au
premier `catalog-import -load`, sans erreur.

**Écarté — refuser la création d'entités dans PocketApp tant que la clé n'existe
pas.** C'est repousser le problème sur l'utilisateur pour éviter d'écrire dix
lignes.

**Remise en cause si :** une source tierce impose sa propre clé — alors il
faudra un espace de noms, et le préfixe en est déjà l'amorce.

## L'export reste un acte explicite, mais les catégories et marques doivent montrer leur état — 2026-08-13

Décision du propriétaire, sur la question « faut-il pousser en silence les
retouches de texte ? ». **Non.**

**L'export ne part jamais tout seul.** C'est ce qui rend la chaîne prévisible :
on sait ce qui est en ligne parce qu'on l'y a envoyé. Pousser à chaque
enregistrement ferait partir des écritures réseau que personne n'a demandées, et
noierait les refus — le refus qui vient d'être constaté serait passé inaperçu.

**Mais l'état doit se voir pour les trois entités, pas seulement les produits.**
Aujourd'hui seuls les produits portent absent / modifié / à jour ; on peut donc
modifier la description d'une catégorie sans que rien à l'écran ne dise qu'elle
n'est pas partie. L'inventaire renvoie **déjà** les empreintes des catégories et
des marques (§3 du contrat) : la matière existe, elle n'est pas affichée.

**La règle qui en découle, et elle est simple :**

- **automatique quand la modification accompagne un produit** — l'export d'un
  produit emporte déjà sa marque et ses catégories, ancêtres compris
  (`CatalogueEnLignePage.tsx`), et c'est le comportement voulu ;
- **explicite et visible quand elle est isolée** — une retouche de texte seule
  se voit passer « modifié », et s'envoie d'un geste.

**Écarté — une synchronisation périodique en arrière-plan.** Elle rendrait
l'état affiché faux entre deux passages, et transformerait chaque frappe en
requête vers un mutualisé.

**Remise en cause si :** le volume de retouches rend le geste explicite pénible
— alors ce serait un envoi groupé, pas un envoi automatique.

## AppPos sort de la logique à la prochaine release — l'écriture produit s'ouvre maintenant — 2026-08-13

Décision du propriétaire, en cours de mission AppStock. **La prochaine version
livrée n'aura plus AppPos dans sa logique.** Trois conséquences immédiates, et
elles renversent une contrainte qui organisait tout le reste :

1. **On écrit dans les produits PocketBase dès maintenant**, sans attendre que
   la question « où vit la vérité du prix et du stock » soit tranchée : elle se
   tranche par la sortie d'AppPos.
2. **La caisse et l'inventaire se raccordent en dernier.** Ils continuent
   d'écrire dans NeDB en attendant, et ce n'est pas un obstacle.
3. **Les divergences entre NeDB et PocketBase sont acceptées d'ici là.** Un
   stock différent des deux côtés n'est plus un défaut à corriger, c'est l'état
   normal d'une transition dont on connaît la fin.

**Ce que cela annule :** le « point dur » du §6 du rituel de migration AppStock
— *tant que la caisse crée des produits dans NeDB, PocketBase ne peut pas être
source de vérité* — reste **vrai comme description**, mais cesse d'être un
**préalable**. On ne cherche plus à le résoudre avant d'écrire ; il disparaîtra
avec AppPos.

**Ce que cela ne change pas :**

- le rechargement par purge existe toujours, et **toute saisie meurt au prochain
  `catalog-import -load`** (bloc du 12 août 2026). C'est du travail d'essai tant
  que l'import n'est pas définitif ;
- l'export vers le site est inchangé : une écriture fait bouger l'empreinte, le
  produit repasse « modifié », il se réexporte ;
- **les identifiants restent incompatibles entre les deux bases.** Un écran qui
  affiche des produits AppPos ne peut pas filtrer sur des marques PocketBase, et
  réciproquement : le pont est `legacy_id`, pas l'identifiant PocketBase.

**Prudence conservée, et c'est la seule :** on n'écrit pas *dans AppPos*, jamais
— la caisse en dépend jusqu'à la release. Écrire dans PocketBase n'a aucun effet
sur elle, c'est précisément ce qui rend la chose sûre.

**Remise en cause si :** la release glisse au point que l'écart NeDB ↔ PocketBase
devienne coûteux à reprendre — alors il faudra un rattrapage, pas un retour en
arrière.

## La couche d'accès d'AppStock : source explicite, par entité — 2026-08-13

Décision du propriétaire, à l'ouverture de la mission AppStock. **Chaque entité
— `products`, `categories`, `brands`, `suppliers` — déclare sa source, de façon
typée et lisible au point d'appel.** Pas de drapeau global, pas de déduction.

**Pourquoi par entité :** la bascule ne sera pas simultanée. Les catégories, les
marques et les fournisseurs sont petits, stables, et déjà dotés de composants
PocketBase ; les produits portent le stock, la caisse et l'export vers le site.
Un interrupteur unique obligerait à tout basculer le même jour, donc à ne jamais
basculer.

**Écarté — un drapeau dans `.env`.** Il rend le mode mixte indistinguable du
mode PocketBase à la lecture du code, et fait d'un fichier de configuration ce
qui décide de la base écrite. C'est la même erreur que
`useUpdateProductUniversal` (`frontend/lib/queries/products.ts:179`), en plus
large : un `source?: string` optionnel qu'on oublie écrit dans l'autre base sans
lever d'erreur. **La nouvelle couche remplace ce hook, elle ne s'y ajoute pas.**

**Écarté — un réglage en base, modifiable dans l'application.** L'état du
système dépendrait alors d'une donnée, et un test ne reproduirait pas
nécessairement la production. Séduisant en démonstration, ingérable au
diagnostic.

**Remise en cause si :** les quatre entités finissent par basculer ensemble —
alors le paramètre par entité n'aura plus d'objet et pourra tomber.

## Les composants en double du module `stock` convergent, ils ne cohabitent pas — 2026-08-13

Décision du propriétaire. Le module porte **six paires** de composants, l'un
« AppPos », l'autre lisant PocketBase (détail et mesures :
`frontend/modules/stock/PocketStock-docs/00-rituel-migration-appstock.md`, §2.1).
**Chaque paire traitée est réduite à un seul composant dans la session qui la
traite.** Jamais de troisième variante, jamais de jumeau gardé « au cas où ».

**Ce que ça implique, et qui est le vrai engagement :** le module doit
**rétrécir** à mesure que la migration avance. Une session qui ajoute un
composant sans en retirer un a échoué, même si son écran fonctionne.

**Écarté — rebrancher d'abord les composants PocketBase pour voir ce qu'ils
couvrent.** La mesure serait utile, mais elle remet en service un écran de plus
à maintenir pendant ce temps, et l'expérience de ce module est qu'un écran remis
« provisoirement » en service y reste. La comparaison se fait sur le code, pas
en production.

**Écarté — repartir des composants AppPos en changeant leur source.** Le moins
risqué à court terme, mais il jette sans l'avoir lu du code PocketBase déjà
écrit — celui-là même qui couvre les catégories, marques et fournisseurs.

**Remise en cause si :** une paire s'avère porter deux besoins réellement
distincts, et non deux versions du même. Ce serait un constat à consigner, pas
une permission de garder les deux.

## Pas de double écriture pendant la transition AppStock — 2026-08-13

Décision du propriétaire. **Lire les deux bases, oui ; écrire dans les deux, non.**
À tout instant, une entité donnée a **une seule** base de destination.

**Pourquoi :** une écriture double sans transaction — et il ne peut pas y en
avoir, NeDB et PocketBase étant deux systèmes distincts — laisse les deux bases
divergentes au premier échec partiel. C'est exactement le mode d'échec du flux
WooCommerce, documenté dans
`frontend/modules/site/PocketSite-docs/07-audit-flux-apppos.md` : les écarts ne
se voient pas au moment où ils se créent, ils se découvrent des semaines plus
tard, et on ne sait plus laquelle des deux avait raison.

**Écarté — une base maîtresse et l'autre en écho.** Techniquement faisable, mais
il faut alors un journal des échecs, une reprise, et une règle d'arbitrage en
cas de désaccord : un chantier à part entière, greffé sur une transition qui en
est déjà une.

**Le prix accepté :** au moment de basculer une entité, les écritures faites
dans l'ancienne base depuis le dernier chargement doivent être reprises. C'est
un travail ponctuel et visible, préférable à une divergence permanente et
silencieuse. Il rejoint le point dur de la mission (§6 du rituel) : **le
rechargement par purge devra s'arrêter**, et ce jour-là PocketBase cesse d'être
une projection.

**Remise en cause si :** une entité doit rester écrite des deux côtés pour une
raison métier — le cas n'est pas identifié aujourd'hui, et le stock modifié par
la caisse est le seul candidat sérieux.

## Les textes du site s'écrivent dans `products`, `categories` et `brands` — 2026-08-12

Décision du propriétaire. Les champs éditoriaux modifiables depuis « Catalogue
en ligne » — le **`name`** du produit, la **`description`** du produit, de la
catégorie et de la marque — sont écrits **directement dans les collections du
catalogue PocketBase**. Pas de collection annexe, pas de nouveau champ, pas de
migration.

**Ce qui rend la chose simple, et qui a été constaté en base :** `name` fait
déjà office de titre de site. Beaucoup de produits ont pour `name` leur
référence — « ABGS14SH », « TNTCA8 » —, d'autres un vrai libellé. Et
`present_product` (`server/api/catalog.php:134-141`) retombe **déjà** sur `name`
quand `site_title` est vide. Un `name` corrigé arrive donc sur le site sans une
ligne de plus dans la chaîne d'export.

**La contrainte, assumée : tout `catalog-import -load` efface ces saisies.** Le
chargeur purge les collections en SQL brut (`backend/catalog/load/loader.go:290`,
`Delete(name, "1=1")` sur `external_refs, products, suppliers, categories,
brands`). Ce n'est pas un défaut à contourner : la **campagne éditoriale réelle
se fera après l'import définitif**. Ce qui est saisi d'ici là est un test, et sa
perte est acceptée d'avance.

**Écarté — une collection séparée clée sur `legacy_id`.** C'était la voie
pressentie, et elle survivait à la purge. Elle paie une migration, un index, une
jointure à la lecture et un lot d'orphelines à nettoyer, pour protéger des
saisies dont on vient de dire qu'elles sont jetables. On ne construit pas la
persistance d'un brouillon.

**Écarté — des champs relus puis réappliqués par le chargeur.** Le chargeur
deviendrait gardien d'une donnée qu'il ne produit pas, et une interruption entre
la relecture et la réécriture perdrait la saisie sans le dire.

**Écarté — brancher `site_title`.** Le champ **reste** au contrat (§4.1) et dans
la table SQL, **non câblé** : `toExportProduct` continue de l'envoyer à `null`.
C'est la porte de sortie du jour où un titre long sur le site devra cohabiter
avec une étiquette courte sur le ticket de caisse. Le supprimer coûterait une
migration SQL et une modification du contrat pour rouvrir la même porte plus
tard.

**La conséquence à venir, à ne pas découvrir en route :** à la bascule T7,
`name` devient le libellé du ticket de caisse. Corriger un `name` aujourd'hui
pour le site, c'est corriger demain ce que le client lit sur son ticket — ce qui
est voulu, mais qui déplace le curseur : le champ cessera d'être purement
éditorial.

**Une seule voie d'écriture, nommée** — `frontend/lib/queries/site-catalog-edit.ts`.
Elle ne passe **pas** par `useUpdateProductUniversal`
(`frontend/lib/queries/products.ts:180`), qui route entre deux chemins sur une
chaîne non typée : c'est la dette que `CLAUDE.md` interdit d'aggraver. Cette
voie écrit dans PocketBase et nulle part ailleurs, et refuse un `name` vide
plutôt que de laisser remonter l'erreur brute du champ requis
(`backend/migrations/catalog_v2.go:553`).

**Remise en cause si :** l'import devient définitif — alors la contrainte tombe
d'elle-même —, ou si un titre de site doit diverger du libellé de caisse : c'est
le jour où `site_title` se branche.

## Le site fabrique ses propres URL, et elles sont figées au premier envoi — 2026-08-11

Décision du propriétaire, à l'ouverture de la phase de raccordement du menu au
catalogue `ax_`.

**Nos URL sont les nôtres.** Le slug ne se lit plus chez AppPos ni chez
WooCommerce : il est produit par notre flux et écrit à l'export. Et **une fois
publiée, une URL ne change plus.**

**Ce que ça débloque, et c'est considérable :** la publication d'une entrée de
menu échouait quand la cible n'avait pas de slug dans AppPos — **433 catégories
sur 463** étaient dans ce cas (mesure du 8 août 2026, §6.2 bis du contrat du
menu). Elles étaient listées dans l'éditeur mais non sélectionnables. Le
catalogue PocketBase, lui, porte un slug pour tout le monde, la normalisation
en ayant même désambiguïsé 79. Toute la mécanique de lecture de slug d'AppPos
(`use-menu-destinations.ts`) perd sa raison d'être.

**Pourquoi figée, et pas recalculée :** une URL publiée vit dans les favoris et
dans l'index des moteurs. La recalculer au changement de nom casserait
silencieusement des liens qu'on ne contrôle pas — et le silence est le
problème, pas la casse.

**Le serveur est le seul gardien possible de cette règle.** PocketBase est
rechargé par purge : il ne sait pas ce qui est déjà en ligne. Seule la base SQL
le sait. D'où, dans `products-sync.php`, un slug déjà présent qui n'est
**jamais** remplacé par l'upsert — produits, catégories et marques.

**Écarté — recalculer le slug à chaque mise à jour :** l'URL suit le nom, et
chaque renommage casse les liens existants sans que rien ne le signale.

**Ce que ça laisse à faire, et qui n'existe pas encore :** le renommage
délibéré d'une URL, avec redirection de l'ancienne. C'est une opération
explicite, pas un effet de bord d'export.

**Remise en cause si :** un besoin de renommage en masse apparaît, ou si le
référencement impose une forme d'URL que la génération ne produit pas.

## Le menu de test est une cible nommée, pas un second menu en base — 2026-08-11

Pour raccorder le menu au catalogue `ax_` sans toucher au menu **en production
depuis le 10 août**, `publish-menu.php` accepte `?target=<nom>`, où `<nom>` est
une clé du tableau `targets` de `config.php` — jamais un chemin. Le site en
développement lit alors ce fichier via `VITE_PUBLISHED_MENU_URL`.

Rien de tout cela n'existe côté PocketBase : **aucun second menu, aucune notion
de menu nommé en base.** L'URL de publication est déjà un réglage ; y ajouter
`?target=dev` suffit, et il n'y a pas une ligne de Go ni de React à écrire.

**Écarté pour l'instant — une vraie notion de plusieurs menus** (principal,
pied de page, promotionnel), avec un menu de test comme cas particulier. L'idée
est bonne et reviendra : un site a normalement plus d'un menu. Mais la
construire **pour pouvoir tester** serait la construire pour la mauvaise
raison, et on hériterait de son modèle — un menu a-t-il un nom, un
emplacement, une portée ? — décidé à la va-vite dans le seul but d'isoler un
essai.

**À noter pour le jour où :** le contrat du menu porte déjà `menu.name`
(§6.2 : « Menu Principal », écrit en constante faute de collection). C'est
l'amorce naturelle d'un vrai multi-menus, et la correspondance nom → fichier de
`targets` en est le brouillon involontaire.

**Remise en cause si :** le besoin d'un second menu réel apparaît — pied de
page, menu saisonnier —, auquel cas il se conçoit pour lui-même et la cible de
test devient un cas parmi d'autres.

## L'endpoint de lecture du catalogue est public et sans clé — 2026-08-11

`server/api/catalog.php` n'attend **aucun** `X-API-Key`, et ne doit jamais en
attendre. Mis en service le 11 août 2026 : le site lit ses premiers produits
hors WooCommerce.

**Pourquoi, en une phrase :** son consommateur est un bundle JavaScript public,
et tout secret qu'il porterait serait lisible par n'importe quel visiteur.

C'est très exactement la faille 3.1 — `VITE_WC_CONSUMER_KEY` et
`VITE_WC_CONSUMER_SECRET`, en lecture-écriture, dans le bundle du site. Elle est
déclarée prioritaire depuis le premier jour et jamais traitée. **On ne la
reproduit pas en la déplaçant sur notre propre base.**

**La protection n'est pas une clé, c'est la portée :**

- que des `SELECT`, sur des données déjà destinées à être publiques ;
- aucune écriture, aucune suppression ;
- ni `purchase_price_ht`, ni fournisseur, ni marge, ni stock d'alerte — la
  liste des champs publiés est énumérée, pas obtenue par soustraction ;
- l'écriture reste derrière `products-sync.php` et sa clé, que seul PocketApp
  détient.

**Écarté — une clé « de lecture » dans le bundle :** elle n'authentifie
personne. Elle donne l'illusion d'une protection tout en étant publique, ce qui
est pire que pas de clé du tout : on finit par lui confier des données qu'on
n'aurait pas exposées sans elle.

**Écarté — restreindre par `Origin` ou `Referer` :** ces en-têtes sont posés par
le client. Ils gênent un navigateur, jamais un script.

**Remise en cause si :** on veut publier par cet endpoint une donnée qui n'est
pas publique — un prix réservé, un stock exact, un client. Alors ce n'est plus
le même besoin, et il lui faudra son propre chemin authentifié, pas un
paramètre de plus sur celui-ci.

## Les 257 produits dont l'état de publication va basculer se tranchent à l'export — 2026-08-11

Décision du propriétaire, prise en constatant les 2562 produits publiés de la
vue « Catalogue en ligne ». **On ne tranche pas maintenant ; on avance, et le
sort de ces 257 produits se décide au moment de l'export vers la base SQL
Axemusique.**

**Ce qui est mesuré**, sur la base de référence `%APPDATA%\AppPOS\data`, par
`catalog-import -fields` et `-normalize`, en lecture seule :

| | produits |
|---|---:|
| dans NeDB | 3034 |
| portant un `woo_id` — donc réellement en ligne aujourd'hui | **2528** |
| `published` **sans** `woo_id` — publiés jamais mis en ligne | **160** |
| `draft` **avec** `woo_id` — brouillons pourtant en ligne | **97** |
| `published` dans NeDB | 2591 *(2528 − 97 + 160)* |
| `published` chargés dans PocketBase | **2562** *(observé à l'écran)* |

L'écart de 29 entre 2591 et 2562 est le nombre de produits publiés parmi les 35
mis en quarantaine pour SKU en doublon. **C'est une déduction arithmétique, pas
une lecture** — seul point de ce tableau qui ne soit pas mesuré directement.

**Ce que la bascule produit :** `status` devenant la seule autorité, les 160
apparaîtront sur le site pour la première fois et les 97 en disparaîtront.
**257 produits changent d'état visible d'un coup, à la première synchronisation.**

**Ce qui est écarté, et pourquoi :**

- **Trancher maintenant, produit par produit** — 257 décisions métier à froid,
  sans le contexte de l'export, pour un site qui n'est pas encore alimenté.
- **Un onglet « à vérifier » dans la vue** — il suppose de charger
  `external_refs` avec les correspondances WooCommerce, ce que la direction du
  11 août a précisément annulé. Importer la dette pour l'afficher.

**Ce que cette décision coûte si elle est tenue trop longtemps :** `woo_id` est
le **seul témoin** de ce qui est réellement en ligne, et il disparaît avec
WooCommerce. Passé ce point, plus rien ne permet de dire quels produits ont
changé d'état. La liste des 257 se reproduit à volonté par `catalog-import`
tant que la base NeDB de référence existe ; elle ne se reproduit plus après.

**Remise en cause si :** l'export approche sans que la question soit reprise,
ou si WooCommerce est arrêté avant que la liste ait été regardée une fois.

## La base NeDB de référence est celle de l'installation, pas celle de développement — 2026-08-11

Décision du propriétaire, prise en constatant que le catalogue chargé était
incomplet.

**La référence est `%APPDATA%\AppPOS\data`.** `I:\AppPOS\AppServe\data` est une
copie de développement **périmée**, et tout ce qui a été mesuré dessus est à
reprendre.

| | produits | catégories | marques | fournisseurs |
|---|---:|---:|---:|---:|
| **installation — référence** | **3034** | **463** | **287** | **43** |
| développement — périmée | 2306 | 219 | 224 | 34 |

**Plus du double de catégories.** L'audit du 2026-08-10 ne relevait que l'écart
sur les produits (+728), en le déclarant inexpliqué ; celui sur les catégories
n'était mentionné nulle part.

**Ce que la mauvaise base a coûté, et c'est le vrai enseignement :** le modèle
cible avait **supprimé le champ image des marques** sur la mesure « 0 image sur
224 ». La mesure était exacte. La base ne l'était pas. La référence porte
**225 logos sur 287**, dont **26 seulement** ont une URL WordPress : sans la
décision de copier les fichiers, 199 logos étaient perdus sans que personne le
voie.

*Une mesure juste sur la mauvaise base est une mesure fausse.* Les quatre
défauts corrigés le 11 août viennent tous de là, aucun d'une erreur de
raisonnement.

**À reprendre en conséquence :** tous les chiffres de
[`07-audit-flux-apppos.md`](../frontend/modules/site/PocketSite-docs/07-audit-flux-apppos.md)
et de [`09-modele-cible.md`](../frontend/modules/site/PocketSite-docs/09-modele-cible.md).
Le rituel annonçait d'ailleurs « 43 fournisseurs » — chiffre de l'installation —
à côté de « 2306 produits » — chiffre de la dev : **il mélangeait déjà les deux
sans le dire**, et personne ne l'avait vu.

**Écarté — corriger les documents antérieurs :** ils sont datés et font foi sur
ce qu'ils ont constaté *ce jour-là*. Ils reçoivent un avertissement en tête ;
l'état réel est au §9 de
[`10-plan-migration.md`](../frontend/modules/site/PocketSite-docs/archive/10-plan-migration.md).

**Ce que ça ne change pas :** la contrainte de ne pas toucher à la production
reste entière **côté écriture**. L'outil lit ces bases, il n'y écrit jamais.

**Remise en cause si :** la base d'installation cesse d'être la plus à jour —
par exemple si le travail reprend sur un autre poste.

## Les images du catalogue sont copiées dans PocketBase — 2026-08-11

Décision du propriétaire. **Annule le §9.2b de
[`09-modele-cible.md`](../frontend/modules/site/PocketSite-docs/09-modele-cible.md)**,
qui tranchait pour un champ texte portant des URL.

**Constaté, et c'est ce qui a fait changer d'avis :**

```
image.src   chemin AppServe relatif, servi par :3000 seulement   1710 / 1710
image.url   URL WordPress absolue                                  845 / 1710
source_url  n'existe pas
```

L'audit §1.3 affirmait que « les URL d'images viennent du `source_url`
WordPress et ne bougent pas ». **Le champ n'existe nulle part**, et l'URL ne
couvre que la moitié des images. Charger `src` produisait des images que seul
AppServe sait servir — or s'affranchir d'AppServe est l'objet de la migration.

**Donc : champs fichier, et copie des fichiers.** 4665 fichiers, 1,7 Go.
`wp_image_url` conserve l'URL d'origine quand elle existe, pour la
réconciliation avec le site.

**Écarté — ne garder que l'URL WordPress :** 865 images sur 1710 n'en ont
aucune. On en perdait la moitié.

**Écarté — faire servir `public/` par PocketApp :** remplace une dépendance à
AppServe par une autre, sans rien régler.

**Trois défauts corrigés en même temps :** les galeries produit sont conservées
(747 produits en portent une, l'audit avait conclu de leur absence sur les
*catégories* à leur absence sur les *produits*) ; les images de catégorie sont
des **objets** et étaient lues comme des chaînes ; le champ image des marques
est rétabli.

**Reste ouvert :** 36 images n'existent que sur WordPress. Les télécharger
suppose un `User-Agent` explicite — la couche anti-bot d'axemusique.shop rejette
celui de Go, voir `CLAUDE.md`.

**Remise en cause si :** le volume devient un problème, ou si une politique de
médias centralisée apparaît.

## Le lecteur de fichiers NeDB est transitoire — 2026-08-11

**Trajectoire annoncée par le propriétaire.** À terme :

1. **PocketApp importera le catalogue depuis l'API AppPos** à laquelle il est
   déjà connecté, et non depuis les fichiers NeDB ;
2. **le module stock aura un sélecteur AppPos ↔ PocketBase**, pour basculer la
   source de lecture.

**Conséquence :** `backend/catalog/nedb/` est un outil d'établissement, pas
d'exploitation. Il a servi à fixer le modèle, le chargeur et les contrôles ; le
chemin durable passera par `frontend/lib/apppos/`, qui existe déjà.

**Ce que ça préserve :** le schéma, la normalisation, la quarantaine et les
contrôles se réutilisent tels quels quelle que soit la source. **Seul le lecteur
change.** C'est précisément pourquoi la normalisation a été séparée de la
lecture dès le premier jour.

**Le sélecteur est le drapeau de bascule** prévu au ticket T7 du plan, par
défaut sur AppPos.

---

## Le modèle cible du catalogue PocketBase est arrêté — 2026-08-10

Aboutissement de la séquence imposée par le bloc « Le modèle cible se conçoit
avant la migration ». Détail complet, champ par champ, dans
[`09-modele-cible.md`](../frontend/modules/site/PocketSite-docs/09-modele-cible.md).
Ce bloc consigne les décisions ; il ne les remplace pas.

**Principe directeur retenu :** *ce qui est calculable n'est pas stocké ; ce qui
appartient à une plateforme externe ne vit pas sur l'entité métier.*

**Six collections :** `products`, `categories`, `brands`, `suppliers`
transformées ; `external_refs` créée ; `promotions` non créée.

### Ce qui est tranché

- **Le prix est TTC.** Mesuré : sur 648 produits, l'hypothèse « `price` TTC,
  marge sur base HT » est cohérente sur **636**, l'hypothèse HT sur **0**.
  Les champs deviennent `price_ttc` et `purchase_price_ht` — un champ de prix
  sans unité dans son nom est un piège qui se repaie à chaque lecture.
  `price_ht` **n'est pas stocké**, il se calcule.
- **Pas de mécanisme de promotion.** La caisse remise déjà à la ligne et au
  ticket, sans jamais lire un champ de promotion du produit. Si le besoin
  catalogue apparaît, ce sera une **entité datée**, jamais deux colonnes sur le
  produit.
- **Pas de champ `availability`.** Le besoin (« sur commande », « en réappro »)
  est crédible mais appuyé sur rien : `stock_status` n'a aucun lecteur. S'il se
  confirme, ce sera un champ neuf — pas la réintroduction du miroir WooCommerce.
- **La publication des catégories est dérivée**, pas saisie : *une catégorie est
  en ligne si elle contient un produit `published`, descendants compris ; ses
  ancêtres le sont par voie de conséquence.* Règle vérifiée exacte sur la base
  dev, 0 écart.
- **La relation marque ↔ fournisseur est réelle**, portée par
  `suppliers.brands`. Elle est saisie au formulaire fournisseur, et le schéma
  PocketBase la modélise déjà de ce côté.
- **Un produit a un ensemble de catégories, sans catégorie principale.**
- **Les identifiants externes sortent des entités**, dans `external_refs` —
  trois relations optionnelles (`product`, `category`, `brand`), une seule
  remplie. Une deuxième plateforme n'ajoute aucune colonne, et l'échec de
  publication devient une donnée au lieu d'une ligne de console.
- **Le catalogue est multi-entreprise**, avec une seule entreprise pour
  l'instant. `company` reste requis sur les quatre collections.
- **`suppliers.siren` est ajouté** — seul champ créé de toutes pièces par ce
  modèle. Même nom et même contrôle que sur `companies` (`^\d{9}$`).
- **Conservés pour un usage à construire, et non pour un usage existant :**
  `min_stock` et `manage_stock` (alertes de seuil), `banking` et
  `payment_terms` (achat fournisseur). Aucun n'a de lecteur aujourd'hui ; le
  motif est écrit pour que la conservation reste réexaminable.

### Ce qui est écarté, et pourquoi

**Écarté — garder `woo_id` sur chaque table « pour la transition » :** c'est
l'état actuel, et il a produit exactement les défauts qu'`external_refs` corrige.

**Écarté — `entity_type` + `entity_id` dans `external_refs` :** PocketBase n'a
pas de relation polymorphe ; le couple imposerait un champ texte non contraint,
donc la perte de l'intégrité référentielle — ce qu'on reproche à NeDB.

**Écarté — un champ `status` explicite sur les catégories :** il introduirait
219 valeurs dont personne n'est responsable, c'est-à-dire le mécanisme exact qui
a produit `brandsRefs`. Le choix n'est pas symétrique : passer de la règle
dérivée au champ explicite coûte une initialisation, l'inverse ne se fait pas.

**Écarté — conserver les statistiques de vente sur le produit :** `total_sold`,
`sales_count`, `revenue_total`, `last_sold_at` n'ont **aucun lecteur** dans
`frontend/`. Elles ne passent pas la migration ; leur source légitime est
`sales`.

**Écarté — `tax_rate` en énumération :** figerait le schéma sur les taux en
vigueur ; un changement de TVA imposerait une migration de collection.

**Écarté — une unicité globale sur `sku` et les `slug` :** dans un modèle
multi-entreprise elle serait fausse dès la deuxième entreprise, deux magasins
ayant légitimement le même SKU fournisseur. **Index composites `(company, sku)`
et `(company, slug)`.**

### Ce qui reste ouvert

Les autres identifiants légaux du fournisseur (`siret`, `vat_number`, `rcs`,
`ape_naf`) — à décider avec l'écran d'achat fournisseur, pas maintenant. Et la
cible de publication (WooCommerce, base SQL distante, ou les deux), qui n'a pas
à être répondue pour concevoir le modèle.

### Remise en cause si

Un besoin métier contredit une des suppressions **avec une mesure à l'appui**,
et non par principe de précaution. Les champs conservés « pour un usage à
construire » se réexaminent si l'usage n'existe toujours pas quand la logique de
stock est reprise.

## Les collections catalogue de PocketBase sont un premier jet abandonné — 2026-08-10

**Fait rapporté par le propriétaire**, et il répond à la question que le rituel
posait sans réponse (§6.5.1 : *d'où vient le schéma existant ?*).

Les collections `products`, `categories`, `brands` et `suppliers` de PocketBase
sont la **résurgence d'un premier jet**, écrit avant qu'on décide de se brancher
directement sur AppPos — décision prise, selon ses termes, *par paresse et pour
aller vite*. Elles n'ont jamais servi : elles sont vides, et le catalogue est lu
depuis AppServe.

**Conséquence sur la façon de les traiter :** elles ne sont **pas un acquis à
préserver**, et l'écart entre elles et le modèle cible n'est pas une dette à
justifier. Elles se réécrivent librement.

**Ce que la confrontation a néanmoins établi, et qui mérite d'être dit :** ce
premier jet était bon. Il porte déjà les relations dans le bon sens — dont
`suppliers.brands` du bon côté —, le contact fournisseur à plat, `barcode` en
champ de premier rang, et **aucun champ WooCommerce, aucun cache dénormalisé,
aucune statistique de vente**. Le principe directeur du modèle cible y était
déjà appliqué. Trois de ses choix ont été retrouvés indépendamment par la
conception ; c'est une confirmation, pas une coïncidence.

**Trois défauts constatés sur la base réelle**
(`%LOCALAPPDATA%\PocketReact\pb_data`, lue en copie, en lecture seule) :

1. **`categories.parent` ne cible aucune collection** —
   `collectionId = ""`. `backend/migrations/catalog.go:143` annonce en
   commentaire un correctif *« fixé après création »* qui **n'a jamais été
   écrit**. Seule relation cassée du catalogue ; invisible parce que la
   collection est vide, elle se serait manifestée à la première insertion d'un
   arbre — c'est-à-dire pendant la migration.
2. **`images` est un champ fichier**, incompatible avec la décision de conserver
   les URL WordPress. Un champ fichier PocketBase n'accepte pas une URL.
3. **`designation` est absent**, alors que la caisse et le stock le consomment —
   au point que le transformer l'ajoute hors schéma. Les collections, en l'état,
   ne pourraient pas servir le terminal.

**Piège actif, à connaître avant d'écrire la migration :** chaque
`ensure*Collection` sort si la collection **existe par son nom**
(`catalog.go:17, 88, 163, 257`). Modifier `catalog.go` ne modifiera donc aucune
base déjà installée, et une base portant d'anciennes collections homonymes
verrait `RunMigrations` les accepter telles quelles, **sans erreur et sans mise
à niveau**. Ce n'est pas seulement une gêne : c'est une convergence
silencieusement fausse.

**Deux bases coexistent, et une seule compte :**

| Base | Ce qu'elle est |
|---|---|
| `%LOCALAPPDATA%\PocketReact\pb_data` | **la vraie** — `main.go:71-75`, 23 collections |
| `I:\pockapp\pb_data` | **vestige** de novembre 2025, 8 collections, produit par le dossier `migrations/` de la racine que `CLAUDE.md` signale déjà comme non importé. Son `products` porte `price`, `cost`, `stock`, `image` |

**Ne jamais juger du schéma en place sur `I:\pockapp\pb_data`.**

**Décision d'exécution :** les quatre collections du catalogue seront
**recréées**, pas altérées — elles sont vides, la reprise est sans risque, et
c'est ce qui rend la migration rejouable (exigence du §6.5.2 du rituel).
« Recréer » signifie **ces quatre collections seulement** : la base réelle porte
aussi la caisse, les factures, l'inventaire et le menu du site. Supprimer
`data.db` est exclu.

**Remise en cause si :** le catalogue local cesse d'être vide — auquel cas la
recréation n'est plus gratuite et il faut de vraies migrations d'altération.

---

## Le modèle cible se conçoit avant la migration — on ne transpose pas AppServe — 2026-08-10

Décision du propriétaire, complément immédiat du bloc suivant.

**Recréer dans PocketBase les collections actuelles à l'identique est écarté.**
Le modèle NeDB porte les choix d'AppServe et les contraintes de WooCommerce ;
les transposer reviendrait à migrer la dette avec les données.

Séquence imposée : comprendre le modèle actuel → **concevoir le modèle cible**
→ déterminer les collections et relations nécessaires → décider du sort des
champs hérités → migrer → déplacer la logique métier.

**Les collections PocketBase déjà présentes ne sont pas définitives** —
certaines seront supprimées, d'autres profondément adaptées.

**Principe directeur :** séparer la donnée **métier** de la donnée propre à une
**plateforme externe**. Un identifiant WooCommerce n'est pas une propriété du
produit, c'est une propriété de la relation entre ce produit et une plateforme.

**Écarté — migrer d'abord, nettoyer ensuite :** le nettoyage n'arrive jamais, et
chaque écran écrit entre-temps s'appuie sur les champs qu'on voulait retirer.

**Écarté — repartir de zéro sans reprise :** 2306 produits et 842 fiches en
ligne existent ; NeDB reste la source de référence des données.

**Ce que la mesure a déjà tranché** (§4 bis de
[`08-rituel-migration-pocketbase.md`](../frontend/modules/site/PocketSite-docs/archive/08-rituel-migration-pocketbase.md),
base dev, lecture seule) :

- **aucune variante n'existe** — `type` vaut `simple` (2297) ou `service` (9) ;
- **le modèle promotionnel est une fiction** — `regular_price` diffère de
  `price` sur **4** produits, `sale_price` est renseigné sur **5**. Ces champs
  n'existent que parce que WooCommerce les attend ;
- **`meta_data` ne contient qu'une clé, `barcode`**, sur 1870 produits — une
  donnée pleinement métier à promouvoir en champ de premier rang ;
- **six champs produit sont à zéro document** : `specifications`,
  `category_ref`, `categories_refs`, `woo_status`, `sync_errors`,
  `description_short` ;
- **les marques n'ont aucune image** (0 sur 224).

**Remise en cause si :** la conception du modèle cible s'enlise au-delà de ce
que la migration ferait gagner — auquel cas on réduit le périmètre du modèle,
pas la rigueur de la séquence.

## PocketBase devient la source de vérité, et la refonte se fait d'abord tout en local — 2026-08-10

Décision du propriétaire, prise à la fin de l'audit du flux catalogue.

**La cible ultime n'est plus « publier le catalogue vers une base distante »,
c'est « s'affranchir d'AppServe ».** PocketBase, déjà embarqué dans PocketApp,
devient la source de vérité du catalogue. AppServe et sa base NeDB deviennent
une **source de référence pour les données existantes**, à migrer, puis à
abandonner.

**Et la refonte commence entièrement en local**, sans aucune contrainte de
production :

```
NeDB existante → migration des entités → PocketBase / module stock → frontend-wp local
```

Deux problèmes sont ainsi séparés, et c'est le cœur de la décision :

1. **refondre l'architecture et la source de vérité**, en local, vérifiable de
   bout en bout ;
2. **puis seulement** concevoir le transfert vers la production.

**Écarté — publier d'abord vers la base SQL distante (la cible du 2026-08-07) :**
cela revenait à figer un contrat de données avec WooCommerce et l'hébergeur
mutualisé dans l'équation, alors que la source de vérité elle-même est
appelée à changer. On aurait conçu deux fois.

**Écarté — migrer en gardant la synchronisation de production active :** l'audit
a montré que le flux actuel dérive précisément parce qu'il mélange les deux
préoccupations (§3 et §4bis.6 de [`07-audit-flux-apppos.md`](../frontend/modules/site/PocketSite-docs/07-audit-flux-apppos.md)).
Reproduire ce mélange dans la refonte serait reproduire le défaut.

**Ce que cette décision ne fait pas :** elle n'annule pas « Cible à terme : la
couche distante remplace WooCommerce comme catalogue » (2026-08-07). Elle la
**réordonne** : la couche distante reste la cible pour le site, mais elle est
désormais alimentée par PocketBase, pas par AppServe, et elle vient **après**
la refonte locale.

**Conséquence à assumer, et elle touche une contrainte de `CLAUDE.md` :**
« Ne pas modifier AppPos » et « AppPos reste autorité pendant la transition »
restent vraies **pendant la phase d'analyse**, mais la trajectoire les périme à
terme — « adapter AppPOS pour ne plus dépendre d'AppServe » signifie
explicitement modifier AppPos. Le jour où un ticket y touche, il faudra un
nouveau bloc qui annule ces contraintes, et `CLAUDE.md` devra être mis à jour
le même jour. **Ce bloc-ci ne l'autorise pas.**

**Remise en cause si :** la migration révèle qu'une fonction de la caisse dépend
d'AppServe d'une manière non reproductible dans PocketBase — auquel cas c'est le
périmètre de la migration qui se réduit, pas la caisse qui s'adapte.

## Les slugs sont fabriqués par nous, la clé de référence est le `_id` NeDB — 2026-08-10

Décision du propriétaire. Deux points liés, pris pendant l'audit du flux
catalogue ([`07-audit-flux-apppos.md`](../frontend/modules/site/PocketSite-docs/07-audit-flux-apppos.md)) :

1. **Les `slug` ne viennent plus de WooCommerce, AppPos les fabrique.**
   Aujourd'hui ils sont produits par Woo à la synchronisation, ce qui explique
   que 190 catégories sur 219 n'en aient pas : elles n'ont jamais été
   synchronisées. Sortir de WooCommerce sans reprendre la fabrication des slugs
   laisserait la majorité du catalogue sans URL.
2. **La clé de référence entre AppPos et la base SQL distante est le `_id`
   NeDB.** Pas le `woo_id` — 63 % des produits n'en ont pas et il disparaîtra ;
   pas le `sku` — 7 doublons locaux et 3 produits n'en ont pas.

**Écarté — garder `woo_id` comme clé :** revient à faire dépendre la nouvelle
base de celle qu'on retire. Et elle est absente là où on en aurait le plus
besoin (§4bis.4 de l'audit).

**Écarté — le `sku` comme clé :** signifiant donc modifiable, non unique dans
les faits, et absent sur 3 produits.

**Écarté — laisser WooCommerce fabriquer les slugs encore un temps :** c'est
l'état actuel, et il produit exactement le trou qu'on cherche à combler.

**Ce que la décision n'a pas encore tranché**, et qui revient au contrat de
données :

- **l'unicité des slugs.** Mesuré sur la base dev : une génération naïve depuis
  `name` produit **28 produits, 23 catégories et 8 marques en collision**. Il
  faut une règle de désambiguïsation, et pour les catégories elle devra
  probablement intégrer le parent (« Accessoires » existe deux fois à des
  endroits différents de l'arbre) ;
- **la stabilité.** Un slug qui suit le `name` change quand le nom change, donc
  l'URL change. Il faut décider s'il est figé à la création ou recalculé ;
- **les 847 produits qui ont déjà une `website_url` WooCommerce.** Des slugs
  fabriqués autrement changeraient ces URL déjà publiques. À arbitrer
  explicitement, ce n'est pas un détail technique.

**Ne pas réutiliser les deux `_generateSlug` existants d'AppPos tels quels.**
Ils sont deux, ils divergent sur 8 noms de marque, et celui de
`ProductSync.js:73` a deux défauts constatés : `\w` conserve le tiret bas, et
`.trim()` ne retire que les espaces — d'où `"Keeley "` → `"keeley-"`.

**Remise en cause si :** la reprise des URL existantes s'avère prioritaire sur
la cohérence des nouvelles — auquel cas il faudrait importer les slugs
WooCommerce actuels comme valeurs initiales plutôt que de tout regénérer.

**Précision ajoutée le 2026-08-10, quelques heures après ce bloc** — le corps
ci-dessus n'est pas réécrit, conformément à la règle du fichier. La phrase
« 190 catégories sur 219 n'en ont pas : elles n'ont jamais été synchronisées »
donne le bon chiffre mais la mauvaise cause. **L'absence de `woo_id` signifie
« pas en ligne », et c'est l'état voulu pour la plupart d'entre elles** : le
catalogue est celui du magasin, pas celui du site. Voir §4bis.6 de l'audit.
La décision elle-même est inchangée, et même renforcée : il faudra fabriquer
les slugs **des seules entités destinées au site**, ce qui réduit d'autant le
volume concerné.

## Le menu reste en JSON statique — l'option C est abandonnée pour lui — 2026-08-10

Le menu ne passera pas en MySQL. `server/schema.sql`, qui décrivait ce stockage,
est **supprimé**. Le fichier statique reste, définitivement, la forme du menu
publié.

Ce bloc **clôt** la partie « C ensuite » du bloc « Couche distante : JSON
statique déposé par PHP » du 2026-08-06, pour le seul menu. Le raisonnement de
ce bloc-là n'est pas désavoué — il est arrivé à son terme : on a soigné le
contrat, pris le stockage le plus simple, et le plus simple a suffi.

**Ce qui le justifie, après mise en production :** le document publié fait
quelques kilo-octets, aucun des quatre déclencheurs de §4.5 de l'audit n'est
atteint, et le menu s'affiche en ~244 ms sans PHP ni base sur le chemin de
lecture. Le passage à MySQL n'apporterait que l'historique des publications —
un besoin qui ne s'est pas manifesté en trois jours d'usage.

**Pourquoi supprimer le fichier plutôt que le garder « au cas où » :** il aurait
été trompeur. La mission suivante — sortir le **catalogue** de WooCommerce —
aura bien besoin d'une base SQL, et quelqu'un aurait ouvert `schema.sql` en
croyant y trouver un point de départ. Il décrit des publications de menu, table
`menu_publication` et colonne `payload` comprises : rien de réutilisable pour
des produits, des catégories et des marques.

**Remise en cause si :** un besoin de retour arrière sur publication du menu
apparaît — déclencheur n°2 de §4.5, toujours valable. Il se traiterait alors
sans doute dans la base du catalogue plutôt que dans une base à lui.

## Le menu publié est la seule source du menu affiché — 2026-08-10

**Annule le bloc « Le menu affiché n'est pas seulement le menu publié » du même
jour.** L'injection des sous-catégories WooCommerce dans le menu est
**supprimée** : `useNavigation.js` du dépôt du site ne lit plus les catégories,
et `useWordPress()` n'y est même plus importé. Le menu rendu est exactement le
contenu de `menu.json`.

**Ce qui a changé en quelques heures, et ce n'est pas un fait nouveau :** le
bloc annulé arbitrait en faveur du confort — l'arborescence se maintenait seule.
Le propriétaire du projet a posé une exigence qui prime : **plus aucun lien avec
WordPress pour l'affichage du menu.** Or WooCommerce est servi par WordPress.
Garder l'injection, c'était retirer la dépendance au *menu* WordPress tout en la
laissant intacte pour son *contenu* — la moitié du travail, avec l'apparence de
la totalité.

**Ce qui rend l'échange acceptable :** le menu WordPress importé porte déjà
20 sous-entrées choisies à la main. Elles remplacent exactement ce que
l'injection produisait automatiquement, en mieux : triées, nommées et masquables
depuis PocketApp. On ne perd pas une fonctionnalité, on la reprend en main.

**Trois gains, qui sont les raisons de la décision :**

- **`menu.json` redevient diagnosticable seul.** Lire le fichier publié suffit à
  savoir ce que voit un visiteur — c'était l'un des deux buts de `ref` en §3 du
  contrat, perdu par l'injection.
- **Le menu ne dépend plus d'aucune API à l'affichage.** Ni `wp/v2`, ni `wc/v3`.
  Vérifié : 15 liens rendus, tous présents dans le document publié, aucun ajout.
- **Ordre, libellé et visibilité des sous-entrées reviennent à PocketApp**, ce
  que l'injection interdisait.

**Le prix, assumé :** le menu ne suit plus le catalogue. Une nouvelle
sous-catégorie n'apparaîtra que si on l'ajoute dans PocketApp et qu'on republie.
C'est l'échange demandé — l'indépendance contre l'automatisme.

**Effet de bord qu'il a fallu traiter en même temps, et qui n'était pas
évident :** `convertToReactUrl` ne gardait que le **premier segment** d'une URL
de catégorie. C'était sans conséquence tant que les sous-catégories injectées
portaient leur `reactUrl` déjà calculée — elles ne passaient pas par cette
fonction. L'injection coupée, une entrée `guitares-folk/folk-electro` aurait été
tronquée en `guitares-folk` et aurait mené à la catégorie **parente, sans
erreur**. La troncature est supprimée ; `CategoryPage` résout sur le dernier
segment et accepte le chemin complet. Vérifié dans un navigateur.

**Remise en cause si :** maintenir les sous-entrées à la main devient une charge
— auquel cas la réponse n'est pas de rétablir l'injection, mais de générer ces
entrées dans PocketApp au moment de l'édition, où elles resteraient
maîtrisables et publiées.

## ~~Le menu affiché n'est pas seulement le menu publié~~ — 2026-08-10 — annulée le 2026-08-10 par « Le menu publié est la seule source du menu affiché »

**Constat d'abord, décision ensuite.** Le site n'affiche pas le document publié
tel quel : quand une entrée pointe vers une catégorie racine, il y **greffe les
sous-catégories lues chez WooCommerce**, au moment du rendu.
`useNavigation.js:119-135` du dépôt du site (`buildCategoryChildren`, `:85-106`)
— code antérieur au MVP, découvert en vérifiant le ticket 8, pas écrit pour lui.

Vérifié le 10 août 2026 : une entrée « Guitare classique » vers la catégorie
1096 produit à l'écran sept sous-entrées (Classiques 1/4 & 1/2, 3/4, 4/4, 7/8,
électro, pour gauchers, Flamenco) et un « Voir tout → », dont **aucune n'est
dans `menu.json`**.

**Décision : on garde.** L'arborescence reste à jour toute seule, sans rien
republier, et c'est le modèle d'hydratation voulu — le catalogue vient de
WooCommerce pendant toute la transition.

**Écarté — publier les sous-catégories comme entrées réelles :** il faudrait
recopier dans `site_menu` une arborescence qui vit ailleurs, et republier à
chaque évolution du catalogue. On échangerait une hydratation automatique
contre un problème de synchronisation que PocketApp devrait résoudre — soit la
faille 3.3 (copies non réconciliées) étendue au menu.

**Ce que ça coûte, et qu'il faut assumer les yeux ouverts :**

- **`menu.json` ne décrit pas entièrement ce que voit un visiteur.** Diagnostiquer
  le menu en lisant le seul fichier publié — un des deux buts de `ref` selon §3
  du contrat — ne suffit plus.
- **Aucun contrôle depuis PocketApp** sur les sous-catégories injectées :
  ni masquage, ni renommage, ni ordre, ni exclusion.
- **Le menu dépend encore de WooCommerce à l'affichage.** Le MVP a retiré la
  dépendance au *menu* WordPress, pas celle-ci.
- **La faille 3.2 s'applique en silence** : le site ne charge que 188 catégories
  (2 pages de 100, `hide_empty`) ; au-delà, des enfants manqueraient sans erreur.
- **Décalage visible** : menu publié prêt à ~470 ms, catégories à ~4,2 s. Le
  sous-menu se remplit après coup.
- **Condition non évidente** : l'injection n'a lieu que pour une catégorie
  **racine** (`cat.parent === 0`, `useNavigation.js:128`) et si
  `VITE_USE_REACT_CATEGORIES` vaut `true`. Une entrée vers une sous-catégorie
  n'aura pas d'enfants, sans que rien ne le signale.

**Remise en cause si :** la couche distante remplace WooCommerce comme catalogue
— l'injection n'aurait alors plus de source, et la question se reposera d'
elle-même. Ou si le besoin apparaît de maîtriser l'ordre ou la visibilité des
sous-entrées depuis PocketApp.

## Clé de publication dédiée, document composé en React, POST émis par le Go — 2026-08-08

Trois décisions liées, prises ensemble parce qu'elles se déterminent l'une
l'autre. Mise en œuvre : ticket 5b (le réglage), ticket 6 (l'usage).

**1. La clé de publication est distincte de celle du mini-SaaS.**
`site_publish_api_key` (`backend/secrets/secrets.go`), chiffrée dans
`app_settings` par le `SecretManager`, saisie depuis Réglages > Clés API. L'URL
de l'endpoint l'accompagne en réglage **non chiffré** (`site_publish_url`) :
ce n'est pas un secret, et en dur elle imposerait de recompiler pour viser un
autre serveur.

**Écarté — réutiliser `notification_api_key` :** c'est ce qui avait été fait au
premier essai, la clé ayant été générée par le mini-SaaS. Deux raisons de ne pas
le garder. D'abord un secret unique pour deux services sans rapport : le
mini-SaaS peut la faire tourner sans savoir que la publication en dépend, et la
publication tomberait en `401` sans explication. Ensuite, et c'est décisif,
`GET /api/settings/pocketapp-key` (`backend/routes/secrets_routes.go:125`) la
renvoie **déchiffrée sans garde admin**, contrairement aux quatre routes
voisines — elle est appelée ainsi par `frontend/lib/credits.ts:22`. Tout ce qui
atteint `127.0.0.1:8090` peut donc la lire. **Cette route est une faille
connue, non corrigée, et hors périmètre du ticket** : la décision consiste à ne
pas lui confier une seconde responsabilité.

**2. Le document publié est composé en React, pas en Go.**
L'éditeur (ticket 4) produit le JSON complet — aplatissement, exclusion des
entrées masquées et de leurs descendants, résolution `ref` → `url` — et l'envoie
à la couche Go.

**Écarté — tout composer en Go :** la résolution part d'un identifiant
WooCommerce lu dans AppPos (bloc « Origine des destinations du menu »), et le
client AppPos n'existe **qu'en TypeScript** (`frontend/lib/apppos/`) ; aucun
fichier `.go` ne parle à `:3000` — vérifié. Il aurait fallu réécrire ce client
en Go : seconde authentification, second jeton, second chemin vers AppPos, donc
le point 2 de `CLAUDE.md` en double.

**Coût accepté :** le Go poste un document qu'il n'a pas composé et ne peut donc
pas garantir conforme. L'endpoint PHP reste le seul gardien du contrat — c'est
son rôle, et la raison pour laquelle il renvoie la liste **complète** des
erreurs plutôt que la première.

**3. Le POST part du Go, jamais du React.** Le front envoie le document à sa
propre couche Go, qui lit la clé et pose l'en-tête `X-API-Key`. La clé ne
descend jamais dans le renderer — aucune route ne la relit, contrairement au
schéma de `credits.ts`.

**Écarté — poster depuis le React avec la clé récupérée par une route :** ce
serait reproduire exactement le problème du point 1, et rapprocher la clé du
bundle, famille de la faille 3.1.

**Écarté — une variable `VITE_` :** tout ce qui est préfixé `VITE_` est inliné
en clair dans le JavaScript livré. C'est la faille 3.1 elle-même.

**Remise en cause si :** un client AppPos en Go apparaît pour une autre raison
(alors le point 2 se rediscute), ou la publication doit avoir lieu sans
interface — tâche planifiée, second poste — car le React ne serait plus là pour
composer.

## Où vit le code du serveur mutualisé — 2026-08-07

Le code PHP qui tourne sur l'hébergement d'axemusique.shop est versionné dans
**ce dépôt-ci, sous `server/`**. Il ne s'exécute pas dans PocketApp : il est
déposé par FTP, à la main, une fois. Rien du binaire Wails ne l'importe.

C'est la question ouverte de §7.2 de
`frontend/modules/site/PocketSite-docs/03-audit-resultats.md` — « dépôt dédié,
ou dossier dans PocketApp ? », renvoyée au ticket 5.

**Ce qui tranche :** PocketApp est le seul appelant de cet endpoint, et le
contrat qu'ils partagent (`05-contrat-menu.md`) vit déjà ici. Les deux côtés du
même contrat changent ensemble, dans le même commit, ou ils divergent.

**Écarté — un dépôt dédié :** quelques fichiers PHP dans un dépôt à eux, c'est
le maillon qu'on oublie de cloner, qu'on ne met pas à jour, et dont on découvre
six mois plus tard qu'il ne correspond plus à ce qui est en ligne. C'est
exactement l'angle mort que la note « Tickets 5 et 7 : versionner le code
serveur » de §5 de l'audit voulait éviter.

**Écarté — le thème enfant WordPress (`I:\divi-child`, dossier `child/`) :**
c'est pourtant un domicile réel, versionné, et déjà déployé sur ce serveur —
c'est là que vit `functions.php`. Trois raisons de ne pas y aller. Le MVP existe
pour **sortir** le menu de WordPress : y remettre le code de sortie le rend
dépendant du thème, donc d'une mise à jour de thème ou d'un changement de
constructeur de page. Le contrat et son producteur seraient alors dans deux
dépôts, avec le consommateur (`frontend-wp/`) dans le même que le producteur —
la pire répartition des trois. Enfin `child/` est chargé par WordPress à chaque
requête du site, alors que cet endpoint doit rester **hors du chemin WordPress**
(§1 du contrat : hors `wp-content/`, qu'une restauration WP peut balayer).

**Aucune clé dans le dépôt.** `server/config/config.php` porte la clé
`X-API-Key` et est ignoré par Git (`server/.gitignore`) ; `config.php.example`
est versionné à côté. Modèle repris du mini-SaaS `pocketapp.5sensprod.com`
(`api/`, configuration hors dépôt, `schema.sql`), comme le recommandait §5 de
l'audit.

**`server/schema.sql` est versionné mais n'est pas joué.** Il décrit le stockage
MySQL de l'option C, pour que la bascule reste une après-midi. Aucun des quatre
déclencheurs de §4.5 n'est atteint : la décision « A pour le MVP, C ensuite »
tient inchangée.

**Remise en cause si :** un second consommateur du code serveur apparaît sans
lien avec PocketApp, ou le serveur acquiert un déploiement automatisé — auquel
cas c'est le pipeline, pas le dépôt, qui décide.

## Cible à terme : la couche distante remplace WooCommerce comme catalogue — 2026-08-07

**Intention consignée, rien d'étudié, aucun travail engagé.** Ce bloc existe
pour que la cible ne se reperde pas entre deux sessions, pas pour la commencer.

À terme, la couche distante posée au ticket 5 — script PHP de réception,
données servies en statique — a vocation à porter **le catalogue** du site
(produits, catégories, marques), et non le seul menu. WooCommerce cesserait
alors d'être la source du site ; sa médiathèque, elle, reste (§4.6 de l'audit).

**Ce qui rend la cible envisageable :** le site est une vitrine sans vente en
ligne (§2.4 de l'audit). Pas de tunnel d'achat, pas de compte client, pas de
commande à préserver. C'est un problème de lecture de données. Et c'est aussi la
réponse durable à la faille 3.1 : plus de clés WooCommerce dans le bundle si le
site ne parle plus à WooCommerce.

**Ce qui n'est pas tranché** — les trois questions de §7.3 de l'audit restent
ouvertes, mot pour mot : le volume réel une fois publié, la stratégie d'images,
la recherche côté site. À quoi s'ajoute que ~2000 produits ne se servent pas en
un fichier unique — c'est le déclencheur n°1 de §4.5, donc cette cible **passe
par l'option C**, elle ne s'atteint pas depuis A.

**Ce que ce bloc n'autorise pas :** anticiper. La migration des produits et la
bascule AppPos → PocketApp sont explicitement reportées en §6 de l'audit, et
AppPos reste autorité pendant toute la transition. Aucun ticket du MVP ne s'en
approche.

**Remise en cause si :** le MVP menu échoue à tenir en production, ou WordPress
doit rester pour une raison qui n'apparaît qu'à l'usage — auquel cas la cible
n'est pas seulement repoussée, elle est fausse.

## Origine des destinations du menu — 2026-08-06

L'éditeur du ticket 4 propose les destinations **lues depuis AppPos**, en
lecture seule via le client existant (`frontend/lib/apppos/`), et `ref_id`
stocke l'**identifiant WooCommerce** de la cible. Aucun nouveau point d'entrée
réseau : AppPos est déjà le point 2 de `CLAUDE.md`.

C'est l'arbitrage que §7 de
`frontend/modules/site/PocketSite-docs/05-contrat-menu.md` renvoyait
explicitement au ticket 4, et dont `ref_id` en chaîne opaque attendait la
réponse.

**Les deux faits qui l'imposent sont DÉCLARÉS, pas lus dans le code** — ils
n'étaient écrits nulle part avant ce bloc, et personne ne les a vérifiés
depuis le dépôt :

1. les collections `products`, `brands`, `categories` et `suppliers` de
   PocketBase local sont **vides** : elles ne contiennent pas encore les
   données d'AppPos ;
2. AppPos porte dans NeDB les **identifiants WooCommerce** des catégories,
   marques et produits, parce qu'il est synchronisé avec Woo.

**Écarté — PocketBase local :** le fait 1 le disqualifie. Les hooks existants
(`frontend/lib/queries/categories.ts`) sont branchés, mais sur des collections
sans lignes ; l'éditeur n'aurait rien à proposer. Le choisir aurait aussi
désigné la copie comme autorité, ce que le ticket 1 avait justement refusé de
faire par effet de bord du typage.

**Écarté — WooCommerce interrogé directement :** ce serait une quatrième sortie
réseau, à inscrire dans `CLAUDE.md`, et elle s'appuierait sur les clés
WooCommerce qui sont la faille 3.1 — déclarée prioritaire sur tous les tickets.
Passer par AppPos donne le même identifiant sans ouvrir ce chemin.

**Écarté — repousser l'arbitrage (liens manuels seuls au ticket 4) :** le
contrat posait la question ici. La laisser ouverte aurait obligé à revenir sur
l'éditeur une fois écrit.

**Conséquence pour le ticket 6 :** la résolution `ref` → `url` part d'un
identifiant WooCommerce, ce qui est aussi la forme de l'exemple du contrat
(`"ref": { "type": "category", "id": "142" }`). Aucune table de correspondance
intermédiaire à construire.

**Remise en cause si :** AppPos cesse d'être synchronisé avec WooCommerce, ou
le site cesse de servir ses URL de catégorie depuis WooCommerce. Le
remplissage des collections locales par les données d'AppPos ne suffirait pas :
il faudrait en plus que ces copies portent l'identifiant WooCommerce.

**Effet sur le bloc suivant :** la condition de remise en cause de `ref_id` en
relation PocketBase est **renforcée, pas levée**. Le ticket 4 ne désigne pas
PocketBase local comme référentiel des destinations — il désigne AppPos. La
première des deux conditions est donc non seulement non remplie, mais écartée
sur un fait structurel.

## Schéma de la collection `site_menu` — 2026-08-06

La destination d'une entrée est stockée en **référence dénormalisée**
(`link_type` en `select`, `ref_id` en chaîne opaque), et la collection **n'a
pas de champ `company`**. Schéma complet : `backend/migrations/site_menu.go`.

**Écarté — `ref_id` en relation PocketBase :** elle aurait tranché, au ticket 1,
une question que §7 de
`frontend/modules/site/PocketSite-docs/05-contrat-menu.md` laisse explicitement
ouverte jusqu'au ticket 4 — lequel des trois référentiels (AppPos, WooCommerce,
PocketBase local) fait foi pour une destination. Une relation ne peut pointer
que vers PocketBase local, qui n'est qu'une copie des référentiels d'AppPos
(faille 3.3 de l'audit) ; l'exemple du contrat, lui, porte un identifiant
WooCommerce. Choisir la relation aurait donc désigné la copie comme autorité
par un effet de bord du typage, et il aurait fallu une migration pour le
défaire.

**L'absence de `company` est délibérée, ce n'est pas un oubli.** `categories`,
`products`, `customers` et `invoices` portent toutes une relation `company`
requise ; `site_menu` en est la seule exception du catalogue local, et un
lecteur futur y verrait une erreur sans cette note. La raison : ces collections
décrivent l'activité d'une entreprise, `site_menu` décrit **un site**, et il
n'y en a qu'un. Ajouter le champ aurait anticipé le multi-site sans besoin, et
imposé de choisir une société à la publication alors que la publication ne
s'adresse qu'à axemusique.shop.

**Remise en cause si :**

- `ref_id` — le ticket 4 désigne PocketBase local comme référentiel des
  destinations, **et** on veut que l'intégrité référentielle détecte les
  destinations orphelines, plutôt que la vérification faite à la publication.
  Les deux conditions, pas une seule : sans la première, une relation ne peut
  pas pointer vers la bonne source.
- `company` — un second site est piloté depuis PocketApp, ou le multi-poste
  arrive (§6 de `03-audit-resultats.md` le reporte aujourd'hui).

## Contrat du menu publié — 2026-08-06

Le menu publié est servi à une **URL stable et non versionnée**,
`https://axemusique.shop/data/menu.json`, et chaque entrée porte une
**référence typée `{type, id}` accompagnée de l'`url` résolue à la
publication**. Forme complète : `frontend/modules/site/PocketSite-docs/05-contrat-menu.md`.

**Écarté — URL versionnée (`menu.v1.json`) :** changer de version obligerait à
redéployer le site, par FTP et sans retour arrière (faille 3.7). Or c'est
précisément ce que le contrat existe pour éviter. La version est un champ dans
le document, comme le prévoyait déjà §4.4 de l'audit.

**Écarté — destination en URL brute, sans référence typée :** le site ne saurait
pas d'où vient un lien, et personne ne pourrait détecter une destination devenue
orpheline. La référence seule, sans URL résolue, a été écartée symétriquement :
elle obligerait le site à savoir ce qu'est une catégorie WooCommerce et à
refaire la résolution — du travail dans le dépôt le plus coûteux à redéployer.
On publie donc les deux : le site ne lit que `url` et reste bête, PocketApp
garde `ref` et l'intelligence.

**Écarté — arbre imbriqué à `children` :** le site consomme aujourd'hui une
liste plate `{id, title, url, parent}` (`wordpress.js:52-71` du dépôt du site).
Publier un arbre aurait imposé un aplatissement, donc une modification des
composants de navigation, pour un bénéfice nul.

**Le raisonnement, commun aux trois :** c'est §4.4 de l'audit appliqué un cran
plus bas — mettre l'intelligence du côté qui se redéploie facilement. PocketApp
se rebuilde à volonté ; le site part par FTP sans retour arrière.

**Vérifié à cette occasion :** le `.htaccess` racine garde ses deux règles de
réécriture par `RewriteCond %{REQUEST_FILENAME} !-f`. Un fichier réellement
présent à `/data/menu.json` est servi en statique, sans PHP sur le chemin de
lecture, sans modification du `.htaccess` au ticket 7.

**Remise en cause si :** la couche distante doit accueillir autre chose que le
menu — un second objet publié remettrait en question le chemin `/data/menu.json`
et l'idée d'un document unique. Ou si un consommateur autre que le site doit
lire le fichier et a besoin de plus que `url`.

## Documentation dans le dépôt, Obsidian pour le personnel — 2026-08-06

`CLAUDE.md`, `docs/DECISIONS.md` et les `<Nom>-docs/` de module sont versionnés
avec le code. Obsidian sert d'éditeur Markdown sur ces fichiers, et de vault
séparé non versionné pour le personnel et le transversal.

**Écarté :** tenir la connaissance projet dans Obsidian. Elle se désynchronise
du code dès le premier renommage, et un agent ne la lit pas.

**Remise en cause si :** un second contributeur arrive, ou si les notes
personnelles commencent à contenir des décisions projet — signe que la
frontière ne tient pas.

## Pas de surcouche d'orchestration d'agents — 2026-08-06

Claude Code dans le dépôt suffit. Le problème est le contexte donné aux agents,
pas la coordination entre eux.

**Écarté :** frameworks multi-agents. Ils résolvent un problème de coordination
qu'un développeur seul n'a pas.

**Remise en cause si :** des sessions parallèles sur des modules différents
deviennent la norme.

## Couche distante : JSON statique déposé par PHP — 2026-08-06

Pour le MVP menu : PocketApp pousse en HTTP vers un script PHP protégé par
`X-API-Key`, le script écrit un `menu.json`, le site le lit en statique — **pas
de PHP sur le chemin de lecture**. Ensuite : MySQL en stockage, JSON statique
en lecture (option C), quand les produits arriveront.

**Écarté — MySQL avec endpoints PHP en lecture :** paie le coût de MySQL sur le
chemin de lecture du site. On ne quitte pas un intermédiaire PHP+MySQL pour en
rebâtir un plus petit.

**Écarté — API Node/Express, PocketBase distant, SQLite distant :** impossibles
sur mutualisé, aucun processus persistant.

**Le raisonnement, qui est la vraie décision :** ce qui engage n'est pas le
stockage mais le **contrat** — l'URL appelée et la forme du JSON. Le contrat est
coûteux à changer parce qu'il vit dans un build déployé par FTP sans retour
arrière. Ce qu'il y a derrière l'URL se remplace en une après-midi. Donc :
soigner le contrat, prendre le stockage le plus simple.

**Remise en cause si :** un des quatre déclencheurs de la section 4.5 de
`frontend/modules/site/PocketSite-docs/03-audit-resultats.md` est atteint.

## PocketBase local est acquis — antérieur, consigné le 2026-08-06

Wails embarque PocketBase (SQLite) sur `:8090`. Ce n'est pas une option à
réévaluer, c'est l'existant. La question « SQLite ou JSON » ne concernait que la
couche **distante** ; la couche locale est déjà tranchée.

**Remise en cause si :** jamais, dans le cadre de la refonte du site.

## AppPos reste autorité pendant la transition — antérieur, consigné le 2026-08-06

AppPos détient produits, catégories, marques et fournisseurs. PocketBase local
en contient des copies. PocketApp le remplacera, mais pas maintenant.

**Coût accepté et connu :** chaque fonctionnalité de PocketApp qui lit AppPos
alourdit la bascule finale. Coût croissant avec le temps.

**Remise en cause si :** le coût de la bascule devient supérieur à celui de
maintenir les deux — à réévaluer, pas à subir.
