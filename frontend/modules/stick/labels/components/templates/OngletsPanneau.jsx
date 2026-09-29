// frontend/modules/stick/labels/components/templates/OngletsPanneau.jsx
//
// Les ONGLETS d'un panneau de la barre latérale qui en réunit plusieurs
// (Templates : mes templates / designs ; Format et fond). Un seul rendu, pour
// que tous les panneaux fusionnés se ressemblent.
//
// Tous les onglets restent MONTÉS, l'inactif seulement masqué : un panneau
// peut écouter un événement même quand on ne le regarde pas
// (`TemplateManager`, `request-template-save`), et garde son état (défilement,
// saisie) quand on revient dessus.
import React from 'react';

/**
 * `onglets` : [{ id, libelle, contenu }]. `actif` / `onChange` : contrôlé par
 * le parent quand il doit forcer un onglet ; sinon état local.
 */
const OngletsPanneau = ({ onglets, actif, onChange }) => {
  const [local, setLocal] = React.useState(onglets[0]?.id);
  const courant = actif ?? local;
  const choisir = onChange ?? setLocal;

  return (
    <div className="flex flex-col h-full">
      <div className="p-2 flex gap-1 border-b border-gray-200 dark:border-gray-700" role="tablist">
        {onglets.map(({ id, libelle }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={courant === id}
            onClick={() => choisir(id)}
            className={`flex-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              courant === id
                ? 'bg-blue-500 text-white'
                : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
            }`}
          >
            {libelle}
          </button>
        ))}
      </div>
      {onglets.map(({ id, contenu }) => (
        <div key={id} role="tabpanel" className={courant === id ? 'flex-1 min-h-0' : 'hidden'}>
          {contenu}
        </div>
      ))}
    </div>
  );
};

export default OngletsPanneau;
