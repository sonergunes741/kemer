/**
 * Makam scales in the Arel-Ezgi-Uzdilek system: the whole tone is 9 Holdrian commas and the
 * octave 53, so the characteristic steps are exact: koma 1, bakiye 4, küçük mücennep 5, büyük
 * mücennep 8, tanini 9, artık ikili 12-13. Pure data and arithmetic.
 */

export type MakamId = 'rast' | 'ussak' | 'huseyni' | 'hicaz' | 'saba' | 'kurdi' | 'nihavend';

export const COMMAS_PER_OCTAVE = 53;
export const COMMA_CENTS = 1200 / COMMAS_PER_OCTAVE;

export interface Makam {
  readonly id: MakamId;
  readonly name: string;
  /** The seven steps of one octave, ascending, in commas (they sum to 53). */
  readonly steps: readonly number[];
  /** Frequency of the durak (tonic), Hz. */
  readonly tonic: number;
  /** Scale degree of the güçlü (the dominant the melody leans on). */
  readonly guclu: number;
}

/** Dügâh-based makams sit on D3; rast-based ones on C3 (a comfortable ud and ney register). */
const DUGAH = 146.83;
const RAST = 130.81;

export const MAKAMS: Readonly<Record<MakamId, Makam>> = {
  // Rast pentachord + Rast tetrachord: the warm, settled one.
  rast: { id: 'rast', name: 'Rast', steps: [9, 8, 5, 9, 9, 8, 5], tonic: RAST, guclu: 4 },
  // Uşşak tetrachord + Buselik pentachord on neva.
  ussak: { id: 'ussak', name: 'Uşşak', steps: [8, 5, 9, 9, 4, 9, 9], tonic: DUGAH, guclu: 3 },
  // Hüseyni pentachord + Uşşak tetrachord on hüseyni: open, pastoral.
  huseyni: { id: 'huseyni', name: 'Hüseyni', steps: [8, 5, 9, 9, 8, 5, 9], tonic: DUGAH, guclu: 4 },
  // Hicaz tetrachord (the augmented second) + Rast pentachord on neva.
  hicaz: { id: 'hicaz', name: 'Hicaz', steps: [5, 12, 5, 9, 8, 5, 9], tonic: DUGAH, guclu: 3 },
  // Saba: the diminished fourth of the Saba tetrachord, the lament.
  saba: { id: 'saba', name: 'Saba', steps: [8, 5, 5, 13, 4, 9, 9], tonic: DUGAH, guclu: 2 },
  // Kürdi tetrachord + Buselik pentachord on neva.
  kurdi: { id: 'kurdi', name: 'Kürdi', steps: [4, 9, 9, 9, 4, 9, 9], tonic: DUGAH, guclu: 3 },
  // Buselik pentachord + Kürdi tetrachord on neva.
  nihavend: { id: 'nihavend', name: 'Nihavend', steps: [9, 4, 9, 9, 4, 9, 9], tonic: RAST, guclu: 4 },
};

/** Commas above the tonic for any integer degree (negative degrees go below the tonic). */
export function degreeCommas(makam: Makam, degree: number): number {
  const d = Math.round(degree);
  const octave = Math.floor(d / 7);
  const within = d - octave * 7;
  let c = 0;
  for (let i = 0; i < within; i++) c += makam.steps[i] ?? 0;
  return octave * COMMAS_PER_OCTAVE + c;
}

export function degreeCents(makam: Makam, degree: number): number {
  return degreeCommas(makam, degree) * COMMA_CENTS;
}

/** Frequency of a degree, Hz. */
export function degreeFreq(makam: Makam, degree: number): number {
  return makam.tonic * Math.pow(2, degreeCommas(makam, degree) / COMMAS_PER_OCTAVE);
}

/** Largest single step in the scale, in commas (the hicaz and saba colour). */
export function widestStep(makam: Makam): number {
  return Math.max(...makam.steps);
}

/**
 * The makam colour of each river (level index 1..12, 13 for the epilogue, 0 for generated rivers):
 * central Anatolian Hüseyni and Uşşak, Hicaz in the south-east, Kürdi in the east and on the
 * Black Sea, Rast and Nihavend in Rumeli.
 */
const REGION: readonly MakamId[] = [
  'ussak', //    0 generated
  'huseyni', //  1 Koramaz
  'ussak', //    2 Zamantı
  'huseyni', //  3 Kızılırmak
  'ussak', //    4 Yeşilırmak
  'hicaz', //    5 Dicle
  'kurdi', //    6 Batman
  'huseyni', //  7 Aras
  'hicaz', //    8 Arpaçay
  'kurdi', //    9 Fırtına
  'rast', //    10 Sakarya
  'rast', //    11 Tunca
  'nihavend', // 12 Ergene
  'huseyni', // 13 epilogue: back on the Koramaz
];

export function regionMakam(levelIndex: number): MakamId {
  const i = Math.round(levelIndex);
  return REGION[i >= 0 && i < REGION.length ? i : 0] ?? 'ussak';
}
