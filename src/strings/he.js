/**
 * All user-facing Hebrew strings, grouped by screen/area.
 *
 * Kept in one place so the app can be translated later: add another file
 * with the same shape (e.g. en.js) and switch the export in index.js.
 * Strings that need values are small functions.
 *
 * Screens are migrated here as they are redesigned.
 */
const he = {
  common: {
    appName: 'משחקי הכיף',
    exit: 'יציאה',
    back: 'חזרה',
    backToGames: 'חזרה למשחקים',
    rules: 'חוקים',
    share: 'שיתוף',
    copy: 'העתקה',
    copied: 'הועתק',
    roomCode: 'קוד חדר',
    roomCodeShort: 'קוד',
    close: 'סגירה',
    continue: 'המשך',
    cancel: 'ביטול',
    confirm: 'אישור',
    or: 'או',
    loading: 'טוען...',
    host: 'מארח',
    you: 'את/ה',
    drinkingMode: 'מצב שתייה',
    waitingFor: (name) => `ממתין ל${name}...`,
    secondsShort: (n) => `${n} שנ׳`,
  },

  // Temporary dev-only design system preview (removed in cleanup)
  designPreview: {
    title: 'מערכת העיצוב',
    subtitle: 'ערב משחקי קופסה - צבעים, טיפוגרפיה ורכיבים',
    sectionPalette: 'צבעי בסיס',
    sectionGames: 'צבע לכל משחק',
    sectionType: 'טיפוגרפיה',
    sectionButtons: 'כפתורים',
    sectionChips: 'שחקנים ותגיות',
    sectionCards: 'כרטיסים',
    sectionInputs: 'שדות קלט',
    sectionTimer: 'טיימר',
    sectionIcons: 'אייקונים',
    sectionTeams: 'קבוצות (צבע + אייקון)',
    typeDisplay: 'כותרת ראשית',
    typeHeading: 'כותרת מסך',
    typeTitle: 'כותרת כרטיס',
    typeSubtitle: 'כותרת משנה',
    typeBody: 'טקסט רגיל לקריאה נוחה, גם כשמגדילים את הגופן במערכת.',
    typeCaption: 'הערה קטנה',
    primary: 'צור משחק חדש',
    secondary: 'הצטרף למשחק',
    ghost: 'איך משחקים?',
    danger: 'יציאה מהחדר',
    disabled: 'לא זמין',
    loadingButton: 'יוצר חדר',
    openDialog: 'פתח חלון',
    dialogTitle: 'סיכום הסיבוב',
    dialogBody: 'כך ייראו חלונות סיכום, ניצחון והודעות.',
    cardTitle: 'כרטיס משחק',
    cardBody: 'משטח נייר עם מסגרת ועומק עדין, כמו כרטיס אמיתי.',
    tintedCardBody: 'כרטיס בגוון של המשחק.',
    cardboardCardBody: 'משטח קרטון לאזורים משניים.',
    nameLabel: 'השם שלך',
    namePlaceholder: 'הכנס שם...',
    nameError: 'אנא הכנס שם שחקן',
    badgeSubmitted: 'ניחש',
    badgeTurn: 'התור שלו',
    badgeLeft: 'יצא',
    scoreLabel: 'נקודות',
    teamRed: 'קבוצה אדומה',
    teamBlue: 'קבוצה כחולה',
    assassin: 'מתנקש',
    neutral: 'ניטרלי',
    gameNames: {
      alias: 'אליאס',
      codenames: 'שם טוב',
      spy: 'המרגל',
      frequency: 'התדר',
      draw: 'צייר משהו',
    },
    textScaleNote: 'נסו להגדיל את הגופן בדפדפן - הכל אמור להתאים.',
  },
};

export default he;
