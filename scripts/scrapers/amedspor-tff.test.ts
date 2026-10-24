/**
 * Tests for the TFF parsing in amedspor-tff.ts. The HTML snippets are cut
 * from real tff.org pages (fixture list: pageID=198, match page: pageID=29),
 * saved 2026-10-24.
 */
import assert from "node:assert/strict";
import test, { describe } from "node:test";

import { matchToEvent, parseHomeFixtures, parseMatchDetail, teamDisplayName } from "./amedspor-tff";

const FIXTURE_ROWS = `
<tr> <td class="altCizgi" style="font-size:9px;"><a href="/Default.aspx?pageID=28&kulupId=3678">AMED SPORTİF FAALİYETLER</a></td> <td align="Justify" class="altCizgi" nowrap="nowrap" style="font-size:9px;"><a href="/Default.aspx?pageID=29&macId=317850">1 - 0</a></td> <td align="Right" style="font-size:9px;" class="altCizgi"><a href="/Default.aspx?pageID=28&kulupId=3600">TÜMOSAN KONYASPOR</a></td> </tr>
<tr> <td class="altCizgi" style="font-size:9px;"><a href="/Default.aspx?pageID=28&kulupId=3597">SAMSUNSPOR A.Ş.</a></td> <td align="Justify" class="altCizgi" nowrap="nowrap" style="font-size:9px;"><a href="/Default.aspx?pageID=29&macId=317860"> - </a></td> <td align="Right" style="font-size:9px;" class="altCizgi"><a href="/Default.aspx?pageID=28&kulupId=3678">AMED SPORTİF FAALİYETLER</a></td> </tr>
<tr> <td class="altCizgi" style="font-size:9px;"><a href="/Default.aspx?pageID=28&kulupId=3678">AMED SPORTİF FAALİYETLER</a></td> <td align="Justify" class="altCizgi" nowrap="nowrap" style="font-size:9px;"><a href="/Default.aspx?pageID=29&macId=317868"> - </a></td> <td align="Right" style="font-size:9px;" class="altCizgi"><a href="/Default.aspx?pageID=28&kulupId=3610">EYÜPSPOR</a></td> </tr>
`;

const MATCH_PAGE = `
<span id="ctl00_MPane_m_29_194_ctnr_m_29_194_MacBilgiDisplay1_dtMacBilgisi_lblTarih">1.11.2026 - 13:30</span></b><br>
<a id="ctl00_MPane_m_29_194_ctnr_m_29_194_MacBilgiDisplay1_dtMacBilgisi_lnkStad" href="Default.aspx?pageId=394&amp;stadId=6640">DİYARBAKIR STADYUMU - DİYARBAKIR - DİYARBAKIR MERK</a> <br />
<a id="ctl00_MPane_m_29_194_ctnr_m_29_194_MacBilgiDisplay1_dtMacBilgisi_lnkTakim1" href="Default.aspx?pageId=28&amp;kulupId=3678">AMED SPORTİF FAALİYETLER</a></p>
<a id="ctl00_MPane_m_29_194_ctnr_m_29_194_MacBilgiDisplay1_dtMacBilgisi_lnkTakim2" href="Default.aspx?pageId=28&amp;kulupId=3610">EYÜPSPOR</a></p>
<span id="ctl00_MPane_m_29_194_ctnr_m_29_194_MacBilgiDisplay1_dtMacBilgisi_lblOrganizasyonAdi">Trendyol Süper Lig Adnan Süvari Sezonu (Profesyonel Takım) <br/></span>
`;

describe("parseHomeFixtures", () => {
  test("finds the club's home matches and tells played from upcoming", () => {
    assert.deepEqual(parseHomeFixtures(FIXTURE_ROWS, "3678"), [
      { macId: "317850", played: true },
      { macId: "317868", played: false },
    ]);
  });
});

describe("parseMatchDetail", () => {
  test("reads date, stadium, teams and competition", () => {
    assert.deepEqual(parseMatchDetail(MATCH_PAGE), {
      startLocal: "2026-11-01T13:30",
      stadium: "DİYARBAKIR STADYUMU - DİYARBAKIR - DİYARBAKIR MERK",
      home: "AMED SPORTİF FAALİYETLER",
      away: "EYÜPSPOR",
      competition: "Trendyol Süper Lig Adnan Süvari Sezonu (Profesyonel Takım)",
    });
  });

  test("returns null while TFF hasn't set a date", () => {
    assert.equal(parseMatchDetail(MATCH_PAGE.replace("1.11.2026 - 13:30", "")), null);
  });
});

describe("teamDisplayName", () => {
  test("uses the name people call the club", () => {
    assert.equal(teamDisplayName("AMED SPORTİF FAALİYETLER"), "Amedspor");
  });

  test("title-cases in Turkish and drops company suffixes", () => {
    assert.equal(teamDisplayName("EYÜPSPOR"), "Eyüpspor");
    assert.equal(teamDisplayName("ÇAYKUR RİZESPOR A.Ş."), "Çaykur Rizespor");
    assert.equal(teamDisplayName("BEŞİKTAŞ A.Ş."), "Beşiktaş");
    assert.equal(teamDisplayName("GAZİANTEP FUTBOL KULÜBÜ A.Ş."), "Gaziantep FK");
    assert.equal(teamDisplayName("İSTANBUL BAŞAKŞEHİR FK"), "İstanbul Başakşehir FK");
  });
});

describe("matchToEvent", () => {
  test("builds a Spor event at the stadium, linked to the TFF match page", () => {
    const detail = parseMatchDetail(MATCH_PAGE)!;
    assert.deepEqual(matchToEvent(detail, "317868", new Date("2026-10-24T12:00:00Z")), {
      title: "Amedspor – Eyüpspor",
      description: "Trendyol Süper Lig maçı. Biletler Passo üzerinden satılır.",
      start_at: "2026-11-01T10:30:00.000Z",
      end_at: null,
      venue_name: "Diyarbakır Stadyumu",
      category_name: "Spor",
      price: null,
      source_url: "https://www.tff.org/Default.aspx?pageID=29&macId=317868",
      image_url: null,
    });
  });

  test("flags a match more than two weeks out as not yet fixed", () => {
    const detail = parseMatchDetail(MATCH_PAGE)!;
    const event = matchToEvent(detail, "317868", new Date("2026-10-01T12:00:00Z"));
    assert.ok(event?.description?.includes("henüz kesinleşmemiş"));
  });

  test("skips a home match moved away from Diyarbakır", () => {
    const detail = { ...parseMatchDetail(MATCH_PAGE)!, stadium: "MARDİN 2 EYLÜL STADYUMU - MARDİN" };
    assert.equal(matchToEvent(detail, "317868"), null);
  });
});
