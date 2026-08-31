import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import * as Contacts from 'expo-contacts';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

const RETRY_OPTIONS = [
  { label: 'Αμέσως', seconds: 0 },
  { label: '10″', seconds: 10 },
  { label: '30″', seconds: 30 },
  { label: '1′', seconds: 60 },
  { label: '5′', seconds: 300 },
  { label: '15′', seconds: 900 },
  { label: '30′', seconds: 1800 },
  { label: '1 ώρα', seconds: 3600 },
];

const MAX_ATTEMPTS = [2, 3, 5, 8, 10];

const SAMPLE_HISTORY = [
  { name: 'Γιώργος Παπαδόπουλος', time: '12:28', reason: 'Κατειλημμένο', kind: 'busy' },
  { name: 'Γιώργος Παπαδόπουλος', time: '12:27', reason: 'Δεν απάντησε', kind: 'no-answer' },
  { name: 'Γιώργος Παπαδόπουλος', time: '12:26', reason: 'Απάντησε', kind: 'answered' },
];

function normalizeGreek(text = '') {
  return text
    .toLocaleLowerCase('el-GR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ς/g, 'σ')
    .trim();
}

// Πολλές φυσικές ελληνικές διατυπώσεις για την ίδια εντολή.
function extractCallName(transcript) {
  let text = normalizeGreek(transcript);
  text = text.replace(/^[,.;!?\s]+|[,.;!?\s]+$/g, '');
  text = text.replace(/^παρακαλω\s+/i, '');

  const prefixes = [
    /^τηλεφωνησε\s+μου\s+/i,
    /^τηλεφωνησε\s+/i,
    /^τηλεφωνησε\s+τον\s+/i,
    /^τηλεφωνησε\s+την\s+/i,
    /^τηλεφωνησε\s+στον\s+/i,
    /^τηλεφωνησε\s+στην\s+/i,
    /^τηλεφωνησε\s+στη\s+/i,
    /^τηλεφωνησε\s+μου\s+τον\s+/i,
    /^τηλεφωνησε\s+μου\s+την\s+/i,
    /^τηλεφωνησε\s+μου\s+στον\s+/i,
    /^καλεσε\s+με\s+/i,
    /^καλεσε\s+μου\s+/i,
    /^καλεσε\s+/i,
    /^καλεσε\s+τον\s+/i,
    /^καλεσε\s+την\s+/i,
    /^καλεσε\s+στον\s+/i,
    /^καλεσε\s+στην\s+/i,
    /^καλεσέ\s+μου\s+/i,
    /^καλεσέ\s+τον\s+/i,
    /^καλεσέ\s+την\s+/i,
    /^παρε\s+τηλεφωνο\s+/i,
    /^παρε\s+μου\s+τηλεφωνο\s+/i,
    /^παρε\s+/i,
    /^παρε\s+τον\s+/i,
    /^παρε\s+την\s+/i,
    /^παρε\s+στον\s+/i,
    /^παρε\s+στην\s+/i,
    /^παρε\s+στη\s+/i,
  ];

  for (const prefix of prefixes) {
    if (prefix.test(text)) {
      text = text.replace(prefix, '');
      break;
    }
  }

  // Άρθρα/πρόθεση που μπορεί να μείνουν από διαφορετική διατύπωση.
  return text
    .replace(/^(τον|την|το|τη|στον|στην|στη|στο)\s+/i, '')
    .replace(/\s+(παρακαλω|σε παρακαλω)$/i, '')
    .trim();
}

function isCallCommand(text) {
  const normalized = normalizeGreek(text);
  return /(^|\s)(παρε|καλεσε|τηλεφωνησε)(\s|$)/i.test(normalized);
}

function isRetryCommand(text) {
  const normalized = normalizeGreek(text);
  return (
    normalized.includes('κανει επανακληση') ||
    normalized.includes('κανε επανακληση') ||
    normalized.includes('κάνε επανάκληση') ||
    normalized.includes('επανάκληση') ||
    normalized.includes('επανακληση')
  );
}

export default function App() {
  const [status, setStatus] = useState('Πες μου ποιον θέλεις να καλέσω.');
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [retryEnabled, setRetryEnabled] = useState(false);
  const [retrySeconds, setRetrySeconds] = useState(60);
  const [maxAttempts, setMaxAttempts] = useState(8);
  const [drivingMode, setDrivingMode] = useState(true);
  const [pendingPhone, setPendingPhone] = useState(null);
  const [pendingName, setPendingName] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [history, setHistory] = useState(SAMPLE_HISTORY);

  useSpeechRecognitionEvent('start', () => {
    setListening(true);
    setStatus('Σε ακούω…');
  });

  useSpeechRecognitionEvent('end', () => setListening(false));

  useSpeechRecognitionEvent('result', (event) => {
    const result = event.results?.[0]?.transcript || '';
    if (!result) return;
    setTranscript(result);
    if (event.isFinal) {
      setListening(false);
      handleVoiceCommand(result);
    }
  });

  useSpeechRecognitionEvent('error', (event) => {
    setListening(false);
    setStatus(`Δεν μπόρεσα να σε ακούσω. ${event.message || 'Δοκίμασε ξανά.'}`);
  });

  useEffect(() => () => {
    try {
      ExpoSpeechRecognitionModule.abort();
    } catch (_) {}
  }, []);

  const retryLabel = useMemo(
    () => RETRY_OPTIONS.find((option) => option.seconds === retrySeconds)?.label || 'Προσαρμοσμένο',
    [retrySeconds],
  );

  async function startVoice() {
    try {
      const permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Απαιτείται άδεια', 'Χρειάζομαι πρόσβαση στο μικρόφωνο και στην αναγνώριση ομιλίας.');
        return;
      }

      setTranscript('');
      setStatus('Σε ακούω… Πες «πάρε τον Γιώργο».');
      ExpoSpeechRecognitionModule.start({
        lang: 'el-GR',
        interimResults: true,
        continuous: false,
        contextualStrings: [
          'πάρε', 'πάρε τον', 'πάρε την', 'πάρε τηλέφωνο', 'πάρε μου τηλέφωνο',
          'κάλεσε', 'κάλεσέ τον', 'κάλεσέ την', 'κάλεσέ μου',
          'τηλεφώνησε', 'τηλεφώνησέ τον', 'τηλεφώνησέ την', 'τηλεφώνησέ μου',
          'πάρε τηλέφωνο τον', 'πάρε τηλέφωνο την', 'πάρε τηλέφωνο τη',
          'τηλεφώνησε στον', 'τηλεφώνησε στην', 'τηλεφώνησε στη',
          'κάνει επανάκληση', 'κάνε επανάκληση', 'σταμάτα την επανάκληση',
        ],
      });
    } catch (_) {
      setListening(false);
      setStatus('Η φωνητική αναγνώριση δεν είναι διαθέσιμη σε αυτή τη συσκευή/build.');
    }
  }

  async function handleVoiceCommand(command) {
    const normalized = normalizeGreek(command);

    if (isRetryCommand(command)) {
      enableRetry();
      return;
    }

    if (normalized.includes('σταματα') && normalized.includes('επανακληση')) {
      disableRetry();
      return;
    }

    if (!isCallCommand(command)) {
      setStatus(`Άκουσα: «${command}». Πες μου ποιον θέλεις να καλέσω.`);
      return;
    }

    const name = extractCallName(command);
    if (!name) {
      setStatus('Πες μου το όνομα της επαφής.');
      return;
    }

    await findContactAndCall(name);
  }

  async function findContactAndCall(name) {
    const { status: permission } = await Contacts.requestPermissionsAsync();
    if (permission !== 'granted') {
      Alert.alert('Απαιτείται πρόσβαση', 'Χρειάζομαι πρόσβαση στις επαφές για να βρω ποιον θέλεις να καλέσεις.');
      return;
    }

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers],
      pageSize: 1000,
    });

    const query = normalizeGreek(name);
    const matches = data.filter((contact) => {
      const first = normalizeGreek(contact.firstName || '');
      const last = normalizeGreek(contact.lastName || '');
      const full = `${first} ${last}`.trim();
      return full.includes(query) || first.includes(query) || last.includes(query);
    });

    const withPhone = matches.filter((contact) => contact.phoneNumbers?.some((p) => p.number));

    if (!withPhone.length) {
      setStatus(`Δεν βρήκα επαφή «${name}».`);
      return;
    }

    if (withPhone.length > 1) {
      setStatus(`Βρήκα ${withPhone.length} επαφές για «${name}». Θα σε ρωτήσω ποια εννοείς.`);
      return;
    }

    const contact = withPhone[0];
    const phone = contact.phoneNumbers[0].number.replace(/[^0-9+]/g, '');
    const displayName = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || name;

    setPendingPhone(phone);
    setPendingName(displayName);
    setAttempt(1);
    setRetryEnabled(false);
    setStatus(`Καλώ ${displayName}…`);

    try {
      await Linking.openURL(`tel:${phone}`);
      setHistory((items) => [
        { name: displayName, time: 'τώρα', reason: 'Κλήση ξεκίνησε', kind: 'calling' },
        ...items,
      ]);
      setStatus(`${displayName}: η κλήση ξεκίνησε. Αν θέλεις επανάκληση, πες «κάνει επανάκληση».`);
    } catch (_) {
      setStatus(`Δεν μπόρεσα να ξεκινήσω την κλήση προς ${displayName}.`);
    }
  }

  function enableRetry() {
    if (!pendingPhone) {
      setStatus('Δεν υπάρχει ενεργή κλήση για επανάκληση. Πρώτα πες μου ποιον να καλέσω.');
      return;
    }
    setRetryEnabled(true);
    setAttempt(1);
    setStatus(`Ενεργοποίησα την επανάκληση για ${pendingName}. Θα ξεκινήσει μόνο όταν διαπιστωθεί ότι η κλήση δεν απαντήθηκε.`);
  }

  function disableRetry() {
    setRetryEnabled(false);
    setAttempt(0);
    setStatus('Η επανάκληση απενεργοποιήθηκε.');
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.brand}>GREEK VOICE CALLER</Text>
            <Text style={styles.title}>Ο φωνητικός σου Caller</Text>
          </View>
          <Pressable style={styles.iconButton} onPress={() => setShowSettings((value) => !value)}>
            <Text style={styles.iconText}>⚙</Text>
          </Pressable>
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroLabel}>🎙  Πες μου τι θέλεις να κάνω</Text>
          <Text style={styles.heroCommand}>«Πάρε τον Γιώργο»</Text>
          <Text style={styles.heroHint}>ή «Κάλεσε τη Μαρία»</Text>
          <Pressable style={[styles.mic, listening && styles.micActive]} onPress={listening ? () => ExpoSpeechRecognitionModule.stop() : startVoice}>
            <Text style={styles.micText}>{listening ? '■' : '🎙'}</Text>
          </Pressable>
          <Text style={styles.micHint}>{listening ? 'Σε ακούω…' : 'Πάτησε και μίλησε στα ελληνικά'}</Text>
          {!!transcript && <Text style={styles.transcript}>«{transcript}»</Text>}
        </View>

        <View style={styles.statusCard}>
          <View style={styles.statusDot} />
          <View style={styles.statusCopy}>
            <Text style={styles.statusLabel}>ΚΑΤΑΣΤΑΣΗ</Text>
            <Text style={styles.statusText}>{status}</Text>
          </View>
        </View>

        <View style={styles.quickRow}>
          <QuickAction icon="📞" label="Πάρε" sub="τηλέφωνο" onPress={startVoice} />
          <QuickAction icon="↻" label="Κάνει" sub="επανάκληση" active={retryEnabled} onPress={enableRetry} />
          <QuickAction icon="📼" label="Τηλεφωνητής" sub="μηνύματα" />
        </View>

        {pendingPhone && (
          <View style={styles.retryCard}>
            <View style={styles.retryTitleRow}>
              <View>
                <Text style={styles.sectionTitle}>Επανάκληση</Text>
                <Text style={styles.personName}>{pendingName}</Text>
              </View>
              <View style={[styles.pill, retryEnabled ? styles.pillOn : styles.pillOff]}>
                <Text style={styles.pillText}>{retryEnabled ? 'ΕΝΕΡΓΗ' : 'ΑΝΕΝΕΡΓΗ'}</Text>
              </View>
            </View>
            <Text style={styles.retryRule}>
              Η επανάκληση <Text style={styles.bold}>δεν ξεκινά μόνη της</Text>. Ενεργοποιείται μόνο όταν μου πεις «κάνει επανάκληση».
            </Text>
            {retryEnabled && (
              <Text style={styles.retryProgress}>Προσπάθεια {attempt || 1} από {maxAttempts}</Text>
            )}
            <Pressable style={retryEnabled ? styles.stopButton : styles.retryButton} onPress={retryEnabled ? disableRetry : enableRetry}>
              <Text style={styles.buttonText}>{retryEnabled ? '■  Σταμάτα την επανάκληση' : '↻  Κάνει επανάκληση'}</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Τελευταίες κλήσεις</Text>
          <Text style={styles.viewAll}>Προβολή όλων  ›</Text>
        </View>
        <View style={styles.historyCard}>
          {history.slice(0, 4).map((item, index) => (
            <HistoryRow key={`${item.time}-${index}`} item={item} last={index === Math.min(history.length, 4) - 1} />
          ))}
        </View>

        <View style={styles.voicemailCard}>
          <View style={styles.voicemailIcon}><Text style={styles.voicemailIconText}>◉</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.voicemailTitle}>Μηνύματα τηλεφωνητή</Text>
            <Text style={styles.voicemailSub}>2 νέα μηνύματα • ηχητικό + κείμενο</Text>
          </View>
          <Text style={styles.listenText}>Άκουσε ›</Text>
        </View>

        {showSettings && (
          <View style={styles.settingsCard}>
            <Text style={styles.sectionTitle}>Ρυθμίσεις</Text>
            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>Επανάκληση</Text>
                <Text style={styles.settingSub}>Απαιτείται δική σου εντολή για να ενεργοποιηθεί.</Text>
              </View>
              <Switch value={retryEnabled} onValueChange={(value) => value ? enableRetry() : disableRetry()} />
            </View>
            <Text style={styles.optionLabel}>Επανάκληση μετά από</Text>
            <View style={styles.optionsWrap}>
              {RETRY_OPTIONS.map((option) => (
                <Pressable key={option.seconds} style={[styles.option, retrySeconds === option.seconds && styles.optionActive]} onPress={() => setRetrySeconds(option.seconds)}>
                  <Text style={[styles.optionText, retrySeconds === option.seconds && styles.optionTextActive]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.optionLabel}>Μέγιστες προσπάθειες</Text>
            <View style={styles.optionsWrap}>
              {MAX_ATTEMPTS.map((value) => (
                <Pressable key={value} style={[styles.option, maxAttempts === value && styles.optionActive]} onPress={() => setMaxAttempts(value)}>
                  <Text style={[styles.optionText, maxAttempts === value && styles.optionTextActive]}>{value}</Text>
                </Pressable>
              ))}
            </View>
            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.settingTitle}>Λειτουργία οδήγησης</Text>
                <Text style={styles.settingSub}>Μεγάλα χειριστήρια και φωνητικές εντολές.</Text>
              </View>
              <Switch value={drivingMode} onValueChange={setDrivingMode} />
            </View>
          </View>
        )}

        <Text style={styles.footer}>iPhone + Android • Η επανάκληση ενεργοποιείται μόνο με δική σου εντολή</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function QuickAction({ icon, label, sub, onPress, active }) {
  return (
    <Pressable style={[styles.quickAction, active && styles.quickActionActive]} onPress={onPress}>
      <Text style={styles.quickIcon}>{icon}</Text>
      <Text style={styles.quickLabel}>{label}</Text>
      <Text style={styles.quickSub}>{sub}</Text>
    </Pressable>
  );
}

function HistoryRow({ item, last }) {
  const tone = item.kind === 'answered' ? '#35B56A' : item.kind === 'busy' ? '#F39A24' : item.kind === 'calling' ? '#7555E8' : '#7A7F8B';
  return (
    <View style={[styles.historyRow, !last && styles.historyBorder]}>
      <View style={[styles.avatar, { backgroundColor: `${tone}18` }]}>
        <Text style={[styles.avatarText, { color: tone }]}>{item.name.charAt(0)}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.historyName}>{item.name}</Text>
        <Text style={styles.historyTime}>Σήμερα, {item.time}</Text>
      </View>
      <View style={styles.reasonBox}>
        <Text style={[styles.reason, { color: tone }]}>{item.reason}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#FAFAFD' },
  container: { flexGrow: 1, padding: 20, paddingBottom: 40, maxWidth: 620, width: '100%', alignSelf: 'center' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  brand: { fontSize: 11, letterSpacing: 2, fontWeight: '800', color: '#7555E8' },
  title: { fontSize: 25, fontWeight: '800', color: '#171824', marginTop: 4 },
  iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', shadowColor: '#777', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 3 },
  iconText: { fontSize: 21, color: '#454654' },
  heroCard: { backgroundColor: '#FFFFFF', borderRadius: 28, padding: 24, alignItems: 'center', shadowColor: '#6C5AA8', shadowOpacity: 0.10, shadowRadius: 22, shadowOffset: { width: 0, height: 8 }, elevation: 4, borderWidth: 1, borderColor: '#F0EEFA' },
  heroLabel: { color: '#7555E8', fontSize: 16, fontWeight: '700' },
  heroCommand: { fontSize: 25, fontWeight: '800', color: '#20202A', marginTop: 18 },
  heroHint: { color: '#858694', fontSize: 14, marginTop: 6 },
  mic: { marginTop: 20, width: 116, height: 116, borderRadius: 58, backgroundColor: '#7555E8', alignItems: 'center', justifyContent: 'center', shadowColor: '#7555E8', shadowOpacity: 0.25, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 6 },
  micActive: { backgroundColor: '#5C40C9' },
  micText: { fontSize: 45, color: '#FFFFFF' },
  micHint: { color: '#7555E8', fontSize: 14, fontWeight: '700', marginTop: 14 },
  transcript: { color: '#656674', marginTop: 10, fontSize: 13, textAlign: 'center' },
  statusCard: { marginTop: 14, backgroundColor: '#FFFFFF', borderRadius: 18, padding: 15, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#EEEFF5' },
  statusDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#35B56A', marginRight: 12 },
  statusCopy: { flex: 1 },
  statusLabel: { color: '#9899A4', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  statusText: { color: '#292A35', fontSize: 14, marginTop: 2, lineHeight: 20 },
  quickRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  quickAction: { flex: 1, minHeight: 100, backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: '#EEEFF5', alignItems: 'center', justifyContent: 'center', padding: 8 },
  quickActionActive: { borderColor: '#F0B15B', backgroundColor: '#FFF9F0' },
  quickIcon: { fontSize: 23, marginBottom: 7 },
  quickLabel: { fontSize: 13, fontWeight: '800', color: '#2C2D38' },
  quickSub: { fontSize: 12, color: '#7E7F8B', marginTop: 2 },
  retryCard: { marginTop: 14, backgroundColor: '#FFFFFF', borderRadius: 22, padding: 18, borderWidth: 1, borderColor: '#EEEFF5' },
  retryTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionTitle: { fontSize: 17, fontWeight: '800', color: '#22232E' },
  personName: { color: '#777986', fontSize: 13, marginTop: 3 },
  pill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  pillOn: { backgroundColor: '#FFF1DE' },
  pillOff: { backgroundColor: '#F0F1F5' },
  pillText: { fontSize: 9, fontWeight: '900', color: '#8A6A3A' },
  retryRule: { color: '#5F606D', fontSize: 13, lineHeight: 19, marginTop: 13 },
  bold: { fontWeight: '800', color: '#282934' },
  retryProgress: { color: '#7555E8', fontSize: 12, fontWeight: '700', marginTop: 10 },
  retryButton: { backgroundColor: '#F29A28', borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  stopButton: { backgroundColor: '#E94B55', borderRadius: 14, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  buttonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 24, marginBottom: 10 },
  viewAll: { color: '#7555E8', fontSize: 13, fontWeight: '700' },
  historyCard: { backgroundColor: '#FFFFFF', borderRadius: 20, paddingHorizontal: 14, borderWidth: 1, borderColor: '#EEEFF5' },
  historyRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
  historyBorder: { borderBottomWidth: 1, borderBottomColor: '#F0F0F4' },
  avatar: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { fontSize: 17, fontWeight: '800' },
  historyName: { color: '#282934', fontSize: 14, fontWeight: '700' },
  historyTime: { color: '#92939E', fontSize: 12, marginTop: 3 },
  reasonBox: { maxWidth: 115, alignItems: 'flex-end' },
  reason: { fontSize: 12, fontWeight: '700', textAlign: 'right' },
  voicemailCard: { marginTop: 14, backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#EEEFF5' },
  voicemailIcon: { width: 48, height: 48, borderRadius: 15, backgroundColor: '#F0EAFF', alignItems: 'center', justifyContent: 'center', marginRight: 13 },
  voicemailIconText: { color: '#7555E8', fontSize: 25 },
  voicemailTitle: { color: '#292A35', fontSize: 15, fontWeight: '800' },
  voicemailSub: { color: '#8B8C97', fontSize: 12, marginTop: 3 },
  listenText: { color: '#7555E8', fontSize: 13, fontWeight: '800' },
  settingsCard: { marginTop: 14, backgroundColor: '#FFFFFF', borderRadius: 22, padding: 18, borderWidth: 1, borderColor: '#EEEFF5' },
  settingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F1F1F5' },
  settingTitle: { color: '#2B2C37', fontSize: 14, fontWeight: '800' },
  settingSub: { color: '#898A96', fontSize: 12, marginTop: 3, paddingRight: 10 },
  optionLabel: { color: '#555662', fontSize: 12, fontWeight: '800', marginTop: 15, marginBottom: 8 },
  optionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 12, backgroundColor: '#F5F5F8' },
  optionActive: { backgroundColor: '#7555E8' },
  optionText: { color: '#5D5E69', fontSize: 12, fontWeight: '700' },
  optionTextActive: { color: '#FFFFFF' },
  footer: { color: '#A0A1AA', fontSize: 11, textAlign: 'center', marginTop: 22, lineHeight: 17 },
});
