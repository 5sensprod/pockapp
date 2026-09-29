// frontend/modules/stick/labels/components/canvas/DessinNode.jsx
//
// Un élément `dessin` à l'écran : un `Path` Konva dont la géométrie vient de
// `dessinTrace` (`utils/dessin.js`), la même règle que l'export planche.

import React, { forwardRef } from 'react';
import { Path } from 'react-konva';
import { dessinTrace } from '../../utils/dessin';

const DessinNode = forwardRef(({ el, opacity: opaciteVerrou = 1, ...props }, ref) => {
  const { opacity, ...trace } = dessinTrace(el);
  return <Path ref={ref} {...props} {...trace} opacity={opacity * opaciteVerrou} />;
});

DessinNode.displayName = 'DessinNode';

export default DessinNode;
