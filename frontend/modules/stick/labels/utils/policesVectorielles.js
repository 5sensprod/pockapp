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

const cache = new Map(); // "famille|graisse" → Promise<{ police, graisse }>

/**
 * @param {string} famille
 * @param {boolean} gras
 * @returns {Promise<{ police: any, graisse: number, source: string }>}
 *   `graisse` : celle réellement servie (400 si la famille n'a pas de gras :
 *   le navigateur fabrique alors le gras).
 */
export const chargerPoliceVectorielle = (famille, gras) => {
  const graisse = gras ? 700 : 400;
  const cle = `${famille}|${graisse}`;
  if (!cache.has(cle)) {
    const p = (async () => {
      const pb = usePocketBase();
      const url = `${pb.baseUrl.replace(/\/$/, '')}/api/fonts/file?family=${encodeURIComponent(famille)}&weight=${graisse}`;
      const rep = await fetch(url, { headers: { Authorization: pb.authStore.token } });
      if (!rep.ok) throw new Error(`Police ${famille} (${graisse}) : ${rep.status} ${await rep.text()}`);
      const octets = await rep.arrayBuffer();
      const opentype = await import('opentype.js');
      return {
        police: opentype.parse(octets),
        graisse: Number(rep.headers.get('X-Font-Weight')) || graisse,
        source: rep.headers.get('X-Font-Source') || '',
      };
    })();
    p.catch(() => cache.delete(cle)); // un échec (hors ligne) se retente
    cache.set(cle, p);
  }
  return cache.get(cle);
};
