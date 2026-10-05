// frontend/modules/stick/labels/components/templates/ConsigneIA.jsx
//
// LA CONSIGNE ET LA QUALITÉ d'une demande à l'IA, communes à « Modifier par
// IA » (une image, `ReglagesImage.jsx`) et à « Embellir la page »
// (`EmbellirPage.jsx`). Leur état vit hors des composants
// (`useReglagesRetouche`) : la consigne reste après un échec, d'une image à
// l'autre et d'un panneau à l'autre. Les idées REMPLISSENT le champ ; aucun
// prix n'est affiché.

import React from 'react';
import ChampTexte from '../ui/ChampTexte';
import Bouton from '../ui/Bouton';
import Segments from '../ui/Segments';
import { CONSIGNE_MAX, IDEES_CONSIGNE, QUALITES, useReglagesRetouche } from '../../lib/retouche';

const ConsigneIA = ({ placeholder, desactive = false, onValider }) => {
  const { consigne, qualite } = useReglagesRetouche();
  return (
    <>
      <ChampTexte
        label="Consigne pour l'IA"
        placeholder={placeholder}
        valeur={consigne}
        onValeur={(v) => useReglagesRetouche.setState({ consigne: v })}
        onValider={onValider}
        max={CONSIGNE_MAX}
        desactive={desactive}
      />
      <div className="flex flex-wrap gap-x-2 gap-y-0.5">
        {IDEES_CONSIGNE.map((idee) => (
          <Bouton
            key={idee.label}
            variante="discret"
            desactive={desactive}
            titre={idee.consigne}
            onClic={() => useReglagesRetouche.setState({ consigne: idee.consigne })}
          >
            {idee.label}
          </Bouton>
        ))}
      </div>
      <Segments
        label="Qualité"
        valeur={qualite}
        onValeur={(q) => useReglagesRetouche.setState({ qualite: q })}
        options={QUALITES}
      />
    </>
  );
};

export default ConsigneIA;
