/**
 * The ledger, rivers 7 to 12. From Meryem on (river 9) the entries are longer: she ran the yard
 * and kept the book while the men were away, and the habit stayed.
 */
import type { LevelStory } from '../../core/contracts';

export const aras: LevelStory = {
  intro: {
    heading: { tr: 'Ağırnaslı Musa Usta', en: 'Musa Usta of Ağırnas' },
    lines: [
      { tr: 'Emir Çoban’ın köprüsü bu yıl bitti; Aras’ı ondan geçiyorlar.', en: "Emir Çoban’s bridge was finished this year; they cross the Aras by it now." },
      {
        tr: 'Burada toprak da yerinde durmaz. Yaşlılar evlerin sallandığı geceleri sayar.',
        en: 'Here even the ground does not keep still. The old people count the nights the houses shook.',
      },
      { tr: 'Taşları birbirine demirle bağlıyor, kurşunla mühürlüyorum.', en: 'I tie the stones to one another with iron and seal the iron with lead.' },
    ],
  },
  passed: [
    {
      tr: 'Bu kış ırmak dondu, kızaklar köprünün altından geçti. Babam göremedi.',
      en: 'This winter the river froze and sledges passed under the bridge. My father did not live to see it.',
    },
  ],
  failed: [
    {
      tr: 'Köprü babamdan önce gitti. Kenetleri ırmaktan çıkarıp yeniden döktük.',
      en: 'The bridge went before my father did. We pulled the clamps out of the river and cast them again.',
    },
  ],
  realBridge: {
    tr: 'Çobandede Köprüsü, Köprüköy’ün doğusunda, Aras üstünde. İlhanlı Gazan Han zamanında Emir Çoban’a mal edilir, 1297-1298’e tarihlenir. Kara, kızıl ve gri kesme taştandır. 1727, 1872 ve 1946-1948’de onarıldı. Bugün yol 500 metre ötedeki yeni köprüden geçer.',
    en: 'Çobandede Bridge crosses the Aras east of Köprüköy. It is credited to Emir Çoban under the Ilkhanid Gazan Khan and dated 1297-1298. It is built of black, red and grey cut stone, and was repaired in 1727, 1872 and 1946-1948. Today the road crosses on a new bridge 500 metres away.',
  },
  hints: {
    quake: {
      tr: 'Yer sarsıldı, derzler açıldı. Taşları kenetle; ayakları kalın, gözleri kısa tut.',
      en: 'The ground shook and the joints opened. Clamp the stones; keep the piers thick and the spans short.',
    },
    weathering: {
      tr: 'Don, derzdeki suyu buza çevirip taşı içinden çatlatır. Halkaya pay bırak ya da vaktinde onar.',
      en: 'Frost turns the water in the joints to ice and splits the stone from inside. Leave the ring spare thickness, or repair in time.',
    },
    'flood-wash': {
      tr: 'Kar suyu kemerlere çıktı. Üzengiyi yükselt, gözleri yüksek tut.',
      en: 'The snowmelt reached the arches. Raise the springers and keep the arches high.',
    },
  },
};

export const arpacay: LevelStory = {
  intro: {
    heading: { tr: 'Ağırnaslı Harun Usta', en: 'Harun Usta of Ağırnas' },
    lines: [
      {
        tr: 'Altı yıl önce yer sarsıldı, büyük kilisenin kubbesi çöktü. Ani boşalıyor.',
        en: 'Six years ago the ground shook and the dome of the great church fell. Ani is emptying.',
      },
      { tr: 'Kervanlar yine de geliyor. Develer yüklü, kanyon derin.', en: 'The caravans still come. The camels are laden, the canyon is deep.' },
      { tr: 'Taş yine tüf. Ama burada kış uzun.', en: 'The stone is tuff again. But here the winter is long.' },
    ],
  },
  passed: [{ tr: 'Kervanlar babamın kemerinden geçiyor. Kimse adını sormuyor.', en: "The caravans cross my father’s arch. No one asks his name." }],
  failed: [
    {
      tr: 'Kemer babamdan önce kanyona düştü. Kervanlar yine yukarıdan, uzun yoldan dolaşıyor.',
      en: 'The arch fell into the canyon before my father died. The caravans take the long way round again, above.',
    },
  ],
  realBridge: {
    tr: 'Ani’nin İpek Yolu köprüsü Arpaçay’ı tek kemerle, yaklaşık 31 metrelik bir açıklıkla geçerdi. Tarihi tartışmalı; bir kitabe, yaklaşım yolunda 14. yüzyıl başında iş yapıldığını gösterir. Bakanlık açıklamasına göre kemer 16 Ekim 1807’de çöktü; bugün yalnızca yüksek ayakları duruyor. Türkiye ile Ermenistan, köprüyü yeniden kurmak için 2026’da anlaştı.',
    en: "Ani’s Silk Road bridge crossed the Arpaçay in a single arch of about 31 metres. Its date is disputed; an inscription records work on its approach in the early fourteenth century. According to the Turkish ministry the arch fell on 16 October 1807, and only its tall abutments remain. In 2026 Türkiye and Armenia agreed to rebuild it.",
  },
  hints: {
    load: {
      tr: 'Yüklü kervan kemerin dörtte birine bastı. Halkayı kalınlaştır, üstüne dolgu ver, taşları kenetle.',
      en: 'The laden caravan bore down at a quarter of the span. Thicken the ring, give it more fill, and clamp the stones.',
    },
    weathering: {
      tr: 'Tüf bu soğukta iki kat çabuk aşınır. Halkayı kalın tut, onarımı geciktirme.',
      en: 'In this cold, tuff wears twice as fast. Keep the ring thick and do not put off repairs.',
    },
    quake: {
      tr: 'Yer sarsıldı, yumuşak taş dayanamadı. Taşları kenetle, halkayı kalınlaştır.',
      en: 'The ground shook and the soft stone could not hold. Clamp the stones and thicken the ring.',
    },
    crushing: {
      tr: 'Tüf ezildi. Kemeri yükselt, halkayı kalınlaştır, omuzları boşaltma gözleriyle hafiflet.',
      en: 'The tuff crushed. Raise the arch, thicken the ring, and lighten the spandrels with relief holes.',
    },
  },
};

export const firtina: LevelStory = {
  intro: {
    heading: { tr: 'Ağırnaslı Meryem Usta', en: 'Meryem Usta of Ağırnas' },
    lines: [
      { tr: 'Erkekler uzak bir işte. Ocağı ben çeviriyorum, defteri ben tutuyorum.', en: 'The men are away on a distant job. I run the yard, and I keep the ledger.' },
      {
        tr: 'Burada yağmur dinmez. Dere bir saatte kabarır, bir saatte iner; ardında ağaç ve taş bırakır.',
        en: 'Here the rain never stops. The stream rises in an hour and falls in an hour, and leaves trees and boulders behind.',
      },
      {
        tr: 'Harç kurumadan taşın üstünde yosun bitiyor. Kemeri yüksek ve ince kuracağım; granit kaldırır.',
        en: 'Moss grows on a stone before the mortar is dry. I will build the arch high and thin; granite will bear it.',
      },
    ],
  },
  passed: [
    {
      tr: 'Annemin kemerini yosun sardı, yeşil bir kuşak gibi. Her güz sel altından geçer, üstüne çıkamaz.',
      en: "Moss has wrapped my mother’s arch like a green sash. Every autumn the flood passes under it and cannot climb it.",
    },
  ],
  failed: [{ tr: 'Kemer annemden önce gitti. Defterin o sayfasına başka bir şey yazmadı.', en: 'The arch went before my mother did. She wrote nothing more on that page.' }],
  realBridge: {
    tr: 'Fırtına Deresi boyunca yirmiden fazla eski taş köprü ayakta. Kemerleri yüksektir, çünkü dere sık taşar. En bilineni Şenyuva (Cin Civa) Köprüsü: tek kemer, dereden yaklaşık 20 metre yukarıda. 1696 (ya da 1699) tarihli kitabesini 1946 seli götürdü.',
    en: 'More than twenty old stone bridges still stand along the Fırtına. Their arches are high because the stream floods often. The best known is Şenyuva (Cin Civa) Bridge: a single arch about 20 metres above the water. The 1946 flood carried away its inscription, dated 1696 or 1699.',
  },
  hints: {
    'flood-wash': {
      tr: 'Dere bir saatte kemerin üstüne çıktı. Üzengiyi yükselt, kemeri ince ve yüksek kur; granit kaldırır.',
      en: 'In an hour the stream was over the arch. Raise the springers and build the arch thin and high; granite will bear it.',
    },
    weathering: {
      tr: 'Yosun ve kök derzi açar. Şakül titreyince temizle, doldur.',
      en: 'Moss and roots open the joints. When the plumb bob trembles, clear them and point them.',
    },
    strike: {
      tr: 'Yüksek kemer ince olabilir, ama bu kadar değil. Halkayı biraz kalınlaştır.',
      en: 'A high arch may be thin, but not this thin. Thicken the ring a little.',
    },
  },
};

export const sakarya: LevelStory = {
  intro: {
    heading: { tr: 'Ağırnaslı İbrahim Usta', en: 'İbrahim Usta of Ağırnas' },
    lines: [
      {
        tr: 'Sakarya’nın kıyıları kil. Kemer iter, kıyı yavaş yavaş geri çekilir; yıllar sonra derzler açılır.',
        en: 'The banks of the Sakarya are clay. The arch pushes, the bank slowly gives way, and years later the joints open.',
      },
      {
        tr: 'Yakında eski Rum köprüsü duruyor. Irmak onu bırakıp gitmiş, derler; altından küçük bir dere akıyor.',
        en: 'Nearby stands the old Roman bridge. The river left it, they say; a small stream runs under it now.',
      },
      { tr: 'Ayakların altına meşe kazık çakıyorum.', en: 'I drive oak piles under the piers.' },
    ],
  },
  passed: [{ tr: 'Kıyılar babamın kemerlerini çekiştirdi durdu. Kemerler bırakmadı.', en: "The banks kept pulling at my father’s arches. The arches held on." }],
  failed: [{ tr: 'Köprü babamdan önce yıkıldı. Kazıklar çamurda kaldı.', en: 'The bridge fell before my father did. The piles stayed in the mud.' }],
  realBridge: {
    tr: 'Justinianus (Beşköprü) Köprüsü, Serdivan’da. 562’de İmparator Justinianus zamanında tamamlandı; kireçtaşından, Horasan harcıyla örülmüştür. Boyu genellikle 429 metre verilir. Bugün altından küçük Çark Deresi akar, Sakarya üç kilometre doğudadır. Uzun bir onarımdan sonra yeniden ziyarete açıldı.',
    en: "Justinian’s Bridge (Beşköprü) stands at Serdivan. It was completed in 562 under the emperor Justinian, of limestone laid in Horasan mortar, and is usually given as 429 metres long. Today only the small Çark stream runs under it; the Sakarya flows three kilometres to the east. After a long restoration it is open to visitors again.",
  },
  hints: {
    settlement: {
      tr: 'Kil kıyılar kemeri çekip açtı. Kemeri yükselt ki daha az itsin, dayanakların altına kazık çak.',
      en: 'The clay banks drew the arch apart. Raise it so it pushes less, and drive piles under the supports.',
    },
    'flood-scour': {
      tr: 'Kum çakıldan çabuk oyulur. Ayağa kazık çak, temeli derine indir.',
      en: 'Sand scours faster than gravel. Put the piers on piles and take the foundations deeper.',
    },
    strike: {
      tr: 'Bir ayak yumuşak zemine gömüldü. Ayağı genişlet ya da altına kazık çak.',
      en: 'A pier sank into the soft ground. Widen it, or drive piles beneath it.',
    },
  },
};

export const tunca: LevelStory = {
  intro: {
    heading: { tr: 'Ağırnaslı İsmail Usta', en: 'İsmail Usta of Ağırnas' },
    lines: [
      { tr: 'Edirne sultanın şehri. Ova iki baharda bir su altında kalır.', en: "Edirne is the sultan’s city. Every other spring the plain goes under water." },
      { tr: 'Ordular buradan batıya geçer, toplarını arkalarından sürükleyerek.', en: 'Armies cross here on their way west, dragging their guns behind them.' },
      { tr: 'Bu köprüyü saraydan görecekler. Her taşın yüzünü düzgün kesiyorum.', en: 'They will see this bridge from the palace. I dress the face of every stone.' },
    ],
  },
  passed: [{ tr: 'Babamın köprüsü saraydan görünüyor. Orada adını bilen yok.', en: "My father’s bridge can be seen from the palace. No one there knows his name." }],
  failed: [{ tr: 'Köprü babamdan önce yıkıldı. Ordu bir hafta kıyıda bekledi.', en: 'The bridge fell before my father did. The army waited a week on the bank.' }],
  realBridge: {
    tr: 'Edirne, Tunca, Meriç ve Arda’nın buluştuğu ovadadır. Gazi Mihal Köprüsü’nün bugünkü taş yapısı 19. yüzyıldan; 15. yüzyılda Mihal Bey’in, ondan önce bir Roma köprüsünün yerinde durur. Tunca’nın ani taşkınlarına karşı Mimar Sinan 1567’de Yalnızgöz’ü kurdu. Şubat 2026 taşkınında Tunca ve Meriç köprüleri trafiğe kapatıldı.',
    en: 'Edirne lies on the plain where the Tunca, the Meriç and the Arda meet. The present stone Gazi Mihal Bridge is nineteenth-century work, standing where Mihal Bey built in the fifteenth century and the Romans before him. Against the sudden floods of the Tunca, Mimar Sinan built Yalnızgöz in 1567. In the flood of February 2026 the Tunca and Meriç bridges were closed to traffic.',
  },
  hints: {
    load: {
      tr: 'Sefer topları en zayıf kemere bastı. Halkayı kalınlaştır, dolguyu artır, taşları kenetle.',
      en: 'The campaign guns bore down on the weakest arch. Thicken the ring, add fill, and clamp the stones.',
    },
    'flood-scour': {
      tr: 'Kumda ayak çabuk oyulur. Selyaran ver, temeli derine indir, kazık çak.',
      en: 'In sand a pier is soon undermined. Give it cutwaters, a deeper foundation, and piles.',
    },
    quake: {
      tr: 'Edirne depremi derzleri açtı. Taşları kenetle, ayakları kalın tut.',
      en: 'The Edirne earthquake opened the joints. Clamp the stones and keep the piers thick.',
    },
    settlement: {
      tr: 'Kil kıyı yürüdü, kemer açıldı. Dayanakların altına kazık çak.',
      en: 'The clay bank crept and the arch opened. Drive piles under the supports.',
    },
  },
};

export const ergene: LevelStory = {
  intro: {
    heading: { tr: 'Ağırnaslı Yahya Usta', en: 'Yahya Usta of Ağırnas' },
    lines: [
      {
        tr: 'Sultan Murad, Ergene bataklığının üstüne köprü istiyor. Mimar Muslihiddin yüz yetmiş dört göz çizdi.',
        en: 'Sultan Murad wants a bridge across the Ergene marsh. The architect Muslihiddin has drawn a hundred and seventy-four arches.',
      },
      { tr: 'Bataklık ayağı yutar. Önce kazık, sonra taş.', en: 'The marsh swallows a pier. Piles first, then stone.' },
      { tr: 'Bana ırmağın üstündeki on üç gözü verdiler.', en: 'They have given me the thirteen arches over the channel.' },
    ],
  },
  passed: [
    {
      tr: 'On altı yıl. Son kemer kapandığında babamın gözleri görmüyordu; taşları elleriyle saydı.',
      en: "Sixteen years. When the last arch was closed my father’s eyes had gone; he counted the stones with his hands.",
    },
  ],
  failed: [{ tr: 'Köprü babamdan önce yıkıldı. Ona söylemedik; gözleri zaten görmüyordu.', en: 'The bridge fell before my father died. We did not tell him; his eyes had gone by then.' }],
  realBridge: {
    tr: 'Uzunköprü, Ergene üstünde, II. Murad için Mimar Muslihiddin’in eseridir. 1426-1427’de başlandı, 1443-1444’te bitti. Yaygın verilen ölçüleriyle 174 kemer ve 1.392 metredir. Ağır taşıtlar 2013’te yasaklandı; Eylül 2021’den beri onarım için kapalı.',
    en: 'Uzunköprü, over the Ergene, is the work of the architect Muslihiddin for Murad II. It was begun in 1426-1427 and finished in 1443-1444. As usually given it has 174 arches and is 1,392 metres long. Heavy vehicles were banned in 2013, and it has been closed for restoration since September 2021.',
  },
  hints: {
    settlement: {
      tr: 'Bataklık dayanağı yuttu. Kazıksız ayak koyma.',
      en: 'The marsh swallowed a support. Set no pier without piles.',
    },
    strike: {
      tr: 'Ayak bataklığa gömüldü. Kazık çak, ayağı genişlet.',
      en: 'A pier sank into the marsh. Drive piles and widen it.',
    },
    'flood-scour': {
      tr: 'Kanalın kumu oyuldu. Kanaldaki ayakların temelini derine indir, selyaran ver.',
      en: 'The sand of the channel scoured away. Take the foundations in the channel deeper and give them cutwaters.',
    },
    load: {
      tr: 'Kamyonlar küçük gözlere ağır geldi. Halkayı kalınlaştır, dolguyu artır.',
      en: 'The lorries were too heavy for the small arches. Thicken the rings and add fill.',
    },
  },
};
