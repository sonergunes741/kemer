/**
 * The game's own words: the coach's lines, captions of the centuries and short notices. Authored
 * as LocalText in the plain mason's voice (Turkish first, English as spare); interface chrome
 * lives in src/i18n. No exclamation marks.
 */
import { formatNumber } from '../core/format';
import { lt } from '../core/i18n';
import type { ActorKind, HazardDef, LocalText, TrafficEra } from '../core/types';
import { PARMAK } from '../core/config';

export const TEXT = {
  // The coach of river 1 (DESIGN 8), in teaching order.
  raise: { tr: 'Tepeyi yukarı çek.', en: 'Draw the crown up.' },
  thrust: { tr: 'Altın çizgi yükün yoludur. Taşın içinde kalmalı.', en: 'The gold line is the path of the load. It must stay inside the stone.' },
  thicken: { tr: 'Kemeri kalınlaştır; çizgi taşın içine girsin.', en: 'Thicken the ring until the line runs inside it.' },
  build: { tr: 'Çizgi taşın içinde. Kur.', en: 'The line is inside the stone. Build.' },
  lay: { tr: 'Basılı tut: taşlar dizilsin.', en: 'Hold to lay the stones.' },
  keystone: { tr: 'Kilit taşını boşluğun üstüne getir, bırak.', en: 'Bring the keystone over the gap and let go.' },
  mark: { tr: 'İşaretini keseceğin taşa dokun.', en: 'Tap the stone that will carry your mark.' },
  wedges: { tr: 'Kamalara vur. Üç darbe.', en: 'Strike the wedges. Three blows.' },
  sun: { tr: 'Güneşi tut, gökyüzünde sürükle.', en: 'Take hold of the sun and draw it across the sky.' },
  repair: { tr: 'Şakül titriyor. Derzleri onar.', en: 'The plumb bob trembles. Repoint the joints.' },

  // One step per newly unlocked tool on later rivers.
  'tool.fullness': { tr: 'Omzu sürükle: kemer dolgunlaşır ya da sivrilir.', en: 'Drag the haunch: the arch fills out or turns pointed.' },
  'tool.cover': { tr: 'Kilidin üstündeki dolguyu ayarla.', en: 'Set the fill above the crown.' },
  'tool.piers': { tr: 'Yatağa ayak ekle: dokun.', en: 'Add a pier in the riverbed: tap.' },
  'tool.pier-width': { tr: 'Ayağın yanını sürükle: genişlik.', en: 'Drag the side of a pier to widen it.' },
  'tool.cutwaters': { tr: 'Selyaran: ayağın burnu suyu yarar.', en: 'Cutwaters: a pointed nose parts the water.' },
  'tool.foundation': { tr: 'Temeli derine indir; oyulmaya karşı.', en: 'Take the foundation deeper, against scour.' },
  'tool.reliefs': { tr: 'Boşaltma gözleri: sel kemerin içinden geçer.', en: 'Relief openings let a flood through the spandrels.' },
  'tool.spring': { tr: 'Üzengi hattını yükselt ya da indir.', en: 'Raise or lower the springing line.' },
  'tool.clamps': { tr: 'Kenet: demir ve kurşun taşları bağlar.', en: 'Clamps: iron and lead tie the stones.' },
  'tool.piles': { tr: 'Kazık: yumuşak zemine ahşap kazık çak.', en: 'Piles: timber driven into soft ground.' },

  // Design
  remembered: { tr: 'Hatırlanan sel', en: 'Remembered flood' },
  settled: { tr: 'Kemer yükünü aldı', en: 'The arch took its weight' },

  // The centuries
  flood: { tr: 'sel', en: 'flood' },
  quake: { tr: 'deprem', en: 'earthquake' },
  warning: { tr: 'Şakül titriyor.', en: 'The plumb bob trembles.' },
  outlast: { tr: 'Köprü ustasından uzun yaşadı.', en: 'The bridge has outlived its builder.' },
  nearMiss: { tr: 'Emniyet {n} oldu, dayandı.', en: 'Safety fell to {n}; it held.' },
  ending: { tr: 'bir bahar öğleden sonrası', en: 'a spring afternoon' },
  footOnly: { tr: 'yalnız yayalar', en: 'on foot only' },
  repairDone: { tr: 'Onarıldı · {n} taş', en: 'Repaired · {n} stones' },
  repairSeal: {
    tr: 'Onarım {n} taş tutar. En büyük sel daha gelmedi: onarırsan onarımsız mührü alamazsın. Onarmak için yine bas.',
    en: 'A repair takes {n} stones. The greatest flood is still to come: repair now and the unrepaired seal is lost. Press again to repair.',
  },
  repairNothing: { tr: 'Onarılacak bir şey yok.', en: 'Nothing needs repair.' },

  // Progress and modes
  unlocked: { tr: '{river} açıldı.', en: '{river} is open.' },
  modesLocked: { tr: 'Önce ilk ırmağı geç.', en: 'Pass the first river first.' },
  dailyLine: { tr: 'Günün Nehri · {streak} gün üst üste · bugünün en iyisi {best} yıl', en: 'River of the Day · {streak} days in a row · today’s best {best} years' },
  dailyFirst: { tr: 'Günün Nehri · bugünün en iyisi {best} yıl', en: 'River of the Day · today’s best {best} years' },
  millenniumStones: { tr: 'Bin yıl · {n} taş · en azı {best} taş', en: 'A thousand years · {n} stones · fewest {best}' },
  millenniumYears: { tr: 'Bin yıl · {n} yıl dayandı · en iyisi {best} yıl', en: 'A thousand years · stood {n} years · best {best}' },
  newBest: { tr: 'Yeni en iyi.', en: 'A new best.' },

  // Sharing
  shareLine: { tr: 'Benimki {n} yıl dayandı. Seninki?', en: 'Mine has stood {n} years. Yours?' },
  yearsN: { tr: '{n} yıl', en: '{n} years' },
  shareWhere: { tr: '{river}, {year} · {stones} taş', en: '{river}, {year} · {stones} stones' },
  shareCopied: { tr: 'Panoya kopyalandı.', en: 'Copied to the clipboard.' },
  shareSaved: { tr: 'Dosya kaydedildi.', en: 'The file is saved.' },
  shareFailed: { tr: 'Paylaşılamadı.', en: 'Could not share.' },
  shareRecording: { tr: 'Zaman akışı kaydediliyor…', en: 'Recording the time-lapse…' },
  shareNoVideo: { tr: 'Bu tarayıcı video kaydedemiyor.', en: 'This browser cannot record video.' },
  shareVideoReady: { tr: 'Video hazır: paylaşmak için yine Video’ya bas.', en: 'The video is ready: press Video again to share it.' },
  shareBusy: { tr: 'Bir kayıt sürüyor.', en: 'A recording is under way.' },

  // The epilogue
  wipe: { tr: 'Yosunu sil; işaretimizi bul.', en: 'Wipe the moss away; find our mark.' },
  wipeLine: { tr: 'Yosunu sil', en: 'Wipe the moss' },
  found: { tr: 'işaretimiz', en: 'our mark' },
  read: { tr: 'Çizgi, aşınmış derzlerin yakınından geçiyor. En küçük onarımı seç.', en: 'The line runs close to the worn joints. Choose the smallest repair.' },
  repairClean: { tr: 'Yalnız temizle', en: 'Only clean it' },
  repairPoint: { tr: 'Derzleri doldur', en: 'Point the joints' },
  repairRelay: { tr: 'Kemeri yeniden ör', en: 'Re-lay the ring' },
  repairThicken: { tr: 'Kemeri kalınlaştır, {cm}', en: 'Thicken the ring, {cm}' },
  stonesN: { tr: '{n} taş', en: '{n} stones' },
  mend: { tr: 'Onar', en: 'Mend' },
  mendN: { tr: 'Onar · {n} taş', en: 'Mend · {n} stones' },
  notEnough: { tr: 'Yetmedi: şakül hâlâ titriyor.', en: 'Not enough: the plumb bob still trembles.' },
  mended: { tr: 'Şakül durdu.', en: 'The plumb bob is still.' },
  leastLine: { tr: '{n} taş. Gerekenden fazlasına dokunmadım.', en: '{n} stones. I touched nothing more than it needed.' },
  moreLine: { tr: '{n} taş. Gerekenden {extra} taş fazla koydum; taş affeder.', en: '{n} stones, {extra} more than it needed; stone forgives.' },
  ledgerClosing: { tr: 'Defter', en: 'The ledger' },
} as const satisfies Record<string, LocalText>;

export type TextKey = keyof typeof TEXT;

export function say(key: TextKey, vars?: Readonly<Record<string, string | number>>): string {
  return lt(TEXT[key], vars);
}

const ACTORS: Record<ActorKind, LocalText> = {
  villager: { tr: 'köylüler', en: 'villagers' },
  'ox-cart': { tr: 'kağnılar', en: 'ox carts' },
  donkey: { tr: 'eşekler', en: 'donkeys' },
  caravan: { tr: 'kervan', en: 'a caravan' },
  rider: { tr: 'atlılar', en: 'riders' },
  army: { tr: 'ordu', en: 'an army' },
  cannon: { tr: 'toplar', en: 'the guns' },
  carriage: { tr: 'faytonlar', en: 'carriages' },
  truck: { tr: 'kamyonlar', en: 'lorries' },
  cyclist: { tr: 'bisikletliler', en: 'cyclists' },
};

export function actorName(kind: ActorKind): string {
  return lt(ACTORS[kind]);
}

/** "1683 · bahar seli": the hazard's own name when the ledger has one. */
export function hazardCaption(year: number, hazard: HazardDef | undefined, kind: 'flood' | 'quake' | 'load'): string {
  const name = hazard?.name ? lt(hazard.name) : kind === 'flood' ? say('flood') : kind === 'quake' ? say('quake') : hazard?.kind === 'load' ? actorName(hazard.actor) : say('flood');
  return `${Math.floor(year)} · ${name}`;
}

/** A new era named by who now comes over the bridge that did not before. */
export function eraCaption(era: TrafficEra, previous: TrafficEra | null): string {
  const fresh = era.actors.filter((a) => !previous || !previous.actors.includes(a));
  const motor = era.actors.includes('truck') || era.actors.includes('carriage');
  const text = fresh.length > 0 ? actorName(fresh[0]!) : !motor && era.axle <= 5 ? say('footOnly') : actorName(era.actors[0] ?? 'villager');
  return `${Math.floor(era.from)} · ${text}`;
}

/** A small length the way the player reads lengths: centimetres or parmak. */
export function smallLength(m: number, units: 'metre' | 'arsin'): string {
  if (units === 'arsin') return `${formatNumber(m / PARMAK, 1)} ${lt({ tr: 'parmak', en: 'parmak' })}`;
  return `${formatNumber(m * 100, 1)} cm`;
}

/** The snapping unit of a handle: ten centimetres, or one parmak in arşın. */
export function lengthStep(units: 'metre' | 'arsin'): number {
  return units === 'arsin' ? PARMAK : 0.1;
}
