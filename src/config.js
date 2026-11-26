// הגדרות כלליות. אפשר לשנות דרך משתני סביבה.
// העונה מחושבת בכל קריאה (ולא פעם אחת בעליית השרת), כך שהמעבר לעונה חדשה קורה לבד.
// מאוגוסט מנסים את העונה החדשה; אם עוד אין לה לוח משחקים, נשארים בעונה הקודמת (ראו data.js).
export const autoSeasonYear = () => {
  const n = new Date();
  return n.getUTCMonth() >= 7 ? n.getUTCFullYear() : n.getUTCFullYear() - 1;
};
let activeYear = null;
export const setActiveSeasonYear = (y) => {
  activeYear = y;
};

export const config = {
  port: Number(process.env.PORT || 3000),
  teamCode: process.env.TEAM_CODE || 'TEL',
  competition: 'E',
  get seasonYear() {
    return Number(process.env.SEASON_YEAR) || activeYear || autoSeasonYear();
  },
  // כמה עונות אחורה לחפש מפגשי עבר מול היריבה
  h2hSeasonsBack: Number(process.env.H2H_SEASONS || 2),
  // כמה שעות לפני משחק לבנות "תצוגה מקדימה" (פציעות, מפגשי עבר, שחקנים חמים)
  previewHoursBefore: Number(process.env.PREVIEW_HOURS || 3),
  // טוקן לעמוד הניהול (עדכון פציעות ידני ושליחת התראת ניסיון)
  adminToken: process.env.ADMIN_TOKEN || 'change-me',
  // מייל לפרטי VAPID (חובה בתקן Web Push; לא נשלח לאף שירות חוץ מהדפדפנים)
  vapidSubject: process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
  dataDir: process.env.DATA_DIR || new URL('../data/', import.meta.url).pathname,
};

export const seasonCode = (year = config.seasonYear) => `${config.competition}${year}`;
