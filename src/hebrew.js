// שמות בעברית לקבוצות ולשחקנים. מה שלא מופיע כאן מוצג בשמו באנגלית.
export const TEAM_HE = {
  TEL: 'מכבי תל אביב',
  HTA: 'הפועל תל אביב',
  OLY: 'אולימפיאקוס',
  PAN: 'פנאתינאיקוס',
  PAM: 'ולנסיה',
  ULK: "פנרבחצ'ה",
  DUB: 'דובאי',
  MAD: 'ריאל מדריד',
  RED: 'הכוכב האדום',
  BAR: 'ברצלונה',
  PAR: 'פרטיזן',
  ZAL: "ז'לגיריס קובנה",
  PRS: 'פריז',
  IST: 'אנאדולו אפס',
  VIR: 'וירטוס בולוניה',
  BES: 'בשיקטאש',
  MIL: 'אולימפיה מילאנו',
  MUN: 'באיירן מינכן',
  ASV: 'אסוול',
  BAS: 'בסקוניה',
  MCO: 'מונאקו',
  BER: 'אלבה ברלין',
  CSK: 'צסק"א מוסקבה',
  KHI: 'חימקי',
  DYR: 'זניט',
  UNK: 'יוניקס קאזאן',
  ZEN: 'זניט',
};

export const teamHe = (code, fallback) => TEAM_HE[code] || fallback || code;

// סגל מכבי - שמות בעברית (המפתח הוא השם כפי שמופיע ב-API)
const PLAYER_HE = {
  'BALDWIN, KAMAR': 'קמאר בולדווין',
  'HUNTER, SHANE': 'שיין האנטר',
  'MADAR, YAM': 'ים מדר',
  'THEIS, DANIEL': 'דניאל תייס',
  'COLSON, BONZIE': 'בונזי קולסון',
  'WALLACE, KEATON': 'קיטון וואלאס',
  'DIBARTOLOMEO, JOHN': "ג'ון דיברתולומאו",
  'LUNDBERG, IFFE': 'איפה לונדברג',
  'RAYMAN, WILLIAM': 'ויליאם ריימן',
  'BACOT JR., ARMANDO': 'ארמנדו בייקוט',
  'LEAF, TJ': "טי ג'יי ליף",
  "BRISSETT, O'SHAE J": "או'שיי בריסט",
  'SORKIN, ROMAN': 'רומן סורקין',
  'EBO, AMIT': 'עמית אבו',
  'LAVI, GUR': 'גור לביא',
  'CLARK III, JIMMY': "ג'ימי קלארק",
  'HOARD, JAYLEN': "ג'יילן הורד",
  'KATTASH, ODED': 'עודד קטש',
};

// שחקן חדש שאין לו שם במילון מקבל אוטומטית את השם בעברית מאתר מנהלת הליגה (ראו data.js)
export const hasHebrew = (name) => !!PLAYER_HE[name];
export function registerHebrew(name, he) {
  if (name && he && !PLAYER_HE[name]) PLAYER_HE[name] = he;
}

const cap = (s) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

export function playerHe(name) {
  if (!name) return '';
  if (PLAYER_HE[name]) return PLAYER_HE[name];
  const [last, first] = name.split(',').map((s) => s.trim());
  return first ? `${cap(first)} ${cap(last)}` : cap(last);
}

export const POSITION_HE = { Guard: 'גארד', Forward: 'פורוורד', Center: 'סנטר' };
