// frontend/modules/stick/labels/utils/policesVectorielles.js
//
// Les FICHIERS de police, lus par opentype.js, pour le contour vectoriel des
// lettres. Servis en TTF par la route Go `/api/fonts/file`
// (backend/routes/polices_routes.go), qui garde les polices Google sur
// disque : un poste hors ligne retrouve celles déjà utilisées.
//
// opentype.js n'est chargé qu'ici, à la demande : l'éditeur ne le paie pas
// tant qu'aucun contour vectoriel n'est demandé.

import { usePocketBase } from '@/lib/use-pocketbase';

const cache = new Map(); // cle → Promise<Chargee>
const pretes = new Map(); // cle → Chargee, pour une lecture SYNCHRONE

/**
 * @typedef {{ police: any, graisse: number, italique: boolean, source: string, cle: string }} Chargee
 *   `graisse` : celle réellement servie (400 si la famille n'a pas de gras :
 *   le navigateur fabrique alors le gras). `italique` : un VRAI fichier
 *   italique (polices système) ; faux, le navigateur penche le droit.
 */

const cleDe = (famille, gras, italique) => `${famille}|${gras ? 700 : 400}|${italique ? 1 : 0}`;

/** @returns {Promise<Chargee>} */
export const chargerPoliceVectorielle = (famille, gras, italique = false) => {
  const graisse = gras ? 700 : 400;
  const cle = cleDe(famille, gras, italique);
  if (!cache.has(cle)) {
    const p = (async () => {
      const pb = usePocketBase();
      const url = `${pb.baseUrl.replace(/\/$/, '')}/api/fonts/file?family=${encodeURIComponent(famille)}&weight=${graisse}${italique ? '&italic=1' : ''}`;
      const rep = await fetch(url, { headers: { Authorization: pb.authStore.token } });
      if (!rep.ok) throw new Error(`Police ${famille} (${graisse}) : ${rep.status} ${await rep.text()}`);
      const octets = await rep.arrayBuffer();
      const opentype = await import('opentype.js');
      const chargee = {
        police: opentype.parse(octets),
        graisse: Number(rep.headers.get('X-Font-Weight')) || graisse,
        italique: rep.headers.get('X-Font-Italic') === '1',
        source: rep.headers.get('X-Font-Source') || '',
        cle,
      };
      pretes.set(cle, chargee);
      return chargee;
    })();
    p.catch(() => cache.delete(cle)); // un échec (hors ligne) se retente
    cache.set(cle, p);
  }
  return cache.get(cle);
};

/** La police si elle est DÉJÀ chargée, sinon null (lecture synchrone). */
export const policeVectoriellePrete = (famille, gras, italique = false) =>
  pretes.get(cleDe(famille, gras, italique)) ?? null;

/** Gras et italique d'un `fontStyle` Konva (« bold italic »…). */
export const styleDePolice = (fontStyle) => {
  const s = String(fontStyle || '');
  return { gras: s.includes('bold'), italique: s.includes('italic') };
};
