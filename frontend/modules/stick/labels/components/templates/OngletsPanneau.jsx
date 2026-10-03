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
      <div className="flex-none px-3 py-2 border-b border-gray-200 dark:border-gray-700">
       <div className="flex p-0.5 rounded-md bg-gray-100 dark:bg-gray-700" role="tablist">
        {onglets.map(({ id, libelle }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={courant === id}
            onClick={() => choisir(id)}
            className={`flex-1 h-6 px-2 text-xs rounded transition-colors ${
              courant === id
                ? 'bg-white dark:bg-gray-500 text-gray-900 dark:text-white shadow-sm font-medium'
                : 'text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {libelle}
          </button>
        ))}
       </div>
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
