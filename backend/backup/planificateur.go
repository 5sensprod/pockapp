// backend/backup/planificateur.go
// ═══════════════════════════════════════════════════════════════════════════
// PLANIFICATEUR — LA SAUVEGARDE QUI NE SE VOIT PAS
// ═══════════════════════════════════════════════════════════════════════════
// L'exigence tient en une phrase : « transparente pour le client, et jamais
// bloquante pour le POS ». Elle se traduit en cinq règles, toutes tenues ici,
// et chacune pour une raison qu'on peut nommer.
//
//  1. TOUT est dans une goroutine détachée. Aucun chemin de la caisse
//     n'attend jamais une sauvegarde — ni l'encaissement, ni la clôture.
//
//  2. UNE SEULE à la fois (`enCours`). Sans ce verrou, un réseau lent
//     empilerait les envois jusqu'à saturer la liaison du magasin, et le
//     symptôme serait « la caisse rame », jamais « la sauvegarde déborde ».
//
//  3. Une échéance MANQUÉE ne se rattrape pas en rafale. On veut un snapshot
//     par période, pas la volée de ceux qu'un poste éteint deux semaines
//     aurait « ratés ».
//
//  4. Un échec est JOURNALISÉ, jamais affiché. Le client tient une caisse ; un
//     message d'erreur réseau au comptoir est une nuisance, pas une
//     information. L'état reste lisible côté réglages, et c'est nous qui le
//     regardons.
//
//  5. Le premier passage est DIFFÉRÉ. Au démarrage, le poste ouvre sa journée,
//     charge son catalogue, monte son temps réel : lui prendre en plus un
//     VACUUM et 5 Mio d'envoi à cet instant précis est le seul moment où la
//     sauvegarde se verrait.
//
// ─── Ce que le planificateur ne fait pas ───────────────────────────────────
// Il ne restaure rien, et il n'y a AUCUN chemin de restauration dans
// l'application du client. Restaurer est un geste de développement, fait
// depuis backend/cmd/snapshot-restore, sur un autre poste. Un bouton
// « restaurer » sur une caisse en service ne peut que détruire une journée de
// ventes.
// ═══════════════════════════════════════════════════════════════════════════

package backup

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/pocketbase/pocketbase"

	"pocket-react/backend/secrets"
)

const (
	// delaiPremierPassage : voir la règle 5 ci-dessus.
	delaiPremierPassage = 10 * time.Minute

	// periodeVerification : à quelle fréquence on se demande si une sauvegarde
	// est due. Ce n'est PAS la fréquence des sauvegardes, qui est un réglage.
	// Un quart d'heure suffit à ne pas rater une échéance de plusieurs heures,
	// et ne coûte rien : le contrôle est une lecture de réglage.
	periodeVerification = 15 * time.Minute

	// intervalleParDefaut, en heures, quand le réglage est absent ou illisible.
	intervalleParDefaut = 24
)

// EtatSauvegarde est ce qu'on sait de la dernière tentative. Sérialisé dans le
// réglage SettingBackupDernierEtat, et rendu par la route d'état.
type EtatSauvegarde struct {
	DernierSucces  string `json:"last_success,omitempty"` // RFC 3339
	DernierIDSnap  string `json:"last_snapshot_id,omitempty"`
	DerniereTaille int64  `json:"last_plain_size,omitempty"`
	DernierEchec   string `json:"last_failure,omitempty"` // RFC 3339
	DerniereErreur string `json:"last_error,omitempty"`
	EnCours        bool   `json:"running"`
}

// Planificateur tient l'horloge et le verrou.
type Planificateur struct {
	pb *pocketbase.PocketBase
	sm *secrets.SecretManager

	appVersion string

	mu      sync.Mutex
	enCours bool
	arret   chan struct{}
}

// NouveauPlanificateur construit le planificateur. Il ne démarre rien.
func NouveauPlanificateur(pb *pocketbase.PocketBase, appVersion string) *Planificateur {
	return &Planificateur{
		pb:         pb,
		sm:         secrets.NewSecretManager(pb),
		appVersion: appVersion,
		arret:      make(chan struct{}),
	}
}

// Demarrer lance la boucle en tâche de fond. Rend la main immédiatement.
func (p *Planificateur) Demarrer() {
	go func() {
		log.Printf("💾 sauvegarde : planificateur armé, premier contrôle dans %s", delaiPremierPassage)

		timer := time.NewTimer(delaiPremierPassage)
		defer timer.Stop()

		select {
		case <-timer.C:
		case <-p.arret:
			return
		}

		p.controlerEtSauvegarder()

		ticker := time.NewTicker(periodeVerification)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
				p.controlerEtSauvegarder()
			case <-p.arret:
				log.Println("💾 sauvegarde : planificateur arrêté")
				return
			}
		}
	}()
}

// Arreter stoppe la boucle. Une sauvegarde déjà en cours n'est PAS
// interrompue : la couper au milieu laisserait un envoi incomplet côté
// serveur, et il faudrait le reprendre. On la laisse finir.
func (p *Planificateur) Arreter() {
	select {
	case <-p.arret: // déjà fermé
	default:
		close(p.arret)
	}
}

// controlerEtSauvegarder décide s'il faut y aller, puis y va.
func (p *Planificateur) controlerEtSauvegarder() {
	if !p.actif() {
		return
	}
	if !p.echeanceAtteinte() {
		return
	}
	if err := p.Executer(); err != nil {
		// Journalisé, PAS affiché. Règle 4.
		log.Printf("💾 sauvegarde : échec — %v", err)
	}
}

func (p *Planificateur) actif() bool {
	v, err := p.sm.GetSetting(secrets.SettingBackupActif)
	if err != nil {
		return true // absent = actif, cf. la constante
	}
	return strings.TrimSpace(v) != "0"
}

func (p *Planificateur) intervalle() time.Duration {
	v, err := p.sm.GetSetting(secrets.SettingBackupIntervalHeures)
	if err != nil {
		return intervalleParDefaut * time.Hour
	}
	n, err := strconv.Atoi(strings.TrimSpace(v))
	if err != nil || n <= 0 {
		return intervalleParDefaut * time.Hour
	}
	return time.Duration(n) * time.Hour
}

// echeanceAtteinte compare l'horodatage du dernier SUCCÈS à l'intervalle.
// C'est bien le dernier succès, pas la dernière tentative : sinon une série
// d'échecs réseau repousserait indéfiniment la prochaine sauvegarde, et le
// poste finirait sans copie sans que personne ne l'ait décidé.
func (p *Planificateur) echeanceAtteinte() bool {
	etat := p.LireEtat()
	if etat.DernierSucces == "" {
		return true
	}
	dernier, err := time.Parse(time.RFC3339, etat.DernierSucces)
	if err != nil {
		return true
	}
	return time.Since(dernier) >= p.intervalle()
}

// Executer fabrique et envoie un snapshot, tout de suite. C'est le point
// d'entrée commun du planificateur et du déclenchement manuel.
func (p *Planificateur) Executer() error {
	p.mu.Lock()
	if p.enCours {
		p.mu.Unlock()
		return fmt.Errorf("une sauvegarde est déjà en cours")
	}
	p.enCours = true
	p.mu.Unlock()

	defer func() {
		p.mu.Lock()
		p.enCours = false
		p.mu.Unlock()
	}()

	err := p.executerUneFois()
	p.noter(err)
	return err
}

// EnCours dit si une sauvegarde tourne, pour la route d'état.
func (p *Planificateur) EnCours() bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.enCours
}

func (p *Planificateur) executerUneFois() error {
	// ── Configuration ───────────────────────────────────────────────────────
	endpoint, _ := p.sm.GetSetting(secrets.SettingBackupURL)
	cleAPI, _ := p.sm.GetSecret(secrets.KeyBackupAPI)

	// La clé AVANT le client : celui-ci annonce son empreinte au serveur, ce
	// qui permet de dire plus tard quel snapshot est lisible par quelle clé.
	cle, err := p.CleChiffrement()
	if err != nil {
		return err
	}

	// ── La clé de chiffrement ne doit JAMAIS être la clé API ────────────────
	//
	// `clients.api_key` est stockée EN CLAIR dans la base du mini-SaaS et
	// affichée dans son interface d'administration. Si la clé de chiffrement
	// porte la même valeur, le serveur détient de quoi déchiffrer les
	// sauvegardes — et la propriété centrale du dispositif, « une fuite de
	// l'hébergement ne livre aucune facture », ne tient plus.
	//
	// Le contrôle est ici, sur le chemin d'EXÉCUTION, et pas seulement à la
	// saisie : c'est le seul endroit qui rattrape un poste déjà configuré de
	// travers. Il vaut mieux ne pas sauvegarder du tout que sauvegarder en
	// donnant la clé au serveur — l'erreur remonte à l'écran, elle ne passe
	// pas inaperçue.
	if err := ClesDistinctes(hex.EncodeToString(cle), cleAPI); err != nil {
		return err
	}

	client, err := NouveauClient(endpoint, cleAPI, p.appVersion, p.origine(), cle)
	if err != nil {
		return err
	}

	// ── Fabrication ─────────────────────────────────────────────────────────
	//
	// Le dossier de travail est SOUS pb_data, volontairement : le VACUUM écrit
	// un fichier de la taille de la base, et il doit atterrir sur le même
	// volume — pas sur un %TEMP% qui peut être ailleurs, voire plein.
	travail := filepath.Join(p.pb.DataDir(), ".backup-tmp")

	snap, err := Fabriquer(p.pb.Dao().DB(), travail, cle)
	if err != nil {
		return fmt.Errorf("fabrication : %w", err)
	}
	defer snap.Nettoyer()

	// ── Envoi ───────────────────────────────────────────────────────────────
	if err := client.Envoyer(snap); err != nil {
		return fmt.Errorf("envoi : %w", err)
	}

	log.Printf("💾 sauvegarde : snapshot %s déposé (%d Kio de base)", snap.ID, snap.TailleClaire/1024)

	// ── Miroir des images ───────────────────────────────────────────────────
	//
	// APRÈS le snapshot, et son échec n'annule pas le succès de celui-ci : ce
	// sont deux choses de valeur très différente. Une base sauvegardée sans
	// ses images reste une sauvegarde de toutes les ventes et de toutes les
	// factures ; l'inverse ne serait rien. On ne perd donc jamais un snapshot
	// valide parce qu'une image n'est pas passée.
	if res, err := client.SynchroniserStorage(p.pb.DataDir(), cle); err != nil {
		log.Printf("🖼️  storage : synchronisation échouée — %v", err)
	} else if res.Envoyes > 0 || res.Echecs > 0 {
		log.Printf("🖼️  storage : %d/%d envoyés", res.Envoyes, res.Manquants)
	}

	p.mu.Lock()
	etat := p.lireEtatSansVerrou()
	p.mu.Unlock()
	etat.DernierSucces = time.Now().UTC().Format(time.RFC3339)
	etat.DernierIDSnap = snap.ID
	etat.DerniereTaille = snap.TailleClaire
	etat.DerniereErreur = ""
	p.ecrireEtat(etat)

	return nil
}

// CleChiffrement rend la clé AES-256, en la CRÉANT au premier appel si elle
// n'existe pas.
//
// La créer automatiquement est un choix : sans lui, une installation neuve ne
// se sauvegarderait pas tant que quelqu'un n'aurait pas pensé à cliquer
// quelque part — c'est-à-dire, en pratique, jamais. Le prix de ce choix est
// qu'il FAUT ensuite exporter la clé hors du poste, et c'est ce que le
// paragraphe « sauvegarder la clé » de la documentation exige.
func (p *Planificateur) CleChiffrement() ([]byte, error) {
	brut, err := p.sm.GetSecret(secrets.KeyBackupChiffrement)
	if err == nil && strings.TrimSpace(brut) != "" {
		cle, err := hex.DecodeString(strings.TrimSpace(brut))
		if err != nil {
			return nil, fmt.Errorf("clé de chiffrement illisible (hexadécimal attendu) : %w", err)
		}
		if len(cle) != 32 {
			return nil, fmt.Errorf("clé de chiffrement de %d octets, 32 attendus", len(cle))
		}
		return cle, nil
	}

	cle := make([]byte, 32)
	if _, err := rand.Read(cle); err != nil {
		return nil, fmt.Errorf("génération de la clé : %w", err)
	}
	if err := p.sm.SetSecret(secrets.KeyBackupChiffrement, hex.EncodeToString(cle)); err != nil {
		return nil, fmt.Errorf("enregistrement de la clé : %w", err)
	}
	log.Println("🔑 sauvegarde : clé de chiffrement générée. À EXPORTER hors du poste — sans elle, aucune sauvegarde n'est restaurable.")
	return cle, nil
}

// origine rend le nom du poste, qu'un réglage peut remplacer.
//
// Le réglage existe pour le cas où le nom de machine ne dit rien d'utile
// (« DESKTOP-4F7K2P »), mais il n'est pas obligatoire : sans lui, on a quand
// même une étiquette, ce qui vaut infiniment mieux qu'un champ vide.
func (p *Planificateur) origine() string {
	if v, err := p.sm.GetSetting(secrets.SettingBackupOrigine); err == nil {
		if v = strings.TrimSpace(v); v != "" {
			return v
		}
	}
	return NomDuPoste()
}

// LireEtat rend le dernier état connu.
func (p *Planificateur) LireEtat() EtatSauvegarde {
	etat := p.lireEtatSansVerrou()
	etat.EnCours = p.EnCours()
	return etat
}

func (p *Planificateur) lireEtatSansVerrou() EtatSauvegarde {
	var etat EtatSauvegarde
	brut, err := p.sm.GetSetting(secrets.SettingBackupDernierEtat)
	if err != nil || strings.TrimSpace(brut) == "" {
		return etat
	}
	_ = json.Unmarshal([]byte(brut), &etat)
	return etat
}

func (p *Planificateur) ecrireEtat(etat EtatSauvegarde) {
	etat.EnCours = false // jamais persisté à vrai : un poste tué resterait « en cours » pour toujours
	brut, err := json.Marshal(etat)
	if err != nil {
		return
	}
	if err := p.sm.SetSetting(secrets.SettingBackupDernierEtat, string(brut)); err != nil {
		log.Printf("⚠️  sauvegarde : état non enregistré : %v", err)
	}
}

func (p *Planificateur) noter(err error) {
	etat := p.lireEtatSansVerrou()
	if err != nil {
		etat.DernierEchec = time.Now().UTC().Format(time.RFC3339)
		etat.DerniereErreur = err.Error()
	}
	p.ecrireEtat(etat)
}

// ClesDistinctes refuse une clé de chiffrement égale à la clé API.
//
// Comparaison insensible à la casse : les deux sont de l'hexadécimal, et
// `AB12` et `ab12` désignent les mêmes octets. Une comparaison stricte
// laisserait passer une majuscule.
func ClesDistinctes(cleChiffrement, cleAPI string) error {
	a := strings.ToLower(strings.TrimSpace(cleChiffrement))
	b := strings.ToLower(strings.TrimSpace(cleAPI))
	if a != "" && a == b {
		return fmt.Errorf(
			"la clé de chiffrement est identique à la clé API : le serveur la connaît " +
				"et pourrait déchiffrer les sauvegardes. Générez une clé DISTINCTE " +
				"(Réglages > Sauvegarde > Configurer > Générer), posez-la sur tous les " +
				"postes, puis effacez les sauvegardes déjà déposées")
	}
	return nil
}
