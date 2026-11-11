/**
 * The words on a fallen bridge: the epitaph ("1683 bahar selinde yıkıldı."), the plain account of
 * what happened, and the family’s default advice for each cause. Turkish is written first; the
 * English follows it as closely as English allows.
 */
import type { CauseId, CollapseInfo, HazardDef, LocalText } from '../core/types';
import { seasonOf, type Season } from './kit';

export const CAUSES: readonly CauseId[] = ['strike', 'weathering', 'flood-scour', 'flood-wash', 'quake', 'load', 'settlement', 'crushing'];

/* -- Turkish case endings for years ----------------------------------------------------------- */

/** The last spoken word of a year, read aloud in Turkish (1683: "üç", 1940: "kırk", 2000: "bin"). */
function lastWord(n: number): string {
  const units = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
  const tens = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
  const abs = Math.abs(Math.trunc(n));
  if (abs === 0) return 'sıfır';
  if (abs % 10 !== 0) return units[abs % 10]!;
  if (abs % 100 !== 0) return tens[(abs % 100) / 10]!;
  if (abs % 1000 !== 0) return 'yüz';
  return 'bin';
}

const BACK = 'aıou';
const VOWELS = 'aeıioöuü';
const HARD = 'çfhkpsşt';

/** The locative ending of a year as written after an apostrophe: 1147'de, 1683'te, 1930'da. */
export function trLocative(year: number): string {
  const word = lastWord(year);
  let vowel = 'e';
  for (let i = word.length - 1; i >= 0; i--) {
    const c = word[i]!;
    if (VOWELS.includes(c)) {
      vowel = BACK.includes(c) ? 'a' : 'e';
      break;
    }
  }
  const last = word[word.length - 1]!;
  return `${HARD.includes(last) ? 't' : 'd'}${vowel}`;
}

/* -- epitaph ---------------------------------------------------------------------------------- */

const SEASON: Record<Season, { tr: string; trIn: string; en: string }> = {
  winter: { tr: 'kış', trIn: 'kışında', en: 'winter' },
  spring: { tr: 'bahar', trIn: 'baharında', en: 'spring' },
  summer: { tr: 'yaz', trIn: 'yazında', en: 'summer' },
  autumn: { tr: 'güz', trIn: 'güzünde', en: 'autumn' },
};

interface When {
  readonly tr: string;
  readonly en: string;
}

function yearOnly(year: number): When {
  return { tr: `${year}’${trLocative(year)}`, en: `in ${year}` };
}

function whenOf(info: CollapseInfo): When {
  const year = info.year;
  const hazard: HazardDef | undefined = info.hazard;
  const season = seasonOf(hazard);
  const s = season ? SEASON[season] : null;
  const floody = info.cause === 'flood-scour' || info.cause === 'flood-wash';
  if (hazard?.kind === 'flood' || (!hazard && floody)) {
    return s ? { tr: `${year} ${s.tr} selinde`, en: `in the ${s.en} flood of ${year}` } : { tr: `${year} selinde`, en: `in the flood of ${year}` };
  }
  if (hazard?.kind === 'quake') {
    return s ? { tr: `${year} ${s.tr} depreminde`, en: `in the ${s.en} earthquake of ${year}` } : { tr: `${year} depreminde`, en: `in the earthquake of ${year}` };
  }
  if (hazard?.kind === 'load' && s) return { tr: `${year} ${s.trIn}`, en: `in the ${s.en} of ${year}` };
  return yearOnly(year);
}

/** What gave way, as a clause after the time: Turkish ends in a converb, English is appended. */
function howOf(info: CollapseInfo): When | null {
  const hazard = info.hazard;
  switch (info.cause) {
    case 'strike':
      return { tr: 'kalıp sökülünce', en: ' when the centering was struck' };
    case 'weathering':
      return { tr: 'derzleri boşalınca', en: ', its joints worn away' };
    case 'flood-scour':
      return { tr: 'ayağı oyulunca', en: ', its pier undermined' };
    case 'flood-wash':
      return hazard && hazard.kind !== 'flood' ? { tr: 'sele kapılıp', en: ', swept away by the water' } : null;
    case 'quake':
      return hazard?.kind === 'quake' ? null : { tr: 'yer sarsılınca', en: ' when the ground shook' };
    case 'load':
      if (hazard?.kind === 'load') {
        const name = hazard.name ?? { tr: 'ağır bir yük', en: 'a heavy load' };
        return { tr: `${name.tr} geçerken`, en: ` as the ${name.en} crossed` };
      }
      return { tr: 'yükün altında', en: ' under its load' };
    case 'settlement':
      return { tr: 'zemin kayınca', en: ' when the ground gave way' };
    case 'crushing':
      return { tr: 'taşları ezilince', en: ', its stones crushed' };
  }
}

export function epitaph(info: CollapseInfo): LocalText {
  const when = whenOf(info);
  const how = howOf(info);
  return {
    tr: how ? `${when.tr}, ${how.tr} yıkıldı.` : `${when.tr} yıkıldı.`,
    en: `Fell ${when.en}${how ? how.en : ''}.`,
  };
}

/* -- explain ---------------------------------------------------------------------------------- */

function hingeCount(info: CollapseInfo): number {
  let most = 0;
  for (const s of info.spans) most = Math.max(most, s.hinges.length);
  return most;
}

const TR_COUNT = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı'];
const EN_COUNT = ['', 'one', 'two', 'three', 'four', 'five', 'six'];

function fallen(info: CollapseInfo): LocalText {
  const spans = info.spans.length;
  if (spans <= 1) return { tr: '', en: '' };
  return { tr: ` ${spans} kemer ardı ardına gitti.`, en: ` ${spans} arches went one after another.` };
}

export function explain(info: CollapseInfo): LocalText {
  const n = Math.min(6, hingeCount(info));
  const tail = fallen(info);
  const hazard = info.hazard;
  switch (info.cause) {
    case 'strike': {
      if (info.piers.length > 0) {
        // A pier went with the spans: either it failed first or it was pulled down; both read true.
        return {
          tr: `Kalıp alınınca bütün yük ayaklara bindi. Ayaklardan biri bu yükü taşıyamadı; kemerler onunla gitti.${tail.tr}`,
          en: `With the centering gone the whole weight came onto the piers. One of them could not carry it, and the arches went with it.${tail.en}`,
        };
      }
      const tr = n >= 3 ? `derzler ${TR_COUNT[n]} yerden açıldı` : 'derzler açıldı';
      const en = n >= 3 ? `the joints opened in ${EN_COUNT[n]} places` : 'the joints opened';
      return {
        tr: `Kalıp alınınca kemer kendi ağırlığıyla baş başa kaldı. Yükün çizgisi taşın dışına çıktı, ${tr} ve kemer bu mafsallar üzerinde katlanıp düştü.${tail.tr}`,
        en: `With the centering gone the arch had only its own weight. The line of thrust left the stone, ${en}, and the arch folded about them.${tail.en}`,
      };
    }
    case 'weathering':
      return {
        tr: `Don, yağmur ve kökler yıllar içinde derzlerdeki harcı yedi; taşların birbirine dayandığı yüzler inceldi. Sonunda yükün çizgisi kalan taşın içine sığmadı.${tail.tr}`,
        en: `Frost, rain and roots ate the mortar out of the joints over the years, and the faces where the stones bear on each other grew thin. At last the line of thrust no longer fitted inside what was left.${tail.en}`,
      };
    case 'flood-scour':
      return {
        tr: `Sel ayağın dibindeki zemini oydu. Ayak oturdu, iki yanındaki kemerler dayanağını yitirdi.${tail.tr}`,
        en: `The flood dug the ground from under a pier. The pier sank, and the arches on either side lost their support.${tail.en}`,
      };
    case 'flood-wash':
      return {
        tr: `Sel kemeri boğdu: su altındaki taş hafifler, akıntı da kemerin alnına yüklenir. Taşın ağırlığı ve harcın tutuşu bu itişe yetmedi.${tail.tr}`,
        en: `The flood drowned the arch: stone under water weighs less, and the current leans on its face. The weight of the stone and the grip of the mortar were not enough.${tail.en}`,
      };
    case 'quake': {
      const pga = hazard?.kind === 'quake' ? hazard.pga : null;
      const tr = pga === null ? 'Yer yana doğru sarsıldı' : `Yer ${pga.toFixed(2).replace('.', ',')} g ile yana sarsıldı`;
      const en = pga === null ? 'The ground lurched sideways' : `The ground lurched sideways at ${pga.toFixed(2)} g`;
      return {
        tr: `${tr}; kemerin kendi ağırlığı onu dengesinden çıkaracak kadar yana itildi. Derzler açıldı ve kemer katlandı.${tail.tr}`,
        en: `${en}, and the arch’s own weight was thrown sideways with it. The joints opened and the arch folded.${tail.en}`,
      };
    }
    case 'load': {
      if (hazard?.kind === 'load') {
        return {
          tr: `${Math.round(hazard.axle)} kN’luk bir dingil kemerin en zayıf yerine bastı. Halka dört mafsalla açıldı ve çöktü.${tail.tr}`,
          en: `An axle of ${Math.round(hazard.axle)} kN pressed on the weakest point of the arch. The ring opened at four hinges and gave way.${tail.en}`,
        };
      }
      return {
        tr: `Yıpranmış kemer, üstünden geçen yükü artık taşıyamadı. Halka dört mafsalla açıldı ve çöktü.${tail.tr}`,
        en: `The worn arch could no longer carry the traffic over it. The ring opened at four hinges and gave way.${tail.en}`,
      };
    }
    case 'settlement':
      return {
        tr: `Dayanaklar yumuşak zeminde yavaş yavaş açıldı ya da oturdu. Açıklık büyüdükçe kemer çatladı ve sonunda kendini taşıyamadı.${tail.tr}`,
        en: `On soft ground the supports slowly spread or sank. As the opening grew the arch cracked, and at last it could not carry itself.${tail.en}`,
      };
    case 'crushing':
      return {
        tr: `Kemerdeki basınç taşın dayanımını aştı. Derzlerin kenarları ezildi ve kemer kendi ağırlığı altında çöktü.${tail.tr}`,
        en: `The pressure in the ring was more than the stone could bear. The edges of the joints crushed, and the arch gave way under its own weight.${tail.en}`,
      };
  }
}

/* -- the family’s advice, when a river has nothing more particular to say ---------------------- */

export const FAMILY_HINTS: Readonly<Record<CauseId, LocalText>> = {
  strike: {
    tr: 'Halkayı kalınlaştır ya da eğriyi düzelt; altın çizgi taşın içinde kalsın.',
    en: 'Thicken the ring or mend the curve until the gold line stays inside the stone.',
  },
  weathering: {
    tr: 'Halkaya pay bırak; şakül titremeye başlayınca derzleri doldur.',
    en: 'Leave the ring some spare thickness, and point the joints when the plumb bob begins to tremble.',
  },
  'flood-scour': {
    tr: 'Temeli derine indir, ayaklara selyaran ver; ırmağın ortasına az ayak koy.',
    en: 'Take the foundations deeper, give the piers cutwaters, and set few of them in mid-river.',
  },
  'flood-wash': {
    tr: 'Kemeri selin uzanamayacağı yere kaldır.',
    en: "Lift the arch out of the flood’s reach.",
  },
  quake: {
    tr: 'Halkayı kalınlaştır, taşları kenetle.',
    en: 'Thicken the ring and clamp the stones.',
  },
  load: {
    tr: 'Yük en çok açıklığın dörtte birine basar. Halkayı kalınlaştır, üstüne dolgu ver.',
    en: 'A load bears hardest at a quarter of the span. Thicken the ring and give it more fill above.',
  },
  settlement: {
    tr: 'Yumuşak zeminde kemerin itişini azalt: kemeri yükselt, dayanakların altına kazık çak.',
    en: 'On soft ground lessen the push of the arch: raise it, and drive piles under the supports.',
  },
  crushing: {
    tr: 'Taş ezildi. Kemeri bu kadar basık kurma, halkayı kalınlaştır.',
    en: 'The stone crushed. Do not build the arch so flat; thicken the ring.',
  },
};
