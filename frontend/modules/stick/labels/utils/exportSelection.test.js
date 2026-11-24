import { crc32 } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';

// Le dessin (Konva, canvas) ne tourne pas sous Node : seuls les calculs sont testés ici
vi.mock('konva', () => ({ default: {} }));
vi.mock('@/lib/use-pocketbase', () => ({ usePocketBase: () => ({}) }));

const { lirePolice, octetsPngAvecDpi, PIXELS_PAR_POINT } = await import('./exportSelection');

describe('police lue dans la chaîne `font` du canvas', () => {
  it('forme écrite par Konva : style, variante, taille, famille entre guillemets', () => {
    expect(lirePolice('italic bold normal 48px "Open Sans"')).toEqual({ taille: 48, famille: 'Open Sans', gras: true, italique: true });
  });
  it('famille de repli ignorée, taille décimale, graisse chiffrée', () => {
    expect(lirePolice('700 12.5px Roboto, sans-serif')).toEqual({ taille: 12.5, famille: 'Roboto', gras: true, italique: false });
  });
  it('normal', () => {
    expect(lirePolice('normal normal 20px Arial')).toEqual({ taille: 20, famille: 'Arial', gras: false, italique: false });
  });
  it('illisible : null', () => {
    expect(lirePolice('')).toBeNull();
  });
});

describe('300 dpi', () => {
  it('un point vaut 300/72 pixels', () => {
    expect(PIXELS_PAR_POINT * 72).toBeCloseTo(300);
  });
});

// Un PNG minimal : signature, IHDR, IEND (le contenu de l'image ne compte pas ici)
const bloc = (type, donnees) => {
  const b = Buffer.alloc(12 + donnees.length);
  b.writeUInt32BE(donnees.length, 0);
  b.write(type, 4, 'latin1');
  Buffer.from(donnees).copy(b, 8);
  b.writeUInt32BE(crc32(b.subarray(4, 8 + donnees.length)), 8 + donnees.length);
  return b;
};
const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = (...blocs) => new Uint8Array(Buffer.concat([SIGNATURE, bloc('IHDR', new Uint8Array(13)), ...blocs, bloc('IEND', [])]));

const blocs = (octets) => {
  const b = Buffer.from(octets);
  const liste = [];
  for (let i = 8; i < b.length; ) {
    const n = b.readUInt32BE(i);
    liste.push({ type: b.toString('latin1', i + 4, i + 8), donnees: b.subarray(i + 8, i + 8 + n), crc: b.readUInt32BE(i + 8 + n), brut: b.subarray(i + 4, i + 8 + n) });
    i += 12 + n;
  }
  return liste;
};

describe('résolution déclarée dans le PNG', () => {
  it('un pHYs juste après IHDR, au mètre, CRC juste', () => {
    const sortie = blocs(octetsPngAvecDpi(png(), 300));
    expect(sortie.map((b) => b.type)).toEqual(['IHDR', 'pHYs', 'IEND']);
    const p = sortie[1];
    expect(p.donnees.readUInt32BE(0)).toBe(11811);
    expect(p.donnees.readUInt32BE(4)).toBe(11811);
    expect(p.donnees[8]).toBe(1);
    for (const b of sortie) expect(b.crc).toBe(crc32(b.brut));
  });
  it('un pHYs existant est remplacé, pas doublé', () => {
    const ancien = bloc('pHYs', [0, 0, 0x0b, 0x13, 0, 0, 0x0b, 0x13, 1]);
    const sortie = blocs(octetsPngAvecDpi(png(ancien), 300));
    expect(sortie.map((b) => b.type)).toEqual(['IHDR', 'pHYs', 'IEND']);
    expect(sortie[1].donnees.readUInt32BE(0)).toBe(11811);
  });
  it('ce qui n’est pas un PNG est rendu tel quel', () => {
    const autre = new Uint8Array(40);
    expect(octetsPngAvecDpi(autre, 300)).toBe(autre);
  });
});
