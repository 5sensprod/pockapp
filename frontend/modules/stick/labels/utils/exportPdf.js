// src/utils/exportPdf.js
import jsPDF from 'jspdf';
import Konva from 'konva';

/**
 * Export PDF sans déformation:
 * - clone le Group "document"
 * - rend dans un Stage/Layer temporaire (scale=1, pos=0,0)
 * - exporte en image haute résolution vers jsPDF
 *
 * ✨ AMÉLIORATION QUALITÉ :
 * - pixelRatio par défaut augmenté à 3
 * - Meilleure qualité pour les QR codes et textes
 */
export async function exportPdf(
  docNode,
  {
    width,
    height,
    fileName = 'document.pdf',
    pixelRatio = 3, // 🔥 Augmenté de 2 à 3
    addWhitePage = true,
  } = {}
) {
  if (!docNode || !width || !height) return;

  // 1) Clone propre du contenu (sans la preview/fond)
  const clone = docNode.clone({
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
  });

  // 2) Stage/Layer temporaires hors DOM
  const container = document.createElement('div');
  const stage = new Konva.Stage({ container, width, height });
  const layer = new Konva.Layer();
  stage.add(layer);
  layer.add(clone);
  layer.draw();

  // 3) DataURL haute résolution (pas de transform => pas de déformation)
  // ✨ pixelRatio augmenté pour meilleure qualité
  const dataURL = stage.toDataURL({
    pixelRatio,
    mimeType: 'image/png',
    quality: 1.0, // Qualité maximale
  });

  // 4) PDF
  const orientation = width >= height ? 'landscape' : 'portrait';
  const pdf = new jsPDF({
    orientation,
    unit: 'pt',
    format: [width, height],
    compress: true, // Compression PDF pour réduire la taille
  });

  if (addWhitePage) {
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, width, height, 'F');
  }

  pdf.addImage(dataURL, 'PNG', 0, 0, width, height, undefined, 'FAST');
  pdf.save(fileName);

  // 5) Nettoyage
  stage.destroy();
  container.remove();
}
