/**
 * The ledger, rivers 1 to 6. Each entry is the builder’s own hand on arriving; the result lines
 * are written by the next of kin. The notes on real bridges are Elif’s, in 2026, and keep to
 * docs/research/notes.md.
 */
import type { LevelStory } from '../../core/contracts';

export const koramaz: LevelStory = {
  intro: {
    heading: { tr: 'Ağırnaslı Davud Usta', en: 'Davud Usta of Ağırnas' },
    lines: [
      {
        tr: 'Köyün çocukları dereyi her sabah yalınayak geçer. Bahar gelince geçemezler.',
        en: 'The village children wade the stream barefoot every morning. When spring comes they cannot.',
      },
      {
        tr: 'Yamaçtan tüf kestim. Yumuşak taştır: kolay kesilir, kolay aşınır.',
        en: 'I cut tuff from the slope. A soft stone: easy to cut, easy to wear.',
      },
      { tr: 'Taş bekler. İnsan beklemez.', en: 'Stone waits. People do not.' },
    ],
  },
  passed: [{ tr: 'Babamı mezarlığa köprünün üstünden taşıdık.', en: 'We carried my father to the graveyard over the bridge.' }],
  failed: [{ tr: 'Köprü babamdan önce gitti. Çocuklar yine dereden geçiyor.', en: 'The bridge went before my father did. The children wade again.' }],
  realBridge: {
    tr: 'Ağırnas, Kayseri’nin doğusunda, Koramaz Vadisi’nde bir köy. Vadinin yumuşak tüfü Roma’dan Osmanlı’ya oyulmuş, yontulmuş. Mimar Sinan 1490 dolaylarında burada doğdu. Vadi 2020’de UNESCO Dünya Mirası Geçici Listesi’ne alındı. Derenin üstünde adı bilinen eski bir köprü yok.',
    en: 'Ağırnas is a village east of Kayseri, in the Koramaz valley, whose soft tuff has been carved from Roman to Ottoman times. Mimar Sinan was born here around 1490. The valley joined the UNESCO World Heritage Tentative List in 2020. No old bridge of any name stands on the stream.',
  },
  hints: {
    strike: {
      tr: 'Halka ince. Sırtını kalınlaştır, altın çizgi taşın içine girsin.',
      en: 'The ring is thin. Thicken its back until the gold line lies inside the stone.',
    },
    weathering: {
      tr: 'Tüf her yıl bir kıl payı yenir. Halkayı kalın tut ya da derzleri vaktinde doldur.',
      en: "Tuff loses a hair’s breadth every year. Keep the ring thick, or point the joints in time.",
    },
    'flood-wash': {
      tr: 'Bahar seli kemerin alnına dayandı. Tepeyi kaldır, su altından geçsin.',
      en: 'The spring flood leaned on the face of the arch. Raise the crown and let the water pass beneath.',
    },
  },
};

export const zamanti: LevelStory = {
  intro: {
    heading: { tr: 'Ağırnaslı İlyas Usta', en: 'İlyas Usta of Ağırnas' },
    lines: [
      { tr: 'Zamantı baharda üzengi taşlarına kadar çıkar.', en: 'In spring the Zamantı rises to the springers.' },
      {
        tr: 'İki kazık arasına bir zincir astım. Sarktığı eğri, ters çevrilince, kemerin eğrisidir.',
        en: 'I hung a chain between two stakes. The curve it sags into, turned over, is the curve of the arch.',
      },
      { tr: 'Taşın çokluğu değil, eğrinin doğrusu taşır.', en: 'It is not the amount of stone that carries, but the rightness of the curve.' },
    ],
  },
  passed: [
    {
      tr: 'Babam öldüğü bahar Zamantı yine taştı. Köprünün altından geçti, üstünden geçmedi.',
      en: 'The spring my father died the Zamantı flooded again. It went under the bridge, not over it.',
    },
  ],
  failed: [{ tr: 'Köprü babamdan önce yıkıldı. Zincir hâlâ duvarda asılı.', en: 'The bridge fell before my father did. The chain still hangs on the wall.' }],
  realBridge: {
    tr: 'Zamantı üstünde adı bilinen eski bir köprü yok. Defterde bu ırmak için yalnızca bu kemer var.',
    en: 'No old bridge of any name stands on the Zamantı. For this river the ledger holds only this arch.',
  },
  hints: {
    strike: {
      tr: 'Eğri yükün yolunu izlemiyor. Omuzları doldur ya da tepeyi kaldır.',
      en: 'The curve does not follow the path of the load. Fill out the haunches or raise the crown.',
    },
    'flood-wash': {
      tr: 'Basık kemer seli göğsüyle karşılar. Tepeyi kaldır; dik omuzlu kemer suya yer açar.',
      en: 'A flat arch meets the flood with its chest. Raise the crown; an arch with upright shoulders makes room for the water.',
    },
    crushing: {
      tr: 'Basık kemer taşı sıkıştırır. Tepeyi kaldır, yük omuzlara yayılsın.',
      en: 'A flat arch squeezes its stones. Raise the crown so the load spreads to the haunches.',
    },
  },
};

export const kizilirmak: LevelStory = {
  intro: {
    heading: { tr: 'Ağırnaslı Yakub Usta', en: 'Yakub Usta of Ağırnas' },
    lines: [
      {
        tr: 'Irmağın aşağısında Selçuklu ustaları Tekgöz’ü kuruyor: otuz altı arşın, tek göz.',
        en: 'Downstream the Seljuk masters are raising Tekgöz: thirty-six cubits in a single arch.',
      },
      {
        tr: 'Ben de ırmağı tek gözle geçeceğim. Geceleri kalıbın çöktüğünü düşlüyorum.',
        en: 'I will cross the river in one arch too. At night I dream that the centering gives way.',
      },
    ],
  },
  passed: [
    {
      tr: 'Babam her bahar köprüye gidip derzleri eliyle yoklardı. Öldüğü yıl da gitti.',
      en: 'Every spring my father went to the bridge and felt the joints with his hand. He went in the year he died, too.',
    },
  ],
  failed: [{ tr: 'Büyük göz babamdan önce düştü. Bir daha büyük göz kurmadı.', en: 'The great arch fell before my father did. He never built a great one again.' }],
  realBridge: {
    tr: 'Tekgöz Köprüsü, Kayseri’nin kuzeybatısında, Kızılırmak üstünde. 1202-1203’te Selçuklu sultanı II. Süleyman adına Kayserili Hacı Alişir yaptırdı. Tek sivri kemerinin açıklığı 27 metre, köprünün boyu 120 metreye yakın. Evliya Çelebi onu yanlışlıkla Kanuni’ye yazar.',
    en: 'Tekgöz Bridge crosses the Kızılırmak north-west of Kayseri. Hacı Alişir of Kayseri had it built in 1202-1203 for the Seljuk sultan Süleyman II. Its single pointed arch spans 27 metres; the bridge is close to 120 metres long. Evliya Çelebi wrongly credits it to Süleyman the Magnificent.',
  },
  hints: {
    strike: {
      tr: 'Büyük göz küçük gözün büyütülmüşü değildir. Halkayı kalınlaştır; sivrilttiysen tepesine dolgu ver.',
      en: 'A great arch is not a small one made larger. Thicken the ring, and if you point it, load its crown with fill.',
    },
    weathering: {
      tr: 'Büyük gözün derzi uzun yıllar ister. Halkaya pay bırak ya da vaktinde onar.',
      en: 'The joints of a great arch must last a long time. Leave the ring spare thickness, or repair in time.',
    },
    crushing: {
      tr: 'Bu kadar büyük gözde taş mafsalda ezilir. Halkayı kalınlaştır, tepeyi kaldır.',
      en: 'In an arch this large the stone crushes at the hinges. Thicken the ring and raise the crown.',
    },
    'flood-wash': {
      tr: 'Kızıl sel kemerin göğsüne çıktı. Tepeyi kaldır, kemere dolgu ver.',
      en: 'The red flood climbed to the chest of the arch. Raise the crown and give it more fill.',
    },
  },
};

export const yesilirmak: LevelStory = {
  intro: {
    heading: { tr: 'Ağırnaslı Süleyman Usta', en: 'Süleyman Usta of Ağırnas' },
    lines: [
      {
        tr: 'Tokat’ta bu yıl Hıdırlık Köprüsü bitti: beş göz, ayakları ırmağın içinde.',
        en: 'At Tokat they finished the Hıdırlık bridge this year: five arches, their piers in the river.',
      },
      {
        tr: 'Ayağı suya ilk indiren benim. Sel çakılı kaşıkla oyar gibi oyar.',
        en: 'I am the first of us to set piers in the water. A flood scoops out gravel like a spoon.',
      },
    ],
  },
  passed: [{ tr: 'Babamın ayakları hâlâ suda duruyor.', en: "My father’s piers still stand in the water." }],
  failed: [
    {
      tr: 'Köprü babamdan önce gitti. Su çekilince ayakların yeri hâlâ görünür.',
      en: 'The bridge went before my father did. When the water is low you can still see where the piers stood.',
    },
  ],
  realBridge: {
    tr: 'Hıdırlık Köprüsü, Tokat’ta Yeşilırmak üstünde, 1250’de Selçuklu döneminde yapıldı. Kitabesiyle günümüze ulaşan tek Selçuklu köprüsüdür. Beş sivri kemeri vardır; yakın yıllarda Tokat’ın iki yeni köprüsünü yıkan sellerde ayakta kaldı. 2013’ten beri yalnız yayalar geçer.',
    en: 'Hıdırlık Bridge crosses the Yeşilırmak at Tokat and was built in 1250, in Seljuk times. It is the only Seljuk bridge that has kept its inscription. It has five pointed arches, and it stood through recent floods that brought down two modern bridges in Tokat. Since 2013 only people on foot cross it.',
  },
  hints: {
    'flood-scour': {
      tr: 'Ayaklar çakıla oturdu, sel dibini oydu. Ayakları kıyıdaki kayaya yaklaştır, ırmağın ortasında az ayak bırak.',
      en: 'The piers sat on gravel and the flood dug beneath them. Move them towards the rock by the banks, and leave few in mid-river.',
    },
    settlement: {
      tr: 'Oyulan ayak oturdu, kemerler açıldı. Ayakları kayaya taşı, ortadaki gözü genişlet.',
      en: 'An undermined pier sank and the arches opened. Move the piers onto rock and widen the middle span.',
    },
    strike: {
      tr: 'Ayak, iki yanındaki kemerin itişini taşıyamadı. Ayağı kalınlaştır ya da gözleri eşitle.',
      en: 'A pier could not carry the push of the arches on either side. Thicken it, or make the spans equal.',
    },
  },
};

export const dicle: LevelStory = {
  intro: {
    heading: { tr: 'Ağırnaslı Yusuf Usta', en: 'Yusuf Usta of Ağırnas' },
    lines: [
      { tr: 'Burada taş kara, demir gibi ağır.', en: 'Here the stone is black, and heavy as iron.' },
      {
        tr: 'On Gözlü iki yüz yıldır ırmakta duruyor. Kitabesinde ustasının adı yazılı: Yusuf. Benim adım.',
        en: 'On Gözlü has stood in the river for two hundred years. Its inscription names its master: Yusuf. My name.',
      },
      {
        tr: 'Sel dağdan ağaç indirir. Ağaç ayağa takılır, su kabarır, dibi oyar.',
        en: 'The flood brings trees down from the mountains. A tree catches on a pier, the water heaps up and digs.',
      },
    ],
  },
  passed: [{ tr: 'On Gözlü’nün yanında babamın köprüsü küçük görünüyor. İkisi de ayakta.', en: "Beside On Gözlü my father’s bridge looks small. Both are standing." }],
  failed: [
    {
      tr: 'Kara taşlar Dicle’nin dibinde yatıyor. Babam On Gözlü’ye bir daha bakmadı.',
      en: 'The black stones lie on the bed of the Tigris. My father never looked at On Gözlü again.',
    },
  ],
  realBridge: {
    tr: 'On Gözlü (Dicle) Köprüsü, Diyarbakır’ın güneyinde, Mardin Kapı’nın dışında. Mervaniler döneminde 1065’te tamamlandı; kitabesinde ustası Sancar oğlu Ubeyd oğlu Yusuf diye geçer. On kemeri vardır, boyu 178 metre, en geniş açıklığı 14,7 metredir. Kara volkanik taştan yapılmıştır. 2009’da motorlu taşıtlara kapandı.',
    en: 'On Gözlü (Dicle) Bridge stands south of Diyarbakır, outside the Mardin Gate. It was completed in 1065 under the Marwanids, and its inscription names its master as Yusuf son of Ubeyd son of Sancar. It has ten arches, is 178 metres long, and its widest span is 14.7 metres. It is built of black volcanic stone. Motor traffic left it in 2009.',
  },
  hints: {
    'flood-scour': {
      tr: 'Ağaç ayağa takıldı, su dibini oydu. Ayaklara selyaran ver, temeli derine indir.',
      en: 'Trees caught on the piers and the water dug beneath them. Give the piers cutwaters and take the foundations deeper.',
    },
    strike: {
      tr: 'Bir ayak kumu ezdi. Ortadaki kumun üstüne ayak koyma ya da ayağı genişlet.',
      en: 'A pier pressed down into the sand. Keep piers off the sand in mid-river, or make them wider.',
    },
    settlement: {
      tr: 'Oyulan ayak oturdu, kemerler açıldı. Temeli derine indir, burnu sivri olsun.',
      en: 'An undermined pier sank and the arches opened. Take the foundation deeper and give the pier a pointed nose.',
    },
  },
};

export const batman: LevelStory = {
  intro: {
    heading: { tr: 'Ağırnaslı İshak Usta', en: 'İshak Usta of Ağırnas' },
    lines: [
      { tr: 'Malabadi’nin tek gözü buradan görünür.', en: "Malabadi’s single arch can be seen from here." },
      {
        tr: 'İlk ayağını sel götürmüş. Ustasını cezalandırmışlar; ondan sonra gelen, koca kütüklerle yeniden başlamış.',
        en: 'A flood took its first footing. They fined the master; the one who came after began again with great timbers.',
      },
      { tr: 'Üzengiyi selin uzanamayacağı yere koyacağım.', en: 'I will set the springers where the flood cannot reach.' },
    ],
  },
  passed: [{ tr: 'Babamın kemeri Malabadi’nin gölgesinde değil, yanında duruyor.', en: "My father’s arch does not stand in Malabadi’s shadow. It stands beside it." }],
  failed: [
    {
      tr: 'Kemer babamdan önce düştü. Taşlarını aşağıda, ırmağın döndüğü yerde bulduk.',
      en: 'The arch fell before my father did. We found its stones downstream, where the river bends.',
    },
  ],
  realBridge: {
    tr: 'Malabadi Köprüsü, Silvan yakınında, Batman Çayı üstünde. Artuklu Timurtaş zamanında 1146-1147’de başlandı, 1154 dolaylarında bitti. Yapımı sırasında sel doğu ayağını yıktı; usta cezalandırıldı, iş büyük kütüklerle yeniden kuruldu. Sivri ana kemerinin açıklığı 38,6 metre olarak verilir, kimi kaynaklarda 40 metreye yakındır. 1950’lere dek kullanıldı.',
    en: 'Malabadi Bridge crosses the Batman River near Silvan. It was begun in 1146-1147 under the Artuqid Timurtaş and finished around 1154. During the work a flood destroyed its eastern footing; the master was fined and the work was begun again on great timbers. Its pointed main arch is given as 38.6 metres, close to 40 in some sources. It was in use until the 1950s.',
  },
  hints: {
    'flood-wash': {
      tr: 'Sel kemeri boğdu. Üzengiyi yükselt, omuzlara boşaltma gözü aç.',
      en: 'The flood drowned the arch. Set the springers higher and open relief holes in the spandrels.',
    },
    strike: {
      tr: 'Bu kadar büyük göz kendi ağırlığını zor taşır. Halkayı kalınlaştır, omuzları boşaltma gözleriyle hafiflet.',
      en: 'An arch this large hardly carries its own weight. Thicken the ring and lighten the spandrels with relief holes.',
    },
    crushing: {
      tr: 'Taş mafsallarda ezildi. Kemeri yükselt, halkayı kalınlaştır, omuzları hafiflet.',
      en: 'The stone crushed at the hinges. Raise the arch, thicken the ring, lighten the spandrels.',
    },
  },
};
