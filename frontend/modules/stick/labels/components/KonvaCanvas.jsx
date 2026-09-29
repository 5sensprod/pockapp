import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { typoTexte } from '../utils/typo';
import { Stage, Layer, Group, Rect, Transformer, Line, Text } from 'react-konva';
import useLabelStore, { idsSelectionnes } from '../store/useLabelStore';
import QRCodeNode from './canvas/QRCodeNode';
import ImageNode from './canvas/ImageNode';
import BarcodeNode from './canvas/BarcodeNode';
import TextNode from './canvas/TextNode';
import ShapeNode from './canvas/ShapeNode';
import { calculateSnapGuides } from '../utils/snapGuides.utils';
import { resolvePropForElement } from '../utils/dataBinding';
import { konvaCrop, resizeStep, settleCrop } from '../utils/crop';
import { boxesIntersect, rectFromPoints, LASSO_MIN_DRAG } from '../utils/layout';
import { CropOverlay, CropTransformer, geometrieImage } from './canvas/CropOverlay';
import EtiquetteSelection from './EtiquetteSelection';
import { appliquerEffets, filtresDe } from '../utils/effetsKonva';
import { tailleNaturelle } from './canvas/ImageNode';
import FicheNode from './canvas/FicheNode';
import { contenuFiche, EXEMPLE_FICHE } from '../utils/ficheProduit';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

/** Formes dessinées depuis leur CENTRE (`dessinForme`) : leur nœud Konva est
 *  décalé d'une demi-taille par rapport à `el.x`/`el.y`. */
const FORMES_CENTREES = ['circle', 'triangle', 'star'];

/** Position à enregistrer après un déplacement. Avant, un cercle enregistrait
 *  son centre comme coin et sautait d'une demi-taille au relâchement. */
export const positionDepuisNoeud = (el, node) => {
  if (el.type === 'shape' && FORMES_CENTREES.includes(el.shape)) {
    return { x: node.x() - (el.width ?? 160) / 2, y: node.y() - (el.height ?? 160) / 2 };
  }
  return { x: node.x(), y: node.y() };
};

/** Marge autour de la page dans la zone de travail (px écran), comme PocketStick. */
export const MARGE_ESPACE = 40;

const KonvaCanvas = forwardRef(
  (
    { viewportWidth = 0, viewportHeight = 0, docWidth = 800, docHeight = 600, zoom = 1, onDocNode },
    ref
  ) => {
    const elements = useLabelStore((s) => s.elements);
    const selectedId = useLabelStore((s) => s.selectedId);
    const extraIds = useLabelStore((s) => s.extraIds);
    const toggleSelection = useLabelStore((s) => s.toggleSelection);
    const setSelection = useLabelStore((s) => s.setSelection);
    const selectElement = useLabelStore((s) => s.selectElement);
    const updateElement = useLabelStore((s) => s.updateElement);
    const setZoom = useLabelStore((s) => s.setZoom);
    const selectedProduct = useLabelStore((s) => s.selectedProduct);
    const currentProductIndex = useLabelStore((s) => s.currentProductIndex);
    const cropId = useLabelStore((s) => s.cropId);
    const cadreMasque = useLabelStore((s) => s.cadreMasque || s.cadreMasqueGeste);
    const startCrop = useLabelStore((s) => s.startCrop);
    const stopCrop = useLabelStore((s) => s.stopCrop);
    // Image pendant un redimensionnement : { id, el (géométrie courante), natural }.
    const liveMedia = useRef(null);

    // Échap ou Entrée terminent le recadrage
    useEffect(() => {
      if (!cropId) return undefined;
      const onKey = (e) => {
        if (e.key === 'Escape' || e.key === 'Enter') stopCrop();
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [cropId, stopCrop]);

    // H bascule l'affichage du cadre de sélection ; tenir un curseur de
    // réglage (n'importe quel input range de la page) le masque jusqu'au
    // relâchement. La sélection n'est jamais touchée. Le recadrage, lui,
    // garde toujours ses poignées.
    useEffect(() => {
      const onKey = (e) => {
        if (e.key.toLowerCase() !== 'h' || e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
        const cible = e.target;
        if (cible?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(cible?.tagName)) return;
        e.preventDefault();
        useLabelStore.getState().basculerCadreMasque();
      };
      const onDown = (e) => {
        if (e.target?.matches?.('input[type="range"]')) useLabelStore.getState().setCadreMasqueGeste(true);
      };
      const onUp = () => {
        if (useLabelStore.getState().cadreMasqueGeste) useLabelStore.getState().setCadreMasqueGeste(false);
      };
      window.addEventListener('keydown', onKey);
      document.addEventListener('pointerdown', onDown, true);
      window.addEventListener('pointerup', onUp, true);
      window.addEventListener('pointercancel', onUp, true);
      window.addEventListener('blur', onUp);
      return () => {
        window.removeEventListener('keydown', onKey);
        document.removeEventListener('pointerdown', onDown, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onUp, true);
        window.removeEventListener('blur', onUp);
      };
    }, []);

    // Suppr / Retour arrière : supprime la sélection entière. Jamais pendant
    // une saisie (champ de la barre, édition d'un texte sur le canvas).
    useEffect(() => {
      const onKey = (e) => {
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;
        const cible = e.target;
        if (
          cible?.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(cible?.tagName)
        )
          return;
        const state = useLabelStore.getState();
        if (state.cropId) return;
        const ids = idsSelectionnes(state).filter(
          (id) => !state.elements.find((el) => el.id === id)?.locked
        );
        if (!ids.length) return;
        e.preventDefault();
        state.deleteElements(ids);
      };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, []);

    // LASSO, comme PocketStick : glisser dans le vide trace un rectangle, et
    // tout élément qu'il touche est sélectionné (Maj : ajouté à la sélection).
    // Coordonnées du DOCUMENT. `lassoRef` porte le geste, `lasso` le dessin.
    const [lasso, setLasso] = useState(null);
    const lassoRef = useRef(null);
    // Le clic qui suit le relâchement d'un lasso ne doit pas vider la sélection
    const lassoVientDeFinir = useRef(false);

    const stageRef = useRef(null);
    const transformerRef = useRef(null);
    const docGroupRef = useRef(null);

    useImperativeHandle(ref, () => stageRef.current, []);

    useEffect(() => {
      if (onDocNode) onDocNode(docGroupRef.current || null);
    }, [onDocNode, zoom]);

    const [snapGuides, setSnapGuides] = useState([]);
    const [isDraggingElement, setIsDraggingElement] = useState(false);
    const [isTransforming, setIsTransforming] = useState(false);

    // États pour la rotation
    const [isRotating, setIsRotating] = useState(false);
    const [rotationAngle, setRotationAngle] = useState(null);

    const findNodeById = useCallback((id) => {
      return stageRef.current?.findOne(`#${id}`);
    }, []);

    // DISPOSITION REPRISE DE POCKETSTICK (`src/editor/canvas/Workspace.jsx`) :
    // le Stage fait au moins la taille de la zone visible, et au moins la page
    // zoomée plus une marge ; la page y est CENTRÉE. Quand elle dépasse, c'est
    // le conteneur (overflow: auto, `CanvasArea.jsx`) qui défile — molette,
    // pavé tactile, barres de défilement. Plus de déplacement au bouton du
    // milieu, plus de position de page à mémoriser.
    const isDragging = false;
    const pageW = docWidth * zoom;
    const pageH = docHeight * zoom;
    const stageW = Math.max(1, viewportWidth, pageW + MARGE_ESPACE * 2);
    const stageH = Math.max(1, viewportHeight, pageH + MARGE_ESPACE * 2);
    const docPos = { x: (stageW - pageW) / 2, y: (stageH - pageH) / 2 };

    // Ctrl/Cmd + molette : zoom. La molette seule fait défiler (natif).
    const handleWheel = useCallback(
      (e) => {
        if (!(e.evt.ctrlKey || e.evt.metaKey)) return;
        e.evt.preventDefault();
        const facteur = e.evt.deltaY > 0 ? 1 / 1.08 : 1.08;
        setZoom(clamp(zoom * facteur, 0.1, 3));
      },
      [zoom, setZoom]
    );

    const handleSelect = useCallback(
      (id, locked, evt) => {
        if (isDragging || locked) return;
        // Maj (ou Ctrl/Cmd) + clic : sélection multiple, comme PocketStick
        if (evt?.shiftKey || evt?.ctrlKey || evt?.metaKey) toggleSelection(id);
        else if (!idsSelectionnes(useLabelStore.getState()).includes(id)) selectElement(id);
        // Un clic sur un élément DÉJÀ sélectionné garde la sélection : c'est
        // ce qui permet de déplacer le groupe en le saisissant par l'un d'eux.
        else useLabelStore.setState({ selectedId: id, extraIds: idsSelectionnes(useLabelStore.getState()).filter((x) => x !== id) });
      },
      [isDragging, selectElement, toggleSelection]
    );

    const handleDragMove = useCallback(
      (id, node) => {
        const movingElement = elements.find((el) => el.id === id);
        if (!movingElement) return;

        const tempElement = { ...movingElement, x: node.x(), y: node.y() };
        const otherElements = elements.filter((el) => el.id !== id && el.visible !== false);

        const { guides, snapX, snapY } = calculateSnapGuides(
          tempElement,
          node,
          otherElements,
          { width: docWidth, height: docHeight },
          5,
          findNodeById
        );

        setSnapGuides(guides);
        // `snapX`/`snapY` sont le coin du CADRE englobant, pas l'origine du
        // nœud : pour un cercle, un triangle ou une étoile (origine au centre)
        // ou un élément tourné, les poser tels quels faisait sauter la forme.
        // On applique donc l'écart entre l'origine et le coin du cadre.
        const cadre = node.getClientRect({ skipShadow: true, relativeTo: node.getParent() });
        if (snapX !== null) node.x(snapX + (node.x() - cadre.x));
        if (snapY !== null) node.y(snapY + (node.y() - cadre.y));
      },
      [elements, docWidth, docHeight, findNodeById]
    );

    const handleDragStart = useCallback(() => setIsDraggingElement(true), []);

    const handleDragEnd = useCallback(
      (id, node) => {
        setIsDraggingElement(false);
        setSnapGuides([]);
        // Le Transformer déplace AVEC lui les autres éléments sélectionnés,
        // mais seul le nœud saisi émet dragend : on les enregistre tous.
        const stage = stageRef.current;
        for (const autreId of idsSelectionnes(useLabelStore.getState())) {
          if (autreId === id) continue;
          const autre = stage?.findOne(`#${autreId}`);
          const el = elements.find((e) => e.id === autreId);
          if (autre && el) updateElement(autreId, positionDepuisNoeud(el, autre));
        }
        const el = elements.find((e) => e.id === id);
        updateElement(id, el ? positionDepuisNoeud(el, node) : { x: node.x(), y: node.y() });
      },
      [updateElement, elements]
    );

    // 🎯 onTransformStart simple
    const handleTransformStart = useCallback(
      (id, node) => {
        setIsTransforming(true);
        const element = elements.find((el) => el.id === id);
        // IMAGE, comme PocketStick : on part de la géométrie à l'échelle 1 et
        // de la taille d'origine, pour recalculer le recadrage à chaque pas.
        liveMedia.current =
          element?.type === 'image'
            ? { id, el: geometrieImage(element), natural: tailleNaturelle(node.image?.()) }
            : null;
      },
      [elements]
    );

    // 🎯 REFACTORISÉ : onTransform avec approche Konva officielle
    const handleTransforming = useCallback(
      (id, node) => {
        const tr = transformerRef.current;
        if (!tr) return;

        const activeAnchor = tr.getActiveAnchor();
        const element = elements.find((el) => el.id === id);
        if (!element) return;

        // 🔄 Détection rotation
        if (activeAnchor === 'rotater') {
          setIsRotating(true);

          let rotation = node.rotation();
          const snapAngles = [0, 90, 180, 270, 360, -90, -180, -270];
          const snapTolerance = 5;

          let snapped = false;
          for (const snapAngle of snapAngles) {
            if (Math.abs(rotation - snapAngle) < snapTolerance) {
              rotation = snapAngle;
              snapped = true;
              break;
            }
          }

          if (!snapped) rotation = Math.round(rotation);
          if (rotation > 180) rotation -= 360;
          if (rotation < -180) rotation += 360;

          node.rotation(rotation);
          setRotationAngle(rotation);

          // Snap guides en rotation
          const tempElement = {
            ...element,
            x: node.x(),
            y: node.y(),
            scaleX: node.scaleX(),
            scaleY: node.scaleY(),
            rotation: node.rotation(),
          };

          const otherElements = elements.filter((el) => el.id !== id && el.visible !== false);
          const { guides } = calculateSnapGuides(
            tempElement,
            node,
            otherElements,
            { width: docWidth, height: docHeight },
            5,
            findNodeById
          );

          setSnapGuides(guides);
        } else {
          // ✅ En resize
          setIsRotating(false);
          setRotationAngle(null);

          // TEXTE, comme PocketStick (`src/editor/canvas/Selection.jsx`) :
          // étirer la case change sa LARGEUR, jamais la taille de police — le
          // texte se réorganise à la ligne, les lettres ne grossissent pas. La
          // taille se règle dans la barre d'options. L'échelle est aussitôt
          // ramenée à 1 pour que rien ne se déforme pendant le geste.
          // IMAGE, comme PocketStick (`resizeStep`) : un COIN agrandit tout
          // ensemble ; un CÔTÉ garde l'image à la même échelle et en montre
          // plus ou moins — elle se recadre au lieu de s'écraser.
          const live = liveMedia.current;
          if (element.type === 'image' && live?.id === id) {
            const next = resizeStep(
              live.el,
              { scaleX: node.scaleX(), scaleY: node.scaleY(), anchor: activeAnchor },
              live.natural
            );
            live.el = { ...live.el, ...next, x: node.x(), y: node.y() };
            node.setAttrs({
              width: next.width,
              height: next.height,
              scaleX: 1,
              scaleY: 1,
              ...(live.natural ? { crop: konvaCrop(live.el, live.natural) } : {}),
            });
            // Comme PocketStick : AUCUN état React pendant le geste. Les guides
            // d'alignement (setSnapGuides) re-rendaient tout le canvas à chaque
            // mouvement de souris ; tout s'enregistre au relâchement.
            return;
          }

          if (element.type === 'text') {
            // La hauteur des lettres est un étirement vertical à garder
            node.setAttrs({
              width: Math.max(30, node.width() * node.scaleX()),
              scaleX: 1,
              scaleY: typoTexte(element).hauteur,
            });
          }

          // ✅ Snap guides pour tous les éléments (maintenant que c'est fluide)
          const tempElement = {
            ...element,
            x: node.x(),
            y: node.y(),
            scaleX: node.scaleX(),
            scaleY: node.scaleY(),
            rotation: node.rotation(),
          };

          const otherElements = elements.filter((el) => el.id !== id && el.visible !== false);
          const { guides } = calculateSnapGuides(
            tempElement,
            node,
            otherElements,
            { width: docWidth, height: docHeight },
            5,
            findNodeById
          );

          setSnapGuides(guides);
        }
      },
      [elements, docWidth, docHeight, findNodeById]
    );

    // 🎯 onTransformEnd - persistence finale
    const handleTransformEnd = useCallback(
      (id, node) => {
        setIsTransforming(false);
        setIsRotating(false);
        setRotationAngle(null);
        setSnapGuides([]);

        const element = elements.find((el) => el.id === id);
        if (!element) return;

        const updates = {
          ...positionDepuisNoeud(element, node),
          rotation: node.rotation(),
        };

        // 🎯 Pour les TEXTES : persister width/fontSize avec scale = 1
        if (element.type === 'fiche') {
          // Comme un texte : étirer change la LARGEUR, pas la taille des lettres
          updates.width = Math.max(40, Math.round((element.width ?? 360) * node.scaleX()));
          updates.scaleX = 1;
          updates.scaleY = 1;
          node.scale({ x: 1, y: 1 });
        } else if (element.type === 'text') {
          updates.width = node.width();
          updates.scaleX = 1;
          updates.scaleY = 1;
          node.scale({ x: 1, y: typoTexte(element).hauteur });
        } else if (element.type === 'image' && liveMedia.current?.id === id) {
          // Image : taille réelle et recadrage, échelle ramenée à 1
          const live = liveMedia.current;
          const el = { ...live.el, width: node.width(), height: node.height() };
          Object.assign(updates, {
            width: el.width,
            height: el.height,
            cropX: el.cropX,
            cropY: el.cropY,
            cropWidth: el.cropWidth,
            cropHeight: el.cropHeight,
            ...(live.natural ? settleCrop(el, live.natural) : {}),
            scaleX: 1,
            scaleY: 1,
          });
          liveMedia.current = null;
        } else {
          // Pour les autres éléments : garder le scale
          updates.scaleX = node.scaleX();
          updates.scaleY = node.scaleY();
        }

        // ✅ Persister dans le store
        updateElement(id, updates);
      },
      [elements, updateElement]
    );

    // 🎯 boundBoxFunc intelligent avec contraintes strictes
    const boundBoxFunc = useCallback(
      (oldBox, newBox) => {
        // 🔥 Contraintes minimales strictes
        const minWidth = 30; // Largeur minimale visible
        const minHeight = 20; // Hauteur minimale visible

        // Si on dépasse les limites, on garde l'ancienne box
        if (newBox.width < minWidth) {
          newBox.width = minWidth;
        }

        if (newBox.height < minHeight) {
          newBox.height = minHeight;
        }

        // 🎯 Pour les textes : contrainte supplémentaire sur le ratio
        const selectedElement = elements.find((el) => el.id === selectedId);
        if (selectedElement?.type === 'text') {
          // Empêcher un texte trop écrasé verticalement
          const minTextHeight = 15;
          if (newBox.height < minTextHeight) {
            newBox.height = minTextHeight;
          }
        }

        return newBox;
      },
      [elements, selectedId]
    );

    const shadowPropsFrom = (el) => ({
      shadowEnabled: el.shadowEnabled ?? false,
      shadowColor: el.shadowColor ?? '#000000',
      shadowOpacity: el.shadowOpacity ?? 0.4,
      shadowBlur: el.shadowBlur ?? 8,
      shadowOffsetX: el.shadowOffsetX ?? 2,
      shadowOffsetY: el.shadowOffsetY ?? 2,
    });

    useEffect(() => {
      const tr = transformerRef.current;
      const stage = stageRef.current;
      if (!tr || !stage || !selectedId || cropId) {
        tr?.nodes([]);
        tr?.getLayer()?.batchDraw();
        return;
      }
      // Tous les éléments sélectionnés, verrouillés et masqués exclus
      const nodes = idsSelectionnes({ selectedId, extraIds, elements })
        .map((id) => elements.find((el) => el.id === id))
        .filter((el) => el && !el.locked && el.visible !== false)
        .map((el) => stage.findOne(`#${el.id}`))
        .filter(Boolean);
      tr.nodes(nodes);

      // Forcer la mise à jour du Transformer après un court délai
      // pour que la police soit chargée et le texte redimensionné
      setTimeout(() => {
        tr.forceUpdate();
        tr.getLayer()?.batchDraw();
      }, 100);
    }, [selectedId, extraIds, elements, cropId]);

    // FLOU et effets en pixels (`utils/effetsKonva.js`) : posés sur le nœud
    // APRÈS son rendu, et reposés quand il a pu changer de contenu (image,
    // QR ou police qui arrivent plus tard). Le cache suit le zoom, sinon un
    // élément flouté serait pixelisé en zoom avant.
    useEffect(() => {
      const stage = stageRef.current;
      if (!stage) return undefined;
      const ratio = Math.max(1, zoom * (window.devicePixelRatio || 1));
      const appliquer = () => {
        for (const el of elements) {
          const node = stage.findOne(`#${el.id}`);
          if (!node) continue;
          if (!filtresDe(el).length && !node.isCached?.()) continue;
          appliquerEffets(node, el, { ratio });
        }
        stage.batchDraw();
      };
      const raf = requestAnimationFrame(appliquer);
      const tard = setTimeout(appliquer, 400);
      const encoreTard = setTimeout(appliquer, 1500);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(tard);
        clearTimeout(encoreTard);
      };
    }, [elements, zoom, selectedProduct]);

    return (
      <>
      <Stage
        ref={stageRef}
        width={stageW}
        height={stageH}
        onWheel={handleWheel}
        onMouseDown={(e) => {
          if (e.evt.button !== 0 || cropId || e.target !== e.target.getStage()) return;
          const p = e.target.getStage().getPointerPosition();
          if (!p) return;
          const point = { x: (p.x - docPos.x) / zoom, y: (p.y - docPos.y) / zoom };
          lassoRef.current = {
            start: point,
            ecran: p,
            base: e.evt.shiftKey ? idsSelectionnes(useLabelStore.getState()) : [],
            actif: false,
          };
        }}
        onMouseMove={(e) => {
          const g = lassoRef.current;
          if (!g) return;
          const p = e.target.getStage().getPointerPosition();
          if (!p) return;
          if (!g.actif && Math.hypot(p.x - g.ecran.x, p.y - g.ecran.y) < LASSO_MIN_DRAG) return;
          g.actif = true;
          const fin = { x: (p.x - docPos.x) / zoom, y: (p.y - docPos.y) / zoom };
          const rect = rectFromPoints(g.start, fin);
          setLasso(rect);
          // Cadres MESURÉS sur le canvas (nos éléments n'ont pas tous une
          // largeur : texte libre, QR, formes centrées).
          const groupe = docGroupRef.current;
          const touches = elements
            .filter((el) => el.visible !== false && !el.locked)
            .filter((el) => {
              const n = groupe?.findOne(`#${el.id}`);
              return n && boxesIntersect(n.getClientRect({ skipShadow: true, relativeTo: groupe }), rect);
            })
            .map((el) => el.id);
          setSelection([...new Set([...g.base, ...touches])]);
        }}
        onMouseUp={() => {
          if (lassoRef.current?.actif) lassoVientDeFinir.current = true;
          lassoRef.current = null;
          setLasso(null);
        }}
        onMouseLeave={() => {
          lassoRef.current = null;
          setLasso(null);
        }}
        onClick={(e) => {
          if (isDragging) return;
          if (lassoVientDeFinir.current) {
            lassoVientDeFinir.current = false;
            return;
          }
          if (e.target === e.target.getStage()) selectElement(null);
        }}
      >
        <Layer listening={false} perfectDrawEnabled={false}>
          <Group x={docPos.x} y={docPos.y} scaleX={zoom} scaleY={zoom} listening={false}>
            <Rect
              x={0}
              y={0}
              width={docWidth}
              height={docHeight}
              fill="#ffffff"
              stroke="#d1d5db"
              strokeWidth={1 / zoom}
              listening={false}
            />
          </Group>
        </Layer>

        <Layer perfectDrawEnabled={false}>
          <Group ref={docGroupRef} x={docPos.x} y={docPos.y} scaleX={zoom} scaleY={zoom}>
            {elements.map((el) => {
              if (el.visible === false) return null;

              const { type, id, x, y, locked, scaleX, scaleY, rotation } = el;
              const commonProps = {
                id,
                x,
                y,
                draggable: !locked && !isDragging,
                onClick: (e) => handleSelect(id, locked, e?.evt),
                onDragStart: handleDragStart,
                onDragMove: (e) => !locked && handleDragMove(id, e.target),
                onDragEnd: (e) => !locked && handleDragEnd(id, e.target),
                onTransformStart: (e) => !locked && handleTransformStart(id, e.target),
                onTransform: (e) => !locked && handleTransforming(id, e.target),
                onTransformEnd: (e) => !locked && handleTransformEnd(id, e.target),
                scaleX: scaleX || 1,
                scaleY: scaleY || 1,
                rotation: rotation || 0,
                opacity: locked ? 0.7 : 1,
                ...shadowPropsFrom(el),
              };

              if (type === 'text') {
                return (
                  <TextNode
                    key={`${id}-${currentProductIndex}`}
                    {...commonProps}
                    text={resolvePropForElement(el.text, el, selectedProduct)}
                    fontSize={el.fontSize}
                    fontStyle={el.fontStyle || (el.bold ? 'bold' : 'normal')} // ✅ supporte gras+italique combinés, fallback ancien champ "bold"
                    fontFamily={el.fontFamily || 'Arial'} // 🎨 Ajouter le support de fontFamily
                    textDecoration={el.textDecoration || ''} // souligné / barré
                    highlightEnabled={!!el.highlightEnabled} // 🖍️ surlignage stabilo
                    highlightColor={el.highlightColor || '#FFFF00'}
                    fill={el.color}
                    width={el.width}
                    locked={locked}
                    dataBinding={el.dataBinding || null}
                    correctionKey={selectedProduct?._id ?? null}
                    fillGradient={el.fillGradient ?? null}
                    stroke={el.stroke ?? ''}
                    strokeWidth={el.strokeWidth ?? 0}
                    strokeGradient={el.strokeGradient ?? null}
                    align={el.align ?? 'left'}
                    {...typoTexte(el)}
                  />
                );
              }

              if (type === 'qrcode') {
                const qrValue = resolvePropForElement(el.qrValue, el, selectedProduct) ?? '';
                // QR lié à un produit qui n'a pas la valeur (typiquement : pas
                // d'URL web, produit sans slug) → rien. Surtout pas un QR vide,
                // ni un repli sur une autre donnée : il s'imprimerait et ne
                // mènerait nulle part.
                if (el.dataBinding && !String(qrValue).trim()) return null;
                return (
                  <QRCodeNode
                    key={`${id}-${currentProductIndex}`}
                    {...commonProps}
                    size={el.size ?? 160}
                    color={el.color ?? '#000000'}
                    bgColor={el.bgColor ?? '#FFFFFF00'}
                    fillGradient={el.fillGradient ?? null}
                    qrValue={qrValue}
                  />
                );
              }

              if (type === 'image') {
                return (
                  <ImageNode
                    key={`${id}-${currentProductIndex}`}
                    {...commonProps}
                    width={el.width ?? 160}
                    height={el.height ?? 160}
                    src={resolvePropForElement(el.src, el, selectedProduct) ?? ''}
                    opacity={el.opacity ?? 1}
                    cropX={el.cropX}
                    cropY={el.cropY}
                    cropWidth={el.cropWidth}
                    cropHeight={el.cropHeight}
                    flipX={!!el.flipX}
                    flipY={!!el.flipY}
                    mask={el.mask ?? null}
                    maskPadding={el.maskPadding ?? 0}
                    maskTexture={el.maskTexture ?? null}
                    maskFeather={el.maskFeather ?? 0}
                    // Double-clic : recadrer, comme PocketStick
                    onDblClick={() => !locked && startCrop(id)}
                    onDblTap={() => !locked && startCrop(id)}
                  />
                );
              }

              if (type === 'fiche') {
                // Sans produit : un contenu d'exemple, pour régler l'élément.
                // Produit SANS cette section : rien, comme un QR sans URL.
                const contenu = selectedProduct
                  ? contenuFiche(selectedProduct.description, el.section)
                  : EXEMPLE_FICHE[el.section] ?? EXEMPLE_FICHE.specs;
                if (!contenu) return null;
                const { scaleX: _sx, scaleY: _sy, ...groupe } = commonProps;
                return (
                  <FicheNode
                    key={`${id}-${currentProductIndex}`}
                    {...groupe}
                    el={el}
                    contenu={contenu}
                  />
                );
              }

              if (type === 'shape') {
                return (
                  <ShapeNode
                    key={`${id}-${currentProductIndex}`}
                    {...commonProps}
                    shape={el.shape ?? 'rectangle'}
                    width={el.width ?? 160}
                    height={el.height ?? 160}
                    fill={el.fill ?? '#3b82f6'}
                    stroke={el.stroke ?? ''}
                    strokeWidth={el.strokeWidth ?? 0}
                    cornerRadius={el.cornerRadius ?? 0}
                    fillGradient={el.fillGradient ?? null}
                    strokeGradient={el.strokeGradient ?? null}
                  />
                );
              }

              if (type === 'barcode') {
                return (
                  <BarcodeNode
                    key={`${id}-${currentProductIndex}`}
                    {...commonProps}
                    width={el.width ?? 200}
                    height={el.height ?? 80}
                    barcodeValue={resolvePropForElement(el.barcodeValue, el, selectedProduct) ?? ''}
                    format={el.format ?? 'CODE128'}
                    displayValue={el.displayValue ?? true}
                    fontSize={el.fontSize ?? 14}
                    textMargin={el.textMargin ?? 2}
                    margin={el.margin ?? 10}
                    barHeight={el.barHeight}
                    barWidth={el.barWidth}
                    textFormat={el.textFormat ?? 'brut'}
                    background={el.background ?? '#FFFFFF'}
                    lineColor={el.lineColor ?? '#000000'}
                  />
                );
              }

              return null;
            })}

            {(isDraggingElement || isTransforming) &&
              snapGuides.map((guide, i) => {
                if (guide.type === 'vertical') {
                  return (
                    <Line
                      key={`guide-v-${i}`}
                      points={[guide.x, guide.y1, guide.x, guide.y2]}
                      stroke="#FF00FF"
                      strokeWidth={1 / zoom}
                      dash={[4 / zoom, 4 / zoom]}
                      listening={false}
                    />
                  );
                }
                if (guide.type === 'horizontal') {
                  return (
                    <Line
                      key={`guide-h-${i}`}
                      points={[guide.x1, guide.y, guide.x2, guide.y]}
                      stroke="#FF00FF"
                      strokeWidth={1 / zoom}
                      dash={[4 / zoom, 4 / zoom]}
                      listening={false}
                    />
                  );
                }
                return null;
              })}
          </Group>

          {lasso && (
            <Group x={docPos.x} y={docPos.y} scaleX={zoom} scaleY={zoom} listening={false}>
              <Rect
                {...lasso}
                fill="rgba(59, 130, 246, 0.08)"
                stroke="#3b82f6"
                strokeWidth={1 / zoom}
                dash={[4 / zoom, 3 / zoom]}
              />
            </Group>
          )}

          {/* Recadrage : même position et zoom que le document, mais HORS de
              son groupe — l'export clone ce groupe, la surcouche ne doit pas
              s'imprimer. */}
          {(() => {
            const cropEl = cropId ? elements.find((e) => e.id === cropId) : null;
            if (!cropEl) return null;
            return (
              <>
                <Group x={docPos.x} y={docPos.y} scaleX={zoom} scaleY={zoom}>
                  <CropOverlay
                    element={cropEl}
                    src={resolvePropForElement(cropEl.src, cropEl, selectedProduct) ?? ''}
                    scale={zoom}
                    onChange={(attrs) => updateElement(cropEl.id, attrs)}
                  />
                </Group>
                <CropTransformer element={cropEl} />
              </>
            );
          })()}

          <Transformer
            ref={transformerRef}
            visible={!cadreMasque}
            boundBoxFunc={boundBoxFunc}
            rotationSnaps={[0, 90, 180, 270]}
            rotationSnapTolerance={5}
            rotateAnchorOffset={30}
            // Texte : poignées de CÔTÉ seulement, comme PocketStick — un coin
            // ou un bord haut/bas agrandirait les lettres.
            enabledAnchors={
              !extraIds.length && ['text', 'fiche'].includes(elements.find((el) => el.id === selectedId)?.type)
                ? ['middle-left', 'middle-right']
                : [
                    'top-left',
                    'top-center',
                    'top-right',
                    'middle-right',
                    'middle-left',
                    'bottom-left',
                    'bottom-center',
                    'bottom-right',
                  ]
            }
          />

          {/* Badge de rotation : affiché UNIQUEMENT pendant la rotation */}
          {isRotating && rotationAngle !== null && selectedId && (
            <Group>
              {(() => {
                const selectedNode = stageRef.current?.findOne(`#${selectedId}`);
                if (!selectedNode) return null;

                const box = selectedNode.getClientRect();
                const centerX = box.x + box.width / 2;
                const centerY = box.y + box.height / 2 - 40;

                return (
                  <Group x={centerX} y={centerY}>
                    <Rect
                      x={-30}
                      y={-12}
                      width={60}
                      height={24}
                      fill="#000000"
                      opacity={0.8}
                      cornerRadius={4}
                      listening={false}
                    />
                    <Text
                      x={-30}
                      y={-12}
                      width={60}
                      height={24}
                      text={`${Math.round(rotationAngle)}°`}
                      fontSize={12}
                      fontFamily="sans-serif"
                      fill="#FFFFFF"
                      align="center"
                      verticalAlign="middle"
                      listening={false}
                    />
                  </Group>
                );
              })()}
            </Group>
          )}
        </Layer>

        <Layer listening={false} perfectDrawEnabled={false} />
      </Stage>
      {/* Étiquette de la sélection : HTML par-dessus le Stage (même repère) */}
      <EtiquetteSelection stageRef={stageRef} transformerRef={transformerRef} />
      </>
    );
  }
);

KonvaCanvas.displayName = 'KonvaCanvas';

export default KonvaCanvas;
