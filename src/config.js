// הגדרות כלליות. אפשר לשנות דרך משתני סביבה.
const now = new Date();
const autoSeasonYear = now.getUTCMonth() >= 6 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;

export const config = {
  port: Number(process.env.PORT || 3000),
  teamCode: process.env.TEAM_CODE || 'TEL',
  competition: 'E',
  seasonYear: Number(process.env.SEASON_YEAR || autoSeasonYear),
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
