/**
 * Wording for the category pages (app/(public)/kategori/[slug]).
 *
 * Each page targets the search people actually type ("diyarbakır konser",
 * "diyarbakır tiyatro"), so the heading, <title> and intro name the city and
 * the kind of event in natural Turkish rather than "Diyarbakır Konser
 * etkinlikleri". Categories without an entry here (a new one a scraper
 * creates) get a generic but still correct wording.
 */

export type CategoryPageCopy = {
  /** The H1. */
  heading: string;
  /** The <title>, before the layout's " | Diyarbakır Etkinlik". */
  title: string;
  /** Meta description, and the intro under the H1. */
  description: string;
};

const UPDATE_NOTE = "Liste günde iki kez güncellenir.";

const COPY: Record<string, { heading: string; title: string; lead: string }> = {
  konser: {
    heading: "Diyarbakır konserleri",
    title: "Diyarbakır Konserleri — Yaklaşan Konser Takvimi",
    lead: "Diyarbakır'daki yaklaşan konserler: tarih, mekân, fiyat ve bilet bağlantılarıyla.",
  },
  tiyatro: {
    heading: "Diyarbakır tiyatro oyunları",
    title: "Diyarbakır Tiyatro Oyunları — Yaklaşan Oyunlar ve Seanslar",
    lead: "Diyarbakır'da sahnelenecek tiyatro oyunları ve seansları: tarih, mekân, fiyat ve bilet bağlantılarıyla.",
  },
  "stand-up": {
    heading: "Diyarbakır stand-up gösterileri",
    title: "Diyarbakır Stand-up Gösterileri — Yaklaşan Gösteriler",
    lead: "Diyarbakır'daki yaklaşan stand-up gösterileri: tarih, mekân, fiyat ve bilet bağlantılarıyla.",
  },
  atolye: {
    heading: "Diyarbakır atölyeleri",
    title: "Diyarbakır Atölyeleri — Yaklaşan Atölye ve Kurslar",
    lead: "Diyarbakır'daki yaklaşan atölyeler: tarih, mekân, fiyat ve kayıt bağlantılarıyla.",
  },
  spor: {
    heading: "Diyarbakır spor etkinlikleri",
    title: "Diyarbakır Spor Etkinlikleri — Yaklaşan Maçlar ve Etkinlikler",
    lead: "Diyarbakır'daki yaklaşan spor etkinlikleri: tarih, mekân, fiyat ve bilet bağlantılarıyla.",
  },
  fuar: {
    heading: "Diyarbakır fuarları",
    title: "Diyarbakır Fuarları — Yaklaşan Fuar ve Sergiler",
    lead: "Diyarbakır'daki yaklaşan fuarlar: tarih, mekân ve ayrıntılarıyla.",
  },
};

export function categoryPageCopy(slug: string, name: string): CategoryPageCopy {
  const known = COPY[slug];
  if (known) {
    return { heading: known.heading, title: known.title, description: `${known.lead} ${UPDATE_NOTE}` };
  }
  return {
    heading: `Diyarbakır'da ${name.toLocaleLowerCase("tr-TR")} etkinlikleri`,
    title: `Diyarbakır ${name} Etkinlikleri`,
    description: `Diyarbakır'daki yaklaşan ${name.toLocaleLowerCase("tr-TR")} etkinlikleri: tarih, mekân, fiyat ve bilet bağlantılarıyla. ${UPDATE_NOTE}`,
  };
}
