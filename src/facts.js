// עובדות מגניבות למסך הבית: עובדות היסטוריות קבועות + עובדות שנוצרות מהנתונים העדכניים
import { teamHe } from './hebrew.js';

export const STATIC_FACTS = [
  'מכבי תל אביב נוסדה ב-1932, והיא אחד המועדונים המעוטרים ביותר בכדורסל האירופי.',
  'מכבי זכתה בגביע אירופה לאלופות 6 פעמים: 1977, 1981, 2001 (סופרוליג), 2004, 2005 ו-2014.',
  '1977: אחרי הניצחון על צסק"א מוסקבה בחצי הגמר, טל ברודי אמר את המשפט "אנחנו על המפה, ואנחנו נשארים על המפה!"',
  'בגמר 1977 בבלגרד ניצחה מכבי את מוביג\'ירגי וארזה 78:77 וזכתה בתואר האירופי הראשון שלה.',
  'בגמר 1981 בשטרסבורג ניצחה מכבי את סינודיין בולוניה 80:79 – שוב בהפרש נקודה אחת!',
  'בגמר 2004, שנערך בהיכל נוקיה בתל אביב, ניצחה מכבי את סקיפר בולוניה 118:74 – הפרש של 44 נקודות, השיא בגמר יורוליג.',
  'ב-2005 מכבי הגנה על התואר כשניצחה את טאו סרמיקה 90:78 בגמר במוסקבה.',
  'ב-2014 במילאנו ניצחה מכבי את ריאל מדריד 98:86 בהארכה בגמר, וטייריס רייס נבחר ל-MVP של הפיינל פור.',
  'בגמר הסופרוליג 2001 בפריז ניצחה מכבי את פנאתינאיקוס 81:67.',
  'שארונאס יאסיקביצ\'יוס הוביל את מכבי לשתי אליפויות יורוליג רצופות ב-2004 וב-2005.',
  'אנתוני פרקר נבחר ל-MVP של היורוליג בעונות 2003/04 ו-2004/05 במדי מכבי.',
  'מיקי ברקוביץ\' ודורון ג\'מצ\'י הם מהשחקנים הישראלים הגדולים בתולדות המועדון.',
  'היכל מנורה מבטחים (לשעבר היכל יד אליהו והיכל נוקיה) הוא הבית של מכבי, וקיבולתו יותר מ-10,000 צופים.',
  'מכבי זכתה ביותר מ-50 אליפויות ישראל – הרבה יותר מכל קבוצה אחרת בליגה.',
  'במשך 23 עונות רצופות, מ-1970 עד 1992, מכבי זכתה באליפות המדינה בכל עונה.',
  'הצבעים של מכבי הם צהוב וכחול, והקהל שלה מוכר בכינוי "הצהובים".',
  'נוקיה, יד אליהו, מנורה – לאותו היכל היו כמה שמות, אבל האווירה נשארה אותה אווירה.',
  'דרק שארפ קלע את השלשה המפורסמת מול ז\'לגיריס ב-2004 שהעבירה את מכבי להארכה בדרך לפיינל פור בבית.',
  'פיני גרשון אימן את מכבי לשלוש אליפויות יורוליג: 2001, 2004 ו-2005.',
  'דייוויד בלאט אימן את מכבי לאליפות יורוליג ב-2014 – רגע לפני שעבר לאמן בNBA.',
];

// עובדות דינמיות שנוצרות מהנתונים של העונה הנוכחית
export function dynamicFacts({ players, summary, teamAvg, standings, teamCode, games }) {
  const facts = [];
  const active = players.filter((p) => p.gp >= 3);
  const top = (k) => [...active].sort((a, b) => (b[k] || 0) - (a[k] || 0))[0];

  const scorer = top('pts');
  if (scorer) facts.push(`${scorer.name} הוא הקלע המוביל של מכבי העונה עם ${scorer.pts} נקודות בממוצע למשחק.`);
  const reb = top('reb');
  if (reb) facts.push(`${reb.name} מוביל את מכבי בריבאונדים עם ${reb.reb} בממוצע למשחק.`);
  const ast = top('ast');
  if (ast) facts.push(`${ast.name} מחלק ${ast.ast} אסיסטים בממוצע – הכי הרבה בקבוצה.`);
  const pir = top('pir');
  if (pir) facts.push(`לפי מדד היעילות (PIR), ${pir.name} הוא השחקן היעיל ביותר במכבי העונה עם ${pir.pir} בממוצע.`);

  const shooters = active.filter((p) => p.threeMade >= 10).sort((a, b) => b.threePct - a.threePct);
  if (shooters[0]) facts.push(`${shooters[0].name} קולע ${shooters[0].threePct}% מהשלוש העונה – הקלע הכי מדויק מחוץ לקשת.`);

  const bestGame = players.filter((p) => p.best).sort((a, b) => b.best.pts - a.best.pts)[0];
  if (bestGame) facts.push(`שיא הנקודות של מכבי העונה במשחק אחד: ${bestGame.name} עם ${bestGame.best.pts} נקודות מול ${bestGame.best.opp}.`);

  const dd = [...active].sort((a, b) => b.doubleDoubles - a.doubleDoubles)[0];
  if (dd?.doubleDoubles >= 2) facts.push(`${dd.name} רשם כבר ${dd.doubleDoubles} דאבל-דאבל העונה.`);

  if (summary?.streak?.count >= 2) {
    facts.push(summary.streak.type === 'W'
      ? `מכבי ברצף של ${summary.streak.count} ניצחונות ביורוליג! 🔥`
      : `מכבי ברצף של ${summary.streak.count} הפסדים – הגיע הזמן לשבור אותו.`);
  }
  if (summary?.played) {
    facts.push(`בבית מכבי ניצחה העונה ${summary.homeWon} משחקים והפסידה ${summary.homeLost}, ובחוץ ניצחה ${summary.awayWon} והפסידה ${summary.awayLost}.`);
    facts.push(`מכבי קולעת העונה ${summary.ptsFor} נקודות בממוצע וסופגת ${summary.ptsAgainst}.`);
    if (summary.highest) facts.push(`הכי הרבה נקודות שמכבי קלעה במשחק העונה: ${summary.highest}.`);
    if (summary.biggestWin) facts.push(`הניצחון הגדול ביותר של מכבי העונה היה בהפרש ${summary.biggestWin} נקודות.`);
  }
  if (teamAvg?.threesPerGame) facts.push(`מכבי קולעת ${teamAvg.threesPerGame} שלשות למשחק באחוז של ${teamAvg.threePct}%.`);

  const row = standings?.find((t) => t.code === teamCode);
  if (row) facts.push(`מכבי במקום ה-${row.position} בטבלת היורוליג עם ${row.won} ניצחונות ו-${row.lost} הפסדים.`);

  const htaGames = (games || []).filter((g) => g.status === 'result' && [g.home.code, g.away.code].includes('HTA'));
  for (const g of htaGames) {
    const us = g.home.code === teamCode ? g.home.score : g.away.score;
    const them = g.home.code === teamCode ? g.away.score : g.home.score;
    facts.push(`בדרבי היורוליג העונה מול ${teamHe('HTA')}: ${us}:${them} ${us > them ? 'למכבי 💛💙' : 'להפועל'}.`);
  }
  return facts;
}
