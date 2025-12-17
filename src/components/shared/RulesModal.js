import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Modal, ScrollView, Pressable, Platform, Dimensions } from 'react-native';

const GAME_RULES = {
  alias: {
    title: 'חוקי אליאס',
    content: `באליאס, המטרה היא לגרום לחברי הקבוצה לנחש כמה שיותר מילים בזמן מוגבל. 
בכל תור, שחקן אחד הוא "המסביר" ורק הוא נחשף למסך, עליו להסביר את המילה שמופיעה לו – בלי להשתמש במילה עצמה או בחלקים ממנה. 
הוא יכול להשתמש במילים נרדפות, תיאורים, דוגמאות או רמזים יצירתיים. הקבוצה מקבלת נקודה על כל מילה שניחשה נכון ומפסידה נקודה על כל מילה שלחצה "דלג".
בסיום הזמן ישמע צליל ובמידה וקבוצה עדיין לא סיימה לנחש מילה, שאר הקבוצות יכולות גם לנחש ולזכות בנקודה.
המשחק נגמר כאשר אחת הקבוצות הגיעה למשבצת האחרונה.`,
  },
  codenames: {
    title: 'חוקי שם טוב',
    content: `בשם טוב, שתי קבוצות – אדומה וכחולה – מתחרות מי תגלה ראשונה את כל מילותיה על הלוח. 
בכל קבוצה יש "נותן רמזים" אחד, שרואה מפה סודית שמציינת אילו מילים שייכות לקבוצה שלו, אילו שייכות ליריב, אילו ניטרליות ואיזו מילה היא "המתנקש". 
נותן הרמזים אומר לקבוצה שלו רמז של מילה אחת ומכניס מספר שמייצג כמה מילים על הלוח קשורות לרמז. 
שחקני הקבוצה צריכים לבחור את המילים הנכונות לפי הרמז, אבל טעות עלולה לחשוף מילת יריב – או גרוע מזה, לפגוע במתנקש ולהפסיד מיד. 
הקבוצה שמגלה ראשונה את כל מילותיה – מנצחת.`,
  },
  spy: {
    title: 'חוקי המרגל',
    content: `במשחק המרגל, כל השחקנים מקבלים כרטיס שמציג מקום עבודה מסוים אשר זהה לכל חברי הקבוצה, ותפקיד אשר יכול להיות שונה בין שחקנים
מלבד שחקן אחד שהוא המרגל – והוא לא יודע מה המקום. לאורך המשחק השחקנים שואלים זה את זה שאלות על המקום במטרה לגלות מי לא יודע איפה הם נמצאים.
השאלות חייבות להיות חכמות – מספיקות כדי לבדוק את האחרים, אבל לא ברורות מדי כדי שלא יחשפו את המקום למרגל. 
במהלך המשחק כל חבר בקבוצה יכול להצביע מי המרגל ונעול את ההצבעה
המרגל מנצח אם מצליח להישאר בלתי מזוהה עד סוף הסבב, או אם מצליח להניצל מההצבעה. 
הקבוצה מנצחת אם היא מזהה ומצביעה למרגל בזמן.`,
  },
  frequency: {
    title: 'חוקי התדר',
    content: `ב"התדר", המשחק מתנהל בתורות. בכל סבב, שחקן אחד מקבל הצצה סודית לתדר ולתחום הנכון על גבי המעגל. 
לאחר שראה את המיקום המדויק ואת נושא הסבב, עליו לתת לשאר המשתתפים רמז – מילה אחת או כמה מילים – שממקמות את הרעיון שלו איפשהו על הסקאלה של התדר.
לאחר הרמז, כל שאר השחקנים גוררים את המחוגה על גבי המעגל ומנסים להציב אותה במקום שהם חושבים שהרמז מכוון אליו. כל אזור במעגל מייצג נושא, רעיון או רמת עצימות אחרת, והמטרה של כולם היא להתקרב כמה שיותר לתחום האמיתי שהשחקן הרומז ראה.
ברגע שכל השחקנים קיבעו את המחוגה והגישו את הניחוש שלהם – המשחק חושף אוטומטית את המיקום הנכון ומעניק נקודות לפי מידת הקרבה.
המשחק מסתיים ברגע שהשחקן הראשון מגיע ל10 נקודות
"התדר" הוא משחק של אינטואיציה, הערכה ודיוק. מי שיודע לתת רמזים נכונים ולקרוא את הרמזים של אחרים בצורה החכמה ביותר – מנצח.`,
  },
  draw: {
    title: 'חוקי צייר משהו',
    content: `בצייר משהו בכל סבב שחקן אחד מקבל מילה סודית וצריך לצייר אותה על הקנבס בלי להשתמש באותיות, מספרים או דיבור. 
שאר השחקנים מנסים לנחש את המילה על-ידי כתיבת ניחושים בזמן אמת. 
הראשון שמנחש נכון זוכה בנקודות בהתאם לזמן שלקח לו לנחש 
והצייר מקבל נקודה אם מישהו הצליח לנחש לפני תום הזמן. 
לאחר מכן התור עובר לשחקן הבא, והמשחק נמשך עד שאחד השחקנים מגיע ל10 נקודות`,
  },
};

// Theme colors per variant (matching GradientButton colors)
const THEME_COLORS = {
  draw: '#C48CFF', // סגול בהיר
  frequency: '#0A1A3A', // כחול כהה
  codenames: '#D9C3A5', // חום בהיר
  alias: '#4FA8FF', // כחול בהיר
  spy: '#7ED957', // ירוק בהיר
};

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function RulesModal({ visible, onClose, variant = 'draw' }) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [contentReady, setContentReady] = useState(false);
  const scrollViewRef = useRef(null);
  const themeColor = THEME_COLORS[variant] || THEME_COLORS.draw;
  const currentGameRules = GAME_RULES[variant] || GAME_RULES.draw;

  // Reset expanded state and scroll to top when modal opens
  useEffect(() => {
    if (visible) {
      setIsExpanded(true);
      setContentReady(false);
      // Force re-render when content is ready (iOS fix)
      setTimeout(() => {
        setContentReady(true);
        // Scroll to top when modal opens
        setTimeout(() => {
          scrollViewRef.current?.scrollTo({ y: 0, animated: false });
        }, 50);
      }, 50);
    } else {
      setContentReady(false);
    }
  }, [visible, variant]);

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={[styles.header, { backgroundColor: themeColor }]}>
            <Text style={styles.headerTitle}>📖 {currentGameRules.title}</Text>
            <Pressable onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>

          {/* Rules Content */}
          {contentReady && (
            <ScrollView 
              ref={scrollViewRef}
              style={styles.scrollContent}
              showsVerticalScrollIndicator={true}
              contentContainerStyle={styles.scrollContentContainer}
              bounces={false}
            >
              {/* Current Game Rules */}
              <View style={[styles.rulesSection, { borderColor: themeColor }]}>
                <Pressable
                  onPress={() => setIsExpanded(!isExpanded)}
                  style={[styles.sectionHeader, { backgroundColor: themeColor }]}
                >
                  <Text style={styles.sectionTitle}>{currentGameRules.title}</Text>
                  <Text style={styles.expandIcon}>
                    {isExpanded ? '▼' : '▶'}
                  </Text>
                </Pressable>
                {isExpanded && (
                  <View style={styles.sectionContent}>
                    <Text 
                      style={styles.rulesText}
                      allowFontScaling={true}
                    >
                      {currentGameRules.content}
                    </Text>
                  </View>
                )}
              </View>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '100%',
    maxWidth: 500,
    maxHeight: SCREEN_HEIGHT * 0.85,
    height: Platform.OS === 'ios' ? SCREEN_HEIGHT * 0.85 : undefined,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    flexDirection: 'column',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    padding: 16,
    gap: 12,
    flexGrow: 1,
  },
  rulesSection: {
    borderRadius: 12,
    borderWidth: 2,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 14,
  },
  sectionTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    flex: 1,
  },
  expandIcon: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
  },
  sectionContent: {
    padding: 16,
    backgroundColor: '#F9FAFB',
    minHeight: 100,
    width: '100%',
  },
  rulesText: {
    fontSize: 14,
    lineHeight: 22,
    color: '#374151',
    textAlign: 'right',
    ...(Platform.OS === 'ios' && {
      flexShrink: 1,
    }),
  },
});

