/**
 * Turkish interface strings: the primary voice of the game. Plain, dry, a mason's words.
 * Keys are shared with en.ts, which is typed against this table so the two never drift apart.
 */
export const tr = {
  // Common
  'ui.close': 'Kapat',
  'ui.back': 'Geri',
  'ui.menu': 'Menü',
  'ui.skip': 'Geç',
  'ui.on': 'Açık',
  'ui.off': 'Kapalı',

  // Title
  'title.name': 'Kemer',
  'title.tagline': 'Seni Aşan Köprüler',
  'title.begin': 'Başla',
  'title.continue': 'Devam et',
  'title.ledger': 'Defter',
  'title.daily': 'Günün nehri',
  'title.millennium': 'Bin yıl',
  'title.settings': 'Ayarlar',
  'title.credits': 'Emeği geçenler',

  // Family mark
  'mark.heading': 'Aile işareti',
  'mark.lead': 'Usta, işaretini taşa keser. Bu işaret kuracağın her köprüde olacak.',
  'mark.presets': 'Ustaların işaretleri',
  'mark.draw': 'Kendin çiz',
  'mark.drawHint': 'Noktadan noktaya çiz. Bir çizgiye yeniden çizersen silinir.',
  'mark.clear': 'Temizle',
  'mark.choose': 'Bu işareti kes',
  'mark.preset': '{n}. işaret',
  'mark.point': '{n}. nokta',
  'mark.empty': 'Bir işaret seç ya da çiz',

  // Story cards
  'story.continue': 'Devam',

  // Ledger
  'ledger.heading': 'Defter',
  'ledger.total': 'Köprüler toplam {years} yıl ayakta kaldı',
  'ledger.notBuilt': 'Henüz kurulmadı',
  'ledger.locked': 'Henüz açılmadı',
  'ledger.witnessed': 'Görülenler',
  'ledger.epilogue': 'Elif, 2026',
  'ledger.epilogueLine': 'İlk köprüye dönüş',
  'ledger.epilogueDone': 'Onarıldı',
  'ledger.open': '{river} nehrini aç',

  // Seals
  'seal.standing': 'Ayakta',
  'seal.lean': 'Az taşla',
  'seal.unrepaired': 'Onarımsız',
  'seal.masterwork': 'Usta işi',

  // Design
  'design.build': 'Kur',
  'design.buildAnyway': 'Yine de kur',
  'design.undo': 'Geri al',
  'design.redo': 'Yinele',
  'design.reset': 'Baştan',
  'design.stones': 'Taş',
  'design.par': 'usta sayısı {n}',
  'design.addPier': 'Ayak ekle',
  'design.removePier': 'Ayağı kaldır',
  'design.techniques': 'Teknikler',

  // Capacities
  'cap.load': 'Yük',
  'cap.quake': 'Deprem',
  'cap.flood': 'Sel payı',
  'cap.floodFree': 'Sel',
  'cap.scour': 'Oyulma',
  'cap.waterway': 'Su yolu',

  // Units
  'unit.m': '{n} m',
  'unit.cm': '{n} cm',
  'unit.ton': '{n} ton',
  'unit.g': '{n} g',
  'unit.arsin': '{n} arşın',
  'unit.parmak': '{n} parmak',
  'unit.arsinParmak': '{a} arşın {p} parmak',
  'unit.stones': '{n} taş',
  'unit.years': '{n} yıl',

  // Safety gauge
  'safety.label': 'Emniyet',
  'safety.falls': 'yıkılır',
  'safety.narrow': 'kılpayı',
  'safety.sound': 'sağlam',
  'safety.heavy': 'fazla taş',

  // Handles
  'handle.crown': 'Kemer yüksekliği',
  'handle.haunch': 'Kemer dolgunluğu',
  'handle.ring': 'Kemer kalınlığı',
  'handle.pier': 'Ayak yeri',
  'handle.pier-side': 'Ayak genişliği',
  'handle.spring': 'Üzengi hattı',
  'handle.cover': 'Kilit üstü dolgu',
  'handle.foundation': 'Temel derinliği',
  'handle.indexed': '{name}, {n}. göz',
  'handle.pierIndexed': '{name}, {n}. ayak',

  // Techniques
  'tool.cutwaters': 'Selyaran',
  'tool.reliefs': 'Boşaltma gözleri',
  'tool.clamps': 'Kenet',
  'tool.piles': 'Kazık',
  'tool.linked': 'Eş gözler',

  // Design issues
  'issue.span-too-small': 'Bir göz çok dar.',
  'issue.pier-outside-zone': 'Ayak, yatağın izin verdiği yerin dışında.',
  'issue.piers-overlap': 'Ayaklar birbirine giriyor.',
  'issue.rise-too-low': 'Kemer fazla basık.',
  'issue.rise-too-high': 'Kemer fazla yüksek.',
  'issue.thickness-range': 'Kemer kalınlığı sınırın dışında.',
  'issue.pier-width-range': 'Ayak genişliği sınırın dışında.',
  'issue.deck-too-steep': 'Yol çok dik; araba çıkamaz.',
  'issue.deck-below-road': 'Köprünün sırtı yolun altında kalıyor.',
  'issue.cover-range': 'Kilit üstü dolgu sınırın dışında.',
  'issue.foundation-range': 'Temel derinliği sınırın dışında.',
  'issue.too-many-piers': 'Bu nehre bu kadar ayak konmaz.',
  'issue.too-few-piers': 'Bu açıklık için ayak eksik.',

  // Build
  'build.centering': 'İskele kuruluyor',
  'build.stones': 'Taşları diz',
  'build.keystone': 'Kilit taşını boşluğun üstüne getir, bırak',
  'build.finish': 'Köprü tamamlanıyor',
  'build.mark': 'İşaretini keseceğin taşa dokun',
  'build.wedges': 'Kamalara vur',
  'build.settle': 'Kemer yükünü alıyor',
  'build.laid': 'Dizilen taş',

  // Time
  'time.speed': 'Hız',
  'time.pause': 'Durdur',
  'time.play': 'Sürdür',
  'time.repair': 'Onar',
  'time.repairNone': 'Onarılacak bir şey yok',
  'time.timeline': 'Zaman çizgisi',
  'time.outlast': 'Ustasından uzun',
  'time.season0': 'Kış',
  'time.season1': 'İlkbahar',
  'time.season2': 'Yaz',
  'time.season3': 'Sonbahar',

  // Result
  'result.next': 'Sonraki nehir',
  'result.retry': 'Yeniden kur',
  'result.share': 'Paylaş',
  'result.shareVideo': 'Video',
  'result.shareImage': 'Görsel',
  'result.shareText': 'Metin',
  'result.ledger': 'Defter',
  'result.title': 'Başa dön',
  'restore.heading': 'Onarım',
  'result.seals': 'Mühürler',

  // Collapse
  'collapse.stood': '{n} yıl dayandı.',
  'collapse.why': 'Neden?',
  'collapse.retry': 'Yeniden kur',
  'collapse.diagram': 'Köprünün çizimi: mafsallar ve yük çizgisi',
  'collapse.thrust': 'Yük çizgisi',
  'collapse.hinge': 'Mafsal',
  'collapse.flood': 'En büyük sel',

  // Settings
  'settings.heading': 'Ayarlar',
  'settings.lang': 'Dil',
  'settings.lang.tr': 'Türkçe',
  'settings.lang.en': 'English',
  'settings.sound': 'Ses',
  'settings.master': 'Genel',
  'settings.music': 'Müzik',
  'settings.effects': 'Efektler',
  'settings.quality': 'Görüntü',
  'settings.quality.auto': 'Otomatik',
  'settings.quality.low': 'Düşük',
  'settings.quality.medium': 'Orta',
  'settings.quality.high': 'Yüksek',
  'settings.units': 'Ölçü',
  'settings.units.metre': 'Metre',
  'settings.units.arsin': 'Arşın',
  'settings.reducedMotion': 'Az hareket',
  'settings.ambientLife': 'Çevre canlılığı',
  'settings.textScale': 'Yazı boyu',
  'settings.highContrast': 'Belirgin yük çizgisi',
  'settings.erase': 'Kaydı sil',
  'settings.eraseConfirm': 'Emin misin? Her şey silinir',

  // Keys
  'keys.heading': 'Tuşlar',
  'keys.space': 'Boşluk',
  'keys.spaceAction': 'Kur; basılı tutunca taş diz; zamanda durdur',
  'keys.arrows': 'Ok tuşları',
  'keys.arrowsAction': 'Seçili tutamağı oynat (Shift ile beş adım)',
  'keys.tab': 'Sekme',
  'keys.tabAction': 'Tutamaklar ve düğmeler arasında gez',
  'keys.undoAction': 'Geri al',
  'keys.redoAction': 'Yinele',
  'keys.speedAction': 'Zamanın hızı',
  'keys.pauseAction': 'Zamanı durdur, sürdür',
  'keys.repairAction': 'Onar',
  'keys.escAction': 'Menü; açık kartı kapat',
  'keys.drag': 'Sürükle',
  'keys.dragAction': 'Etrafa bak',
  'keys.wheel': 'Tekerlek',
  'keys.wheelAction': 'Yaklaş, uzaklaş',

  // Pause
  'pause.heading': 'Mola',
  'pause.resume': 'Devam',
  'pause.title': 'Giriş ekranı',

  // Credits
  'credits.heading': 'Emeği geçenler',
  'credits.made': 'Tasarım ve yazılım',
  'credits.madeBy': 'Kemer ekibi',
  'credits.type': 'Yazı',
  'credits.typeBy': 'Cormorant Garamond, Inter (SIL Open Font License)',
  'credits.code': 'Kütüphaneler',
  'credits.codeBy': 'three.js, postprocessing, Rapier',
  'credits.art': 'Doku ve modeller',
  'credits.artBy': 'Poly Haven (CC0) ve Blender ile yapılanlar',
  'credits.thanks': 'Bu nehirlerde köprü kuran, adı kalmamış bütün ustalara.',
} as const;

export type UiKey = keyof typeof tr;
