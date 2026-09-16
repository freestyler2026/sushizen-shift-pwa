import { describe, it, expect } from "vitest";
import { facebookLink } from "@/lib/facebook";

/**
 * Every one of these is a real answer somebody typed into the apply form.
 *
 * The field asks for "a link or the name on your profile" and gets both, plus
 * emails, nicknames and "-". The admin panel used to put the value straight
 * into an href, so 87 of these 120 resolved against our own domain and 404'd.
 */
const REAL = [
  "facebook.com/itsyourboinicolaou",
  "ericasoncuan",
  "Facebook.com/chefchad",
  "facebook.com/anafe.see",
  "Edselle pe\u00f1a",
  "Bobstephenrubido",
  "facebook.com/paubayutas",
  "Facebook.com/jeorgina cainan",
  "Alejo bella ram",
  "Andrie Olegario",
  "jairadcnunez",
  "Ai Kka",
  "Princess Gri\u00f1a",
  "Jhonbernard Yungot",
  "Cericosrobertwayne34@gmail.com",
  "Zhell gomez",
  "NettyJean",
  "www.facebook.com/jeromealab",
  "jnkymorrielpadasas",
  "Abby/maria/bedia/guia/",
  "Chie De Leon Lucena",
  "Aj Traquena",
  "-",
  "Josephine buenavidez",
  "RyanHILL",
  "Curpos marialuisa@facebook",
  "Www.facebook.com/romanakhaa",
  "Bernadette Gapal",
  "facebook.com/snnryc01",
  "Rkofficialaccount",
  "rhendel.austria.7",
  "Sheine Matalino",
  "JDominicPar",
  "Alessia Durandar Tongco",
  "Whendhie d reyes",
  "RoseTorres",
  "Matt Ariola",
  "DhaileneAlmario",
  "Karl angelo silvano",
  "Ferdinand Lopez",
  "\uc870\ub2c8\ucf5c",
  "Aldrene Cabaluna Anding",
  "Paulo fortich",
  "RobBry",
  "Gercy gasis",
  "Alek panagane",
  "Louriene Saltoc",
  "Escalante.tedd",
  "Ash BT",
  "Facebook.com/MC Reodique",
  "Jever Villanueva",
  "ArSoledad",
  "Jonjie Bolisig Rey",
  "chefrouxrixchz",
  "facebook.com/anafesee",
  "Jonas Membrillos",
  "Glicer Cadiente",
  "Rowena Funtanares",
  "Karl lunajo",
  "JohnDominic",
  "Geraldine Rubio Agang",
  "Yhazerportugal",
  "www.facebook.com/jveanasco",
  "Francis Orenday",
  "Brayan Biagan.com",
  "Enna buensuceso",
  "crissa jose",
  "ghang nam",
  "Gilbert limb'o",
  "Dford Rhomz Asor",
  "Faye Jellica",
  "@nickimperial.mariano",
  "Albert Dee Monsanto",
  "facebook",
  "Chrisdale Adzuara",
  "Caloy Evora",
  "Anthony norio",
  "Carolyn Buslon Rabago",
  "Raine Queja Delos Reyes",
  "Ayan caberte",
  "ginalynragun52@gmail.com",
  "Mheg garcia",
  "Marjun cabrera mercader",
  "Rica Rodas",
  "facebook.com/RobeeBarretto",
  "Mona Liza Serote@yahoo.com",
  "https://www.facebook.com/share/1abc/",
  "https://facebook.com/profile.php?id=100011223344",
];

describe("facebookLink", () => {
  it("never hands back a relative href — that was the whole bug", () => {
    for (const v of REAL) {
      const fb = facebookLink(v);
      if (!fb) continue;
      expect(fb.href, `${v} -> ${fb.href}`).toMatch(/^https:\/\/(www\.)?facebook\.com\//);
    }
  });

  it("opens a profile when what they wrote identifies one", () => {
    for (const [v, href] of [
      ["https://facebook.com/profile.php?id=100011223344", "https://facebook.com/profile.php?id=100011223344"],
      ["facebook.com/anafe.see", "https://www.facebook.com/anafe.see"],
      ["Www.facebook.com/romanakhaa", "https://www.facebook.com/romanakhaa"],
      ["rhendel.austria.7", "https://www.facebook.com/rhendel.austria.7"],
      ["@nickimperial.mariano", "https://www.facebook.com/nickimperial.mariano"],
    ] as [string, string][]) {
      const fb = facebookLink(v)!;
      expect(fb.isSearch, v).toBe(false);
      expect(fb.href).toBe(href);
    }
  });

  it("searches when it is a name, because a name has no profile URL", () => {
    for (const v of [
      "Jonas Membrillos", "Ai Kka", "Whendhie d reyes",
      "Facebook.com/jeorgina cainan",     // a space is not a path
      "Cericosrobertwayne34@gmail.com",   // an email is not a handle
      "facebook",                          // identifies nobody
      "조니콜",
    ]) {
      const fb = facebookLink(v)!;
      expect(fb.isSearch, v).toBe(true);
      expect(fb.href).toContain("/search/top?q=");
    }
  });

  it("shows what they wrote, never a cleaned-up version of it", () => {
    expect(facebookLink("Facebook.com/chefchad")!.label).toBe("Facebook.com/chefchad");
  });

  it("has nothing to link when the field is empty or a dash", () => {
    for (const v of ["", "   ", "-", null, undefined]) {
      expect(facebookLink(v as string | null)).toBeNull();
    }
  });
});
