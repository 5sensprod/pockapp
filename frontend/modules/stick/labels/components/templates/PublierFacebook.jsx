// frontend/modules/stick/labels/components/templates/PublierFacebook.jsx
//
// « PUBLIER SUR FACEBOOK » (`lib/facebook.ts`, `@/lib/facebook/client`) : le
// bouton de la barre du haut et sa fenêtre. L'affiche courante part comme photo
// sur la Page que le magasin a connectée, avec un message.
//
// Repris de PocketStick (`src/topbar/FacebookPublishModal.jsx`) : l'aperçu, la
// Page, le message, le lien « voir la publication ». Ce qui change :
//   - la connexion n'est PAS ici : un administrateur la fait une fois dans
//     « Clés API & Secrets », et tous les postes publient ensuite ;
//   - RIEN ne part sans une confirmation explicite (`useConfirmModal`) : c'est
//     un geste public, qu'on ne retire pas depuis l'application ;
//   - pas de message par défaut : vide, la photo part seule.
//
// Absent en planche. Après un échec INCERTAIN (délai, réponse illisible),
// « Publier » ne se repropose pas : l'affiche est peut-être en ligne.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, Facebook, X } from 'lucide-react';
import useLabelStore from '../../store/useLabelStore';
import Bouton from '../ui/Bouton';
import ChampTexte from '../ui/ChampTexte';
import Note from '../ui/Note';
import { AIDE, boutonBascule } from '../ui/styles';
import { useConfirmModal } from '../../ui/useConfirmModal';
import { usePocketBase } from '@/lib/use-pocketbase';
import { ouvrirDansLeNavigateur } from '@/lib/site/url-publique';
import {
  MESSAGE_MAX,
  lireEtatFacebook,
  nouvelEnvoi,
  publierSurFacebook,
  traduireErreurFacebook,
} from '@/lib/facebook/client';
import {
  peutPublier,
  preparerAffiche,
  publicationProposee,
  texteDeConfirmation,
  useBrouillonFacebook,
} from '../../lib/facebook';
import { rendrePage } from '../../utils/renduPage';

const FenetrePublication = ({ docNode, onFermer }) => {
  const pb = usePocketBase();
  const { confirm, ConfirmModal } = useConfirmModal();
  const message = useBrouillonFacebook((s) => s.message);

  // L'identifiant d'envoi de CETTE fenêtre : une seule publication possible
  const envoi = useRef(nouvelEnvoi());
  const [facebook, setFacebook] = useState(null);
  const [image, setImage] = useState(null); // { blob, url }
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [publie, setPublie] = useState(null); // { lien, page }

  // À l'ouverture : l'état de la connexion, et l'image TELLE QU'ELLE PARTIRA
  useEffect(() => {
    let vivant = true;
    let url = null;
    lireEtatFacebook(pb)
      .then((etat) => vivant && setFacebook(etat))
      .catch((e) => vivant && setErreur(traduireErreurFacebook(e)));
    const { width, height } = useLabelStore.getState().canvasSize;
    preparerAffiche((coteMax) => rendrePage(docNode, { width, height, coteMax }))
      .then((blob) => {
        if (!vivant) return;
        url = URL.createObjectURL(blob);
        setImage({ blob, url });
      })
      .catch((e) => vivant && setErreur(traduireErreurFacebook(e)));
    return () => {
      vivant = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [pb, docNode]);

  const fermer = useCallback(() => {
    if (!enCours) onFermer();
  }, [enCours, onFermer]);

  useEffect(() => {
    const surTouche = (e) => e.key === 'Escape' && fermer();
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [fermer]);

  const refus = peutPublier(useLabelStore.getState(), facebook, message);
  // Après un échec incertain, la même publication ne repart pas
  const bloque = !!erreur?.incertain;
  const pret = refus.ok && !!image && !enCours && !bloque;

  const publier = async () => {
    if (!pret) return;
    const accord = await confirm({
      title: 'Publier sur Facebook ?',
      message: texteDeConfirmation(facebook.page.nom, message),
      confirmText: 'Publier',
      cancelText: 'Annuler',
      variant: 'primary',
    });
    if (!accord) return;
    setEnCours(true);
    setErreur(null);
    try {
      const rendu = await publierSurFacebook(pb, { image: image.blob, message, envoi: envoi.current });
      setPublie(rendu);
      useBrouillonFacebook.setState({ message: '' });
    } catch (e) {
      setErreur(traduireErreurFacebook(e, true));
    } finally {
      setEnCours(false);
    }
  };

  const nomPage = publie?.page?.nom ?? facebook?.page?.nom;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-50"
      onMouseDown={(e) => e.target === e.currentTarget && fermer()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Publier sur Facebook"
        className="mx-4 flex max-h-[90vh] w-full max-w-md flex-col rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-800"
      >
        <div className="flex flex-none items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <h3 className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-gray-100">
            <Facebook className="h-4 w-4" />
            Publier sur Facebook
          </h3>
          <Bouton variante="discret" icone={X} titre="Fermer" desactive={enCours} onClic={fermer} />
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {publie ? (
            <>
              <p className="text-sm text-gray-900 dark:text-gray-100">
                L'affiche est publiée{nomPage ? ` sur « ${nomPage} »` : ''}.
              </p>
              <Bouton variante="discret" icone={ExternalLink} titre={publie.lien} onClic={() => ouvrirDansLeNavigateur(publie.lien)}>
                Voir la publication
              </Bouton>
              <p className={`${AIDE} break-all select-all`}>{publie.lien}</p>
            </>
          ) : (
            <>
              <p className="text-xs text-gray-700 dark:text-gray-300">
                {facebook?.connecte && facebook.page ? (
                  <>
                    Page : <strong>{facebook.page.nom}</strong>
                  </>
                ) : facebook ? (
                  'Aucune Page connectée'
                ) : (
                  'Lecture de la connexion à Facebook…'
                )}
              </p>

              <div className="flex h-56 items-center justify-center rounded-md border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
                {image ? (
                  <img src={image.url} alt="L'affiche telle qu'elle sera publiée" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className={AIDE}>Préparation de l'image…</span>
                )}
              </div>
              <p className={AIDE}>L'image telle qu'elle sera publiée, prix et textes compris.</p>

              <ChampTexte
                label="Message de la publication"
                placeholder="Message (facultatif)"
                valeur={message}
                onValeur={(m) => useBrouillonFacebook.setState({ message: m })}
                max={MESSAGE_MAX}
                lignes={4}
                desactive={enCours || bloque}
              />

              {!refus.ok && facebook && <Note ton="avertissement">{refus.raison}</Note>}
              {erreur && <Note ton="erreur">{erreur.message}</Note>}
            </>
          )}
        </div>

        <div className="flex flex-none justify-end gap-2 border-t border-gray-200 px-4 py-3 dark:border-gray-700">
          <Bouton grand desactive={enCours} onClic={fermer}>
            {publie || bloque ? 'Fermer' : 'Annuler'}
          </Bouton>
          {!publie && !bloque && (
            <Bouton
              variante="principal"
              grand
              desactive={!pret}
              titre={refus.ok ? 'Une confirmation vous sera demandée avant l’envoi.' : refus.raison}
              onClic={publier}
            >
              {enCours ? 'Publication en cours…' : 'Publier…'}
            </Bouton>
          )}
        </div>
      </div>
      <ConfirmModal />
    </div>
  );
};

/** Le bouton de la barre du haut. Rien n'est rendu ni envoyé avant le clic. */
const PublierFacebook = ({ docNode }) => {
  const propose = useLabelStore((s) => publicationProposee(s));
  const vide = useLabelStore((s) => !s.elements.some((e) => e.visible !== false));
  const [ouvert, setOuvert] = useState(false);

  // Pas en planche : la page y est une case d'étiquette
  if (!propose) return null;
  const indisponible = !docNode || vide;

  return (
    <>
      <button
        type="button"
        onClick={() => setOuvert(true)}
        disabled={indisponible}
        className={`${boutonBascule(ouvert)} disabled:opacity-50 disabled:cursor-not-allowed`}
        title={
          vide
            ? "La page est vide : il n'y a rien à publier."
            : 'Publier cette affiche sur la Page Facebook du magasin (aperçu et confirmation avant l’envoi)'
        }
      >
        <Facebook className="h-4 w-4" />
        Publier
      </button>
      {ouvert && docNode && <FenetrePublication docNode={docNode} onFermer={() => setOuvert(false)} />}
    </>
  );
};

export default PublierFacebook;
