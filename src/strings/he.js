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
    error: 'שגיאה',
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

  home: {
    title: 'משחקי הכיף',
    subtitle: 'בחרו את המשחק שלכם ותתחילו את המסיבה!',
    play: 'שחק עכשיו',
    moreComing: 'משחקים נוספים בדרך...',
    // Texts kept exactly as they were; see the redesign notes about
    // "אליאב" vs "אליאס" and 45 vs 60 seconds before changing them
    games: {
      alias: { name: 'אליאב', description: 'משחק ההסברות המהיר! 45 שניות להסביר כמה שיותר מילים' },
      codenames: { name: 'שם טוב', description: 'משחק קבוצתי של מילים וקשרים - נחשו את המילים הנכונות' },
      spy: { name: 'המרגל', description: 'מי המרגל ביניכם? נסו לגלות מי לא באותו מקום' },
      frequency: { name: 'התדר', description: 'משחק חיבור וסנכרון - כמה אתם על אותו גל?' },
      draw: { name: 'צייר משהו', description: 'צייר ונחש - משחק יצירתי ומהנה!' },
    },
  },

  // Shared create/join ("game entry") screen used by every game
  entry: {
    yourName: 'השם שלך',
    namePlaceholder: 'הכנס שם...',
    createGame: 'צור משחק חדש',
    creating: 'יוצר חדר...',
    joinTitle: 'יש לכם קוד?',
    roomCode: 'קוד חדר',
    roomCodePlaceholder: 'הכנס קוד...',
    joinGame: 'הצטרף למשחק',
    howToPlay: 'איך משחקים?',
    errors: {
      nameRequired: 'אנא הכנס שם שחקן',
      codeRequired: 'אנא הכנס קוד חדר',
      uniqueCodeFailed: 'שגיאה ביצירת קוד חדר ייחודי. נסה שוב.',
      createFailed: 'שגיאה ביצירת החדר. נסה שוב.',
      rulesBlocked: 'שגיאה: החדר לא נוצר. אנא בדוק את כללי Firestore.',
      permissionDenied: 'אין הרשאה ליצור חדר. אנא בדוק את כללי Firestore.',
      unavailable: 'Firestore לא זמין. אנא בדוק את החיבור לאינטרנט.',
      notConnected: 'Firestore לא מחובר. אנא ודא ש:\n1. Firestore מופעל ב-Firebase Console\n2. Firestore Rules מאפשרים כתיבה\n3. יש חיבור לאינטרנט',
      notFound: 'Firestore לא נמצא. אנא ודא ש-Firestore מופעל בפרויקט.',
      permissionWrite: 'אין הרשאה לכתוב ל-Firestore. אנא בדוק את ה-Rules ב-Firebase Console.',
      gameStarted: 'המשחק כבר התחיל. לא ניתן להצטרף כעת.',
      roomNotFound: 'חדר לא נמצא. בדוק את הקוד.',
      joinFailed: 'שגיאה בהצטרפות לחדר. נסה שוב.',
      searchFailed: 'שגיאה בחיפוש החדר. נסה שוב.',
      detailsPrefix: '\n\nפרטי השגיאה:\n',
    },
  },

  alias: {
    // Texts kept as-is (see note on "אליאב"/"45 שניות" in home)
    entry: {
      title: 'אליאב',
      subtitle: 'משחק ההסברות המהיר!',
      steps: [
        'חלקו לקבוצות והתחילו סבב',
        'הסבירו מילים בלי להשתמש במילה עצמה',
        'יש לכם 45 שניות לכל סבב!',
        'הקבוצה הראשונה שמגיעה לסוף הלוח מנצחת!',
      ],
    },
  },

  codenames: {
    // Text kept as-is ("בתקפידים" may be a typo for "בתפקידים")
    entry: {
      title: 'שם טוב',
      subtitle: 'משחק המרגלים והרמזים!',
      steps: [
        'השתבצו בתקפידים לשתי קבוצות.',
        'בכל סבב קבוצה אחת משחקת.',
        'שחקן נותן רמז אחד כדי לעזור לקבוצה לנחש כמה שיותר מילים.',
        'הקבוצה שחושפת ראשונה את כלל המילים שלה— מנצחת.',
      ],
    },
  },

  spy: {
    entry: {
      title: 'המרגל',
      subtitle: 'מי המרגל ביניכם?',
      steps: [
        'כל השחקנים מקבלים מיקום זהה/מילה — חוץ מהמרגל.',
        'המרגל לא יודע מה המיקום/מילה.',
        'השחקנים שואלים אחד את השני שאלות בתור.',
        'המרגל מנסה לגלות את המיקום/מילה בלי להיחשף.',
        'אם המרגל מנחש נכון — הוא מנצח. אם חושפים אותו — הקבוצה מנצחת.',
      ],
    },
  },

  draw: {
    entry: {
      title: 'צייר משהו',
      subtitle: 'צייר ונחש - משחק יצירתי ומהנה!',
      steps: [
        'שחקן אחד מצייר מילה שנבחרה אקראית',
        'השאר מנסים לנחש מה זה',
        'המנחשים שולחים ניחוש ומקבלים נקודות',
        'הציירים מתחלפים בתורות',
      ],
    },
  },

  frequency: {
    entry: {
      title: 'התדר',
      subtitle: 'משחק הגלים והתדירויות!',
      steps: [
        'כולם רואים את המסך עם הנושאים.',
        'בכל תור יש שחקן שרואה את הסקאלה אליה צריך לדייק והוא נותן הרמז',
        'שאר השחקנים מנסים לכוון את המחוג שלהם לאותו אזור.',
        'ככל שהניחוש קרוב יותר — מקבלים יותר נקודות.',
      ],
    },
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
