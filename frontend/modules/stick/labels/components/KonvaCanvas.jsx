import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from 'react';
import { Stage, Layer, Group, Rect, Transformer, Line, Text } from 'react-konva';
import useLabelStore from '../store/useLabelStore';
import QRCodeNode from './canvas/QRCodeNode';
import ImageNode from './canvas/ImageNode';
import BarcodeNode from './canvas/BarcodeNode';
import TextNode from './canvas/TextNode';
import ShapeNode from './canvas/ShapeNode';
import { calculateSnapGuides } from '../utils/snapGuides.utils';
import { resolvePropForElement } from '../utils/dataBinding';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const KonvaCanvas = forwardRef(
  (
    { viewportWidth = 0, viewportHeight = 0, docWidth = 800, docHeight = 600, zoom = 1, onDocNode },
    ref
  ) => {
    const elements = useLabelStore((s) => s.elements);
    const selectedId = useLabelStore((s) => s.selectedId);
    const selectElement = useLabelStore((s) => s.selectElement);
    const updateElement = useLabelStore((s) => s.updateElement);
    const setZoom = useLabelStore((s) => s.setZoom);
    const selectedProduct = useLabelStore((s) => s.selectedProduct);
    const currentProductIndex = useLabelStore((s) => s.currentProductIndex);

    const stageRef = useRef(null);
    const transformerRef = useRef(null);
    const docGroupRef = useRef(null);

    useImperativeHandle(ref, () => stageRef.current, []);

    useEffect(() => {
      if (onDocNode) onDocNode(docGroupRef.current || null);
    }, [onDocNode, zoom]);

    const [docPos, setDocPos] = useState({ x: 0, y: 0 });
    const [isInitialized, setIsInitialized] = useState(false);

    const [snapGuides, setSnapGuides] = useState([]);
    const [isDraggingElement, setIsDraggingElement] = useState(false);
    const [isTransforming, setIsTransforming] = useState(false);

    // États pour la rotation
    const [isRotating, setIsRotating] = useState(false);
    const [rotationAngle, setRotationAngle] = useState(null);

    const findNodeById = useCallback((id) => {
      return stageRef.current?.findOne(`#${id}`);
    }, []);

    const [isDragging, setIsDragging] = useState(false);
    const panLast = useRef({ x: 0, y: 0 });

    const centerDocument = useCallback(
      (scale = zoom) => {
        if (!viewportWidth || !viewportHeight) return;
        setDocPos({
          x: (viewportWidth - docWidth * scale) / 2,
          y: (viewportHeight - docHeight * scale) / 2,
        });
      },
      [viewportWidth, viewportHeight, docWidth, docHeight, zoom]
    );

    useEffect(() => {
      if (!isInitialized && viewportWidth > 0 && viewportHeight > 0) {
        centerDocument();
        setIsInitialized(true);
      }
    }, [viewportWidth, viewportHeight, isInitialized, centerDocument]);

    const recenterDocument = useCallback(() => {
      centerDocument(zoom);
    }, [centerDocument, zoom]);

    const handleWheel = useCallback(
      (e) => {
        e.evt.preventDefault();
        const stage = stageRef.current;
        if (!stage) return;

        const direction = e.evt.deltaY > 0 ? 1 : -1;
        const scaleBy = 1.08;
        const oldZoom = zoom;
        const newZoom = clamp(direction > 0 ? oldZoom / scaleBy : oldZoom * scaleBy, 0.1, 3);

        const pointer = stage.getPointerPosition();
        if (!pointer) return;

        const mousePointTo = {
          x: (pointer.x - docPos.x) / oldZoom,
          y: (pointer.y - docPos.y) / oldZoom,
        };

        const newPos = {
          x: pointer.x - mousePointTo.x * newZoom,
          y: pointer.y - mousePointTo.y * newZoom,
        };

        setZoom(newZoom);
        setDocPos(newPos);
      },
      [zoom, setZoom, docPos]
    );

    useEffect(() => {
      const stage = stageRef.current;
      if (!stage) return;
      const c = stage.container();
      c.style.cursor = isDragging ? 'grabbing' : 'default';
    }, [isDragging]);

    const onStageMouseDown = useCallback((e) => {
      const isMiddle = e.evt?.button === 1;
      if (isMiddle) {
        setIsDragging(true);
        const pos = stageRef.current?.getPointerPosition() || { x: 0, y: 0 };
        panLast.current = pos;
      }
    }, []);

    const onStageMouseMove = useCallback(() => {
      if (!isDragging) return;
      const stage = stageRef.current;
      if (!stage) return;
      const pos = stage.getPointerPosition() || { x: 0, y: 0 };
      const dx = pos.x - panLast.current.x;
      const dy = pos.y - panLast.current.y;
      panLast.current = pos;
      setDocPos((p) => ({ x: p.x + dx, y: p.y + dy }));
    }, [isDragging]);

    const onStageMouseUp = useCallback(() => {
      if (isDragging) setIsDragging(false);
    }, [isDragging]);

    const handleSelect = useCallback(
      (id, locked) => {
        if (isDragging) return;
        if (!locked) selectElement(id);
      },
      [isDragging, selectElement]
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
        if (snapX !== null) node.x(snapX);
        if (snapY !== null) node.y(snapY);
      },
      [elements, docWidth, docHeight, findNodeById]
    );

    const handleDragStart = useCallback(() => setIsDraggingElement(true), []);

    const handleDragEnd = useCallback(
      (id, node) => {
        setIsDraggingElement(false);
        setSnapGuides([]);
        updateElement(id, { x: node.x(), y: node.y() });
      },
      [updateElement]
    );

    // 🎯 onTransformStart simple
    const handleTransformStart = useCallback(() => {
      setIsTransforming(true);
    }, []);

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

          // 🎯 APPROCHE KONVA OFFICIELLE pour les TEXTES
          if (element.type === 'text') {
            const scaleX = node.scaleX();
            const scaleY = node.scaleY();

            // ✅ Calculer nouvelles dimensions avec contraintes minimales strictes
            const newWidth = Math.max(30, node.width() * scaleX);
            const newFontSize = Math.max(10, node.fontSize() * scaleY);

            // ⚡ Appliquer immédiatement avec setAttrs (méthode Konva)
            node.setAttrs({
              width: newWidth,
              fontSize: newFontSize,
              scaleX: 1,
              scaleY: 1,
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
          x: node.x(),
          y: node.y(),
          rotation: node.rotation(),
        };

        // 🎯 Pour les TEXTES : persister width/fontSize avec scale = 1
        if (element.type === 'text') {
          updates.width = node.width();
          updates.fontSize = node.fontSize();
          updates.scaleX = 1;
          updates.scaleY = 1;
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
      if (!tr || !stage || !selectedId) {
        tr?.nodes([]);
        tr?.getLayer()?.batchDraw();
        return;
      }
      const selectedElement = elements.find((el) => el.id === selectedId);
      if (!selectedElement || selectedElement.locked || selectedElement.visible === false) {
        tr.nodes([]);
        tr.getLayer()?.batchDraw();
        return;
      }
      const node = stage.findOne(`#${selectedId}`);
      tr.nodes(node ? [node] : []);

      // Forcer la mise à jour du Transformer après un court délai
      // pour que la police soit chargée et le texte redimensionné
      setTimeout(() => {
        tr.forceUpdate();
        tr.getLayer()?.batchDraw();
      }, 100);
    }, [selectedId, elements]);

    const stageW = Math.max(1, viewportWidth);
    const stageH = Math.max(1, viewportHeight);

    return (
      <Stage
        ref={stageRef}
        width={stageW}
        height={stageH}
        onWheel={handleWheel}
        onMouseDown={onStageMouseDown}
        onMouseMove={onStageMouseMove}
        onMouseUp={onStageMouseUp}
        onClick={(e) => {
          if (isDragging) return;
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
                onClick: () => handleSelect(id, locked),
                onDragStart: handleDragStart,
                onDragMove: (e) => !locked && handleDragMove(id, e.target),
                onDragEnd: (e) => !locked && handleDragEnd(id, e.target),
                onTransformStart: (e) => !locked && handleTransformStart(),
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
                  />
                );
              }

              if (type === 'qrcode') {
                return (
                  <QRCodeNode
                    key={`${id}-${currentProductIndex}`}
                    {...commonProps}
                    size={el.size ?? 160}
                    color={el.color ?? '#000000'}
                    bgColor={el.bgColor ?? '#FFFFFF00'}
                    qrValue={resolvePropForElement(el.qrValue, el, selectedProduct) ?? ''}
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

          <Transformer
            ref={transformerRef}
            boundBoxFunc={boundBoxFunc}
            rotationSnaps={[0, 90, 180, 270]}
            rotationSnapTolerance={5}
            rotateAnchorOffset={30}
            enabledAnchors={[
              'top-left',
              'top-center',
              'top-right',
              'middle-right',
              'middle-left',
              'bottom-left',
              'bottom-center',
              'bottom-right',
            ]}
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
    );
  }
);

KonvaCanvas.displayName = 'KonvaCanvas';

export default KonvaCanvas;
