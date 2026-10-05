// frontend/modules/stick/labels/components/templates/PhotosChat.jsx
//
// LE MINI-CHAT « PHOTOS » (`lib/photos.ts`), en tête du sous-onglet « Photos »
// de l'onglet Images. Le vendeur décrit une photo ; l'assistant répond d'une
// phrase et d'une grille de quatre résultats, dans des cadres aux proportions
// de la page. Il peut raffiner (« plus sombre » : une nouvelle demande,
// décomptée comme la première) ou « Afficher plus » : les quatre suivantes de
// la même recherche, sans passer par l'assistant, donc GRATUITES.
//
// Sous chaque résultat : « Télécharger » (un fichier sur le disque) et
// « Ajouter » (la bibliothèque du poste — la liste « Photos gardées », juste
// en dessous). RIEN n'est posé sur l'affiche d'ici : c'est un clic sur une
// photo gardée qui la pose, comme toute image.
//
// Les miniatures arrivent par la route locale, en octets : aucune image n'est
// chargée depuis un domaine tiers. Aucune attribution, aucun prix affichés.
// La conversation vit dans la mémoire de l'onglet : un rechargement l'efface.

import React, { useEffect, useRef, useState } from 'react';
import { Check, Download, Loader2, Plus, Send } from 'lucide-react';
import useLabelStore from '../../store/useLabelStore';
import presetImageService from '../../services/presetImageService';
import Bouton from '../ui/Bouton';
import ChampTexte from '../ui/ChampTexte';
import GrilleVignettes from '../ui/GrilleVignettes';
import Note from '../ui/Note';
import TitreGroupe from '../ui/TitreGroupe';
import Vignette from '../ui/Vignette';
import { AIDE } from '../ui/styles';
import { usePocketBase } from '@/lib/use-pocketbase';
import { rafraichirCreditsPocketApp } from '@/lib/credits';
import { useEtatDetourage } from '../../lib/detourage';
import {
  DEMANDE_MAX,
  afficherPlus,
  chargerMiniature,
  effacerConversationPhotos,
  envoyerDemande,
  garderPhoto,
  peutDemander,
  proportionsDuCadre,
  telechargerPhoto,
  useConversationPhotos,
} from '../../lib/photos';

/** Pour démarrer : un clic REMPLIT le champ, il n'envoie rien. */
const IDEES = ['Forêt avec un lac gelé', 'Scène de concert, projecteurs', 'Fond de bois clair'];
/** Pour raffiner les résultats affichés : un clic ENVOIE. */
const RAFFINEMENTS = ['Plus sombre', 'Plus lumineux', 'Sans personne'];

const ResultatPhoto = ({ photo, proportions, pb }) => {
  const gardee = useConversationPhotos((s) => s.gardees.includes(photo.id));
  const [src, setSrc] = useState(null);
  const [action, setAction] = useState(null); // 'ajout' | 'telechargement'
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    let vivant = true;
    chargerMiniature(pb, photo)
      .then((s) => vivant && setSrc(s))
      .catch(() => {
        // Le cadre garde la couleur de la photo : les deux actions restent possibles
      });
    return () => {
      vivant = false;
    };
  }, [pb, photo]);

  const faire = async (nom, geste) => {
    if (action) return;
    setAction(nom);
    setErreur(null);
    try {
      await geste();
    } catch (e) {
      setErreur(e?.message || 'Action impossible.');
    } finally {
      setAction(null);
    }
  };
  const garder = () => {
    if (!gardee) faire('ajout', () => garderPhoto(photo, { pb, bibliotheque: presetImageService }));
  };
  const telecharger = () => faire('telechargement', () => telechargerPhoto(photo, { pb }));
  const nom = photo.description || 'Photo';

  return (
    <div className="min-w-0 space-y-1">
      <Vignette
        src={src}
        nom={gardee ? `${nom} — déjà dans vos photos gardées` : `${nom} — ajouter à mes images`}
        ajuste="cover"
        proportions={proportions}
        onClic={garder}
      >
        <div className="w-full h-full animate-pulse" style={{ backgroundColor: photo.couleur || '#e5e7eb' }} />
      </Vignette>
      <div className="flex items-center justify-between gap-1">
        <Bouton
          variante="discret"
          icone={action === 'telechargement' ? Loader2 : Download}
          desactive={!!action}
          titre="Enregistre la photo dans un fichier, sur ce poste."
          onClic={telecharger}
        >
          Télécharger
        </Bouton>
        <Bouton
          variante="discret"
          icone={gardee ? Check : action === 'ajout' ? Loader2 : Plus}
          desactive={!!action || gardee}
          titre={
            gardee
              ? 'Cette photo est dans « Photos gardées », ci-dessous.'
              : 'Range la photo dans « Photos gardées », ci-dessous. Elle n’est pas posée sur l’affiche.'
          }
          onClic={garder}
        >
          {gardee ? 'Ajoutée' : 'Ajouter'}
        </Bouton>
      </div>
      {erreur && <Note ton="erreur">{erreur}</Note>}
    </div>
  );
};

const PhotosChat = () => {
  const pb = usePocketBase();
  const canvasSize = useLabelStore((s) => s.canvasSize);
  const messages = useConversationPhotos((s) => s.messages);
  const plus = useConversationPhotos((s) => s.plus);
  const enCours = useEtatDetourage((s) => s.enCours);
  const tache = useEtatDetourage((s) => s.tache);
  const [texte, setTexte] = useState('');
  const fin = useRef(null);

  const proportions = proportionsDuCadre(canvasSize);
  const refus = peutDemander(texte, enCours);
  const occupe = enCours && tache === 'photos';
  const dernier = messages[messages.length - 1];

  const envoyer = (demande) => {
    if (!peutDemander(demande, enCours).ok) return;
    if (demande === texte) setTexte('');
    envoyerDemande(demande, { pb, taille: canvasSize, apresDecompte: rafraichirCreditsPocketApp });
  };

  // La dernière réponse reste en vue
  useEffect(() => {
    fin.current?.scrollIntoView?.({ block: 'nearest' });
  }, [messages.length, occupe, plus]);

  return (
    <div className="space-y-2">
      <TitreGroupe
        titre="Chercher une photo"
        action={
          messages.length > 0 && (
            <Bouton
              variante="discret"
              desactive={occupe}
              titre="Efface la conversation. Les photos gardées restent."
              onClic={effacerConversationPhotos}
            >
              Effacer
            </Bouton>
          )
        }
      />

      {messages.length === 0 && (
        <Note>
          Décrivez la photo voulue : l’assistant en propose quatre, au format de la page. Rien n’est posé sur
          l’affiche sans votre clic.
        </Note>
      )}

      {messages.map((m) =>
        m.role === 'user' ? (
          <p
            key={m.id}
            className="ml-6 px-2 py-1 rounded-md text-xs leading-snug bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100"
          >
            {m.texte}
          </p>
        ) : m.erreur ? (
          <Note
            key={m.id}
            ton={m.erreur.code === 'aucun_resultat' ? 'info' : 'avertissement'}
            action={
              m === dernier &&
              m.erreur.reessayable && (
                <Bouton
                  variante="discret"
                  desactive={enCours}
                  onClic={() => {
                    const demande = [...messages].reverse().find((x) => x.role === 'user');
                    if (demande) envoyer(demande.texte);
                  }}
                >
                  Réessayer
                </Bouton>
              )
            }
          >
            {m.texte}
          </Note>
        ) : (
          <div key={m.id} className="space-y-1.5">
            {m.texte && <p className="text-xs leading-snug text-gray-700 dark:text-gray-300">{m.texte}</p>}
            {m.resultats.length > 0 && (
              <GrilleVignettes colonnes={2}>
                {m.resultats.map((photo) => (
                  <ResultatPhoto key={photo.id} photo={photo} proportions={proportions} pb={pb} />
                ))}
              </GrilleVignettes>
            )}
            {m === dernier && m.suite && (
              <Bouton
                plein
                icone={plus ? Loader2 : Plus}
                desactive={plus || enCours}
                titre="Les quatre photos suivantes de la même recherche. Gratuit : l’assistant n’est pas sollicité."
                onClic={() => afficherPlus({ pb })}
              >
                {plus ? 'Chargement…' : 'Afficher plus'}
              </Bouton>
            )}
          </div>
        )
      )}

      {occupe && (
        <p className={`${AIDE} flex items-center gap-1.5`} role="status">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Recherche en cours…
        </p>
      )}
      <div ref={fin} />

      <ChampTexte
        label="Votre demande"
        placeholder="Une photo de… (Entrée pour envoyer)"
        valeur={texte}
        onValeur={setTexte}
        onValider={() => envoyer(texte)}
        max={DEMANDE_MAX}
        entreeValide
      />
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
        {dernier?.role === 'model' && !dernier.erreur && dernier.resultats.length > 0
          ? RAFFINEMENTS.map((r) => (
              <Bouton key={r} variante="discret" desactive={enCours} onClic={() => envoyer(r)}>
                {r}
              </Bouton>
            ))
          : IDEES.map((idee) => (
              <Bouton key={idee} variante="discret" onClic={() => setTexte(idee)}>
                {idee}
              </Bouton>
            ))}
      </div>
      <Bouton
        variante="principal"
        icone={Send}
        plein
        desactive={!refus.ok}
        titre={
          refus.ok
            ? 'Cherche des photos. Chaque demande est décomptée des crédits IA ; « Afficher plus » ne l’est pas.'
            : refus.raison
        }
        onClic={() => envoyer(texte)}
      >
        {occupe ? 'Recherche en cours…' : 'Envoyer'}
      </Bouton>
    </div>
  );
};

export default PhotosChat;
