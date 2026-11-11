/**
 * The last pages: the epilogue in Elif’s hand (2026), and the short cards of the two endless
 * modes, which the ledger keeps apart from the family’s rivers.
 */
import type { LevelStory, StoryCard } from '../../core/contracts';

/** The ledger’s last old entry; the legend of Sinan is told as the ledger tells it, "they say". */
export const LAST_OLD_ENTRY: StoryCard = {
  heading: { tr: 'Defterin son eski sayfası', en: 'The last old page of the ledger' },
  lines: [
    {
      tr: 'Uzun köprüden kırk yedi yıl sonra köyde bir oğlan doğdu. Keski tutmayı bizim ocakta öğrendiğini söylerler. Adı Sinan’dı.',
      en: 'Forty-seven years after the long bridge a boy was born in the village. They say he learned to hold a chisel in our yard. His name was Sinan.',
    },
  ],
};

export const epilogue: LevelStory = {
  intro: {
    heading: { tr: 'Elif Taşçı, 2026', en: 'Elif Taşçı, 2026' },
    lines: [
      LAST_OLD_ENTRY.lines[0]!,
      {
        tr: 'Defterin son eli benim. Soyadını 1934’te büyük dedem seçmiş; sorduklarında tek bir söz söylemiş: Taşçı.',
        en: 'I am the last hand in the ledger. My great-grandfather chose our surname in 1934; when they asked him, he said one word: Taşçı.',
      },
      {
        tr: 'Bu sabah atalarımdan birinin kemerinin üstündeyim. Yosunun altında işaretimizi arıyorum. Az onaracağım; gerisini taş biliyor.',
        en: 'This morning I stand on an arch one of my forebears built, looking under the moss for our mark. I will mend as little as I can; the stone knows the rest.',
      },
    ],
  },
  passed: [
    {
      tr: 'Derzleri doldurdum, taşı yerinde bıraktım. Çocuklar bisikletle geçiyor.',
      en: 'I pointed the joints and left the stone where it was. Children are cycling across.',
    },
  ],
  failed: [{ tr: 'Bu kemeri kurtaramadım. Defteri kapatmadım.', en: 'I could not save this arch. I have not closed the ledger.' }],
  realBridge: {
    tr: 'Anadolu’da yüzlerce taş köprü hâlâ ayakta; çoğunun ustasının adı bilinmiyor. Onarımda ilke, gerekenden fazlasına dokunmamaktır.',
    en: "Hundreds of stone bridges still stand in Anatolia, most of them by masters whose names are lost. In restoration the rule is to touch nothing more than the work needs.",
  },
  hints: {
    weathering: {
      tr: 'Derzler boşalmış. Yalnız açık derzleri doldur; sağlam taşa dokunma.',
      en: 'The joints have emptied. Point only the open ones; leave sound stone alone.',
    },
  },
};

export const daily: LevelStory = {
  intro: {
    heading: { tr: 'Günün Nehri', en: 'River of the Day' },
    lines: [
      { tr: 'Defterde adı olmayan bir ırmak.', en: 'A river with no name in the ledger.' },
      { tr: 'Bugün herkes aynı suya bakıyor.', en: 'Today everyone is looking at the same water.' },
    ],
  },
  passed: [{ tr: 'Kurucusundan uzun yaşadı.', en: 'It outlived its builder.' }],
  failed: [{ tr: 'Kurucusundan önce gitti.', en: 'It went before its builder did.' }],
  realBridge: {
    tr: 'Bu ırmak her gün yeniden çizilir; bütün oyuncular için aynıdır.',
    en: 'This river is drawn anew each day, the same for every player.',
  },
  hints: {},
};

export const millennium: LevelStory = {
  intro: {
    heading: { tr: 'Bin Yıl', en: 'A Thousand Years' },
    lines: [
      { tr: '1026. Kırk beş metre su, bir yanı kil.', en: '1026. Forty-five metres of water, one bank of clay.' },
      { tr: 'Her iki yüzyılda bir sel, bir deprem, bir ağır yük; her seferinde daha büyüğü.', en: 'Every second century a flood, an earthquake and a heavy load, each larger than the last.' },
      { tr: 'En az taşla bin yıl.', en: 'A thousand years, with the fewest stones.' },
    ],
  },
  passed: [{ tr: 'Kurucusundan uzun yaşadı.', en: 'It outlived its builder.' }],
  failed: [{ tr: 'Bin yılı dolduramadı.', en: 'It did not see out the thousand years.' }],
  realBridge: {
    tr: 'Anadolu’da bin yılı aşmış taş köprüler var. Adıyaman’daki Cendere Köprüsü 200 dolaylarında, Roma zamanında kuruldu.',
    en: 'Some stone bridges in Anatolia are more than a thousand years old. Cendere Bridge, near Adıyaman, was built around the year 200, in Roman times.',
  },
  hints: {},
};
