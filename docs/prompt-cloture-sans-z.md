# Prompt — la clôture de journée n'émet pas son rapport Z

À copier dans une session neuve, après avoir remplacé les `<…>`. Écrit le
31 août 2026.

---

Dépôt `I:\pockapp` (PocketApp — caisse Wails Go + React + PocketBase). Réponds
en français.

## Le défaut, reproduit

À la clôture de la journée depuis le terminal de caisse, **le rapport Z n'est
pas créé**. Le ticket de la journée apparaît bien dans le journal des ventes,
mais tagué **« 1 ticket à clôturer »** — la journée reste « non clôturée » à
l'écran, indéfiniment.

Reproduit sciemment. **Une sauvegarde de la base a été prise AVANT l'ouverture
de la journée et la création du ticket** : elle est ici →
`<CHEMIN VERS LA SAUVEGARDE>`. Elle permet de rejouer le scénario autant de fois
que nécessaire.

## Ce que tu dois savoir sans le redécouvrir

Pars de ces fichiers, dans cet ordre, et suis leurs imports plutôt que
d'explorer :

- `backend/routes/cash_routes.go:277` — `POST /api/cash/session/:id/close`,
  ce que le bouton appelle réellement.
- `backend/routes/cash_routes.go:457` et `:469` — `GET /api/cash/reports/z`,
  **c'est CE point d'entrée qui appelle `GenerateRapportZ`, et il GÉNÈRE ET
  SAUVEGARDE** un document fiscal sur un GET. Vérifie qui l'appelle, et quand.
- `frontend/lib/queries/cash.ts:515` — `useCloseCashSession`, ce que le
  dialogue déclenche.
- `frontend/modules/cash/components/sessions/CloseSessionDialog.tsx` — le
  dialogue de clôture.
- `frontend/modules/cash/CashTerminalPage.tsx` — « Commencer la journée » et le
  bandeau d'état.
- `backend/reports/cash_reports.go:1421` — `GenerateRapportZ`, et surtout
  `cash_reports.go:1490-1496` : **il ne retient que les sessions dont le
  `closed_at` tombe DANS la journée du rapport.** Une session fermée avec un
  `closed_at` du lendemain sort de toute clôture **sans erreur**.
- `backend/reports/z_manquants.go` — ce que `z-clotures` considère comme une
  journée à clôturer ; le même prédicat devrait valoir à l'écran.
- `backend/reports/journal.go` (autour de `SessionsEnAttenteDeZ` et
  `TicketsHorsZ`) — c'est ce qui produit le badge « ticket(s) à clôturer ».
  L'état de clôture se lit **sur les sessions des tickets, jamais sur la date
  des rapports** : le commentaire explique pourquoi, ne l'inverse pas.
- `docs/DECISIONS.md`, blocs du 29 août 2026 « La journée s'ouvre d'un geste,
  mais son fonds ne se saisit plus » et « Les ventes du client se reprennent par
  l'id ».
- `frontend/modules/cash/PocketCash-docs/07-sortir-des-sessions.md` — le contrat
  des sessions.

## Ce qui est attendu

1. **La clôture de la journée émet le Z**, correctement chaîné et numéroté.
2. **Le journal des ventes affiche la journée comme clôturée**, en citant le Z —
   exactement comme il le fait déjà pour les journées qui en ont un. Ne
   réinvente pas cet affichage, il fonctionne.
3. **Une journée clôturée ne se rouvre pas le même jour.**
4. **Une nouvelle journée ne s'ouvre qu'à partir du lendemain du Z.**

## Comment je veux que tu procèdes

**1 — Diagnostiquer avant de toucher.** Dis-moi, chemin et ligne à l'appui,
**pourquoi** le Z n'est pas créé : la clôture n'appelle-t-elle jamais la
génération ? l'appelle-t-elle et échoue-t-elle en silence ? le `closed_at`
écrit tombe-t-il hors de la journée du rapport ? Ne corrige rien avant d'avoir
nommé la cause. Si tu hésites entre deux causes, dis-le et mesure.

**2 — Me montrer le flux tel qu'il est**, du clic jusqu'à l'écriture, avant de
proposer le flux corrigé.

**3 — Trois pièges à ne pas déclencher.**

- **Un Z ne se supprime pas.** Il est numéroté, haché, il part chez le
  comptable. Une correction qui émet un Z de trop est pire que le défaut :
  `z-clotures` a déjà failli sceller un Z **vide** (0 ticket, 0,00 €) le 29 août,
  d'où son drapeau `-jour`. **N'émets jamais de Z pour une journée sans
  activité.**
- **`SessionDuJour` (`backend/session_du_jour.go`) est un filet**, et il sert à
  `CreateCashMovementIfEspeces` : un encaissement espèces un jour où personne
  n'a ouvert le terminal doit trouver une session, **sinon le mouvement est
  perdu, en silence**. Interdire l'ouverture d'une journée après clôture ne doit
  PAS reprendre ce filet. Dis-moi explicitement comment tu concilies l'exigence
  4 avec lui — c'est le vrai point dur de la demande, et je veux ton arbitrage
  avant le code, pas après.
- **Une `cash_session` ne s'efface JAMAIS**, ni la collection ni un
  enregistrement (`backend/reports/z_repair.go:224-231` échoue si une session
  manque, et 65 rapports deviendraient irréparables).

**4 — Un seul chemin d'agrégation.** `aggregateZ` + `z_lignes.go`, partagés par
`GenerateRapportZ`, `GenerateRapportX`, `z-repair` et le journal. **Ne
réimplémente aucune de ces règles**, ni en Go ni en TypeScript : c'est
exactement ce qui a produit la régression du 20 mai 2026, trois mois de tickets
comptés deux fois sur un document fiscal. L'écran affiche ce que le Go calcule.

**5 — Prouver par le rejeu, sur la sauvegarde.** Restaure la sauvegarde dans un
dossier à part et rejoue le scénario complet de bout en bout : ouvrir la
journée, encaisser un ticket, clôturer. Montre-moi le Z émis, le journal des
ventes sans badge, et le refus de rouvrir la journée. **N'écris jamais dans
`%LOCALAPPDATA%\PocketReact\pb_data` pour tester** — passe par `-data` ou par une
copie.

**6 — Des tests, du côté où vit la règle.** `go test ./backend/...` et
`pnpm test` doivent passer. Ajoute au moins un gardien sur la cause trouvée, et
un sur « une journée clôturée ne se rouvre pas ». Les tests existants nomment
leur règle en français, suis cette convention.

**7 — Vérifier avec `pnpm build:client`** — `npx tsc --noEmit` passe là où le
build réel échoue.

**8 — Consigner.** Un bloc dans `docs/DECISIONS.md` : la cause mesurée, le flux
corrigé, et ce que tu as écarté. Commit à part du correctif si tu as touché à
autre chose en chemin.

## Contraintes qui ne bougent pas

- **Ne lance pas de serveur ni l'application sans me le demander.**
- Commandes en PowerShell (`$env:LOCALAPPDATA`).
- Précise **toujours** si l'application doit être fermée.
- `pnpm format` réécrit tout le dépôt : **ne formate que tes propres fichiers.**
- Vérifie `git status` avant de commencer.
- Distingue ce qui est **lu dans le code** (chemin et ligne) de ce qui est
  **rapporté**. Perdre le fil vaut mieux que deviner : le dire.
