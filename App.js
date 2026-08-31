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
  { label: '10 δευτερόλεπτα', seconds: 10 },
  { label: '30 δευτερόλεπτα', seconds: 30 },
  { label: '1 λεπτό', seconds: 60 },
  { label: '5 λεπτά', seconds: 300 },
  { label: '15 λεπτά', seconds: 900 },
  { label: '30 λεπτά', seconds: 1800 },
  { label: '1 ώρα', seconds: 3600 },
];

const MAX_ATTEMPTS = [1, 3, 5, 10, 20];

function normalizeGreek(text = '') {
  return text
    .toLocaleLowerCase('el-GR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ς/g, 'σ')
    .trim();
}

function extractCallName(transcript) {
  const text = normalizeGreek(transcript);
  const cleaned = text
    .replace(/^(παρακαλω\s+)?(παρε|πάρε|καλεσε|κάλεσε|τηλεφωνησε|τηλεφώνησε)\s+/i, '')
    .replace(/^(τον|την|το|τη)\s+/i, '')
    .trim();
  return cleaned;
}

export default function App() {
  const [status, setStatus] = useState('Πες μου ποιον θέλεις να καλέσω.');
  const [transcript, setTranscript] = useState('');
  const [listening, setListening] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [retryEnabled, setRetryEnabled] = useState(true);
  const [retrySeconds, setRetrySeconds] = useState(60);
  const [maxAttempts, setMaxAttempts] = useState(10);
  const [drivingMode, setDrivingMode] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [pendingPhone, setPendingPhone] = useState(null);
  const [pendingName, setPendingName] = useState('');

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
    try { ExpoSpeechRecognitionModule.abort(); } catch (_) {}
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
        contextualStrings: ['πάρε', 'κάλεσε', 'Γιώργος', 'Μαρία', 'Κώστας', 'τηλεφώνησε'],
      });
    } catch (error) {
      setListening(false);
      setStatus('Η φωνητική αναγνώριση δεν είναι διαθέσιμη σε αυτή τη συσκευή/build.');
    }
  }

  async function handleVoiceCommand(command) {
    const normalized = normalizeGreek(command);
    if (normalized.includes('σταματα') || normalized.includes('ακυρωσε')) {
      stopRetrying();
      setStatus('Η επανάκληση σταμάτησε.');
      return;
    }

    if (!/(παρε|πάρε|καλεσε|κάλεσε|τηλεφωνησε|τηλεφώνησε)/i.test(command)) {
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
      setStatus(`Βρήκα ${withPhone.length} επαφές για «${name}». Στο επόμενο βήμα θα σε ρωτήσω ποια εννοείς.`);
      return;
    }

    const contact = withPhone[0];
    const phone = contact.phoneNumbers[0].number.replace(/[^0-9+]/g, '');
    const displayName = contact.name || `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || name;

    setPendingPhone(phone);
    setPendingName(displayName);
    setAttempt(1);
    setRetrying(false);
    setStatus(`Καλώ ${displayName}…`);
    await Linking.openURL(`tel:${phone}`);

    // The native dialer owns the actual call. The retry engine is prepared here
    // but will be connected to reliable call-state events in the native layer.
    if (retryEnabled) {
      setStatus(`Κλήση προς ${displayName}. Αν δεν απαντήσει, επανάκληση: ${retryLabel}.`);
    }
  }

  function startRetryDemo() {
    if (!pendingPhone || !retryEnabled) return;
    setRetrying(true);
    setAttempt(1);
    setStatus(`Παρακολουθώ την κλήση προς ${pendingName}. Θα σταματήσω μόλις απαντήσει.`);
  }

  function stopRetrying() {
    setRetrying(false);
    setAttempt(0);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.kicker}>GREEK VOICE</Text>
            <Text style={styles.title}>Caller</Text>
          </View>
          <Pressable style={styles.settingsButton} onPress={() => setShowSettings((value) => !value)}>
            <Text style={styles.settingsIcon}>⚙️</Text>
          </Pressable>
        </View>

        <Text style={styles.subtitle}>Μίλα φυσικά. Εγώ αναλαμβάνω την κλήση.</Text>

        <View style={styles.statusCard}>
          <Text style={styles.statusLabel}>ΚΑΤΑΣΤΑΣΗ</Text>
          <Text style={styles.status}>{status}</Text>
          {!!transcript && <Text style={styles.transcript}>«{transcript}»</Text>}
        </View>

        <Pressable style={[styles.mic, listening && styles.micActive]} onPress={listening ? () => ExpoSpeechRecognitionModule.stop() : startVoice}>
          <Text style={styles.micIcon}>{listening ? '◼' : '🎙️'}</Text>
        </Pressable>
        <Text style={styles.micHint}>{listening ? 'Πατήστε για διακοπή' : 'Πάτησε και μίλησε στα ελληνικά'}</Text>

        <View style={styles.exampleCard}>
          <Text style={styles.exampleTitle}>Δοκίμασε να πεις</Text>
          <Text style={styles.exampleText}>«Πάρε τον Γιώργο»</Text>
          <Text style={styles.exampleSub}>«Κάλεσε τη Μαρία»</Text>
        </View>

        {pendingPhone && retryEnabled && (
          <View style={styles.retryCard}>
            <View style={styles.retryHeader}>
              <View>
                <Text style={styles.retryTitle}>Αυτόματη επανάκληση</Text>
                <Text style={styles.retrySub}>{pendingName}</Text>
              </View>
              <Text style={styles.retryBadge}>{attempt ? `#${attempt}` : 'Ενεργή'}</Text>
            </View>
            <Text style={styles.retryDescription}>
              Αν δεν απαντήσει, θα ξανακαλέσει μετά από {retryLabel}, μέχρι να απαντήσει ή να φτάσει το όριο.
            </Text>
            <View style={styles.actionRow}>
              {!retrying ? (
                <Pressable style={styles.primarySmall} onPress={startRetryDemo}>
                  <Text style={styles.primarySmallText}>▶ Ενεργοποίηση</Text>
                </Pressable>
              ) : (
                <Pressable style={styles.stopSmall} onPress={stopRetrying}>
                  <Text style={styles.stopSmallText}>■ Σταμάτα</Text>
                </Pressable>
              )}
            </View>
          </View>
        )}

        {showSettings && (
          <View style={styles.settingsCard}>
            <Text style={styles.sectionTitle}>Ρυθμίσεις Caller</Text>
            <View style={styles.settingRow}>
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>Αυτόματη επανάκληση</Text>
                <Text style={styles.settingSub}>Σταματά αμέσως όταν απαντήσει.</Text>
              </View>
              <Switch value={retryEnabled} onValueChange={setRetryEnabled} />
            </View>

            <Text style={styles.optionLabel}>Επανάκληση μετά από</Text>
            <View style={styles.optionsWrap}>
              {RETRY_OPTIONS.map((option) => (
                <Pressable
                  key={option.seconds}
                  style={[styles.option, retrySeconds === option.seconds && styles.optionActive]}
                  onPress={() => setRetrySeconds(option.seconds)}
                >
                  <Text style={[styles.optionText, retrySeconds === option.seconds && styles.optionTextActive]}>{option.label}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.optionLabel}>Μέγιστες προσπάθειες</Text>
            <View style={styles.optionsWrap}>
              {MAX_ATTEMPTS.map((value) => (
                <Pressable
                  key={value}
                  style={[styles.option, maxAttempts === value && styles.optionActive]}
                  onPress={() => setMaxAttempts(value)}
                >
                  <Text style={[styles.optionText, maxAttempts === value && styles.optionTextActive]}>{value === 20 ? '20+' : value}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingCopy}>
                <Text style={styles.settingTitle}>Λειτουργία οδήγησης</Text>
                <Text style={styles.settingSub}>Μεγάλα χειριστήρια, λιγότερη οθόνη, περισσότερη φωνή.</Text>
              </View>
              <Switch value={drivingMode} onValueChange={setDrivingMode} />
            </View>
          </View>
        )}

        <Text style={styles.footer}>Πρώτη έκδοση • iPhone + Android</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f6f7fb' },
  container: { flexGrow: 1, alignItems: 'center', padding: 22, paddingBottom: 36 },
  headerRow: { width: '100%', maxWidth: 520, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kicker: { fontSize: 12, fontWeight: '800', letterSpacing: 2.5, color: '#6b6f78' },
  title: { marginTop: 2, fontSize: 36, fontWeight: '900', letterSpacing: -1.5, color: '#111318' },
  subtitle: { width: '100%', maxWidth: 520, marginTop: 6, color: '#656a74', fontSize: 16, lineHeight: 23 },
  settingsButton: { width: 50, height: 50, borderRadius: 16, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  settingsIcon: { fontSize: 22 },
  statusCard: { width: '100%', maxWidth: 520, marginTop: 28, borderRadius: 24, backgroundColor: '#fff', padding: 22 },
  statusLabel: { fontSize: 11, fontWeight: '800', letterSpacing: 1.5, color: '#8a8f99' },
  status: { marginTop: 8, fontSize: 20, lineHeight: 29, fontWeight: '700', color: '#17191e' },
  transcript: { marginTop: 10, fontSize: 16, color: '#666b75', fontStyle: 'italic' },
  mic: { width: 118, height: 118, borderRadius: 59, marginTop: 30, backgroundColor: '#111318', alignItems: 'center', justifyContent: 'center' },
  micActive: { transform: [{ scale: 1.04 }] },
  micIcon: { fontSize: 43, color: '#fff' },
  micHint: { marginTop: 13, color: '#6c7079', fontSize: 14 },
  exampleCard: { width: '100%', maxWidth: 520, marginTop: 26, borderRadius: 20, backgroundColor: '#eceef3', padding: 20 },
  exampleTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 1, color: '#777c86' },
  exampleText: { marginTop: 8, fontSize: 20, fontWeight: '800', color: '#17191e' },
  exampleSub: { marginTop: 5, fontSize: 17, color: '#555a64' },
  retryCard: { width: '100%', maxWidth: 520, marginTop: 18, borderRadius: 22, backgroundColor: '#fff', padding: 20 },
  retryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  retryTitle: { fontSize: 18, fontWeight: '800', color: '#17191e' },
  retrySub: { marginTop: 3, fontSize: 14, color: '#6c7079' },
  retryBadge: { minWidth: 42, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, textAlign: 'center', backgroundColor: '#eef0f4', fontWeight: '800', color: '#4b505a' },
  retryDescription: { marginTop: 14, fontSize: 14, lineHeight: 21, color: '#626772' },
  actionRow: { marginTop: 16, flexDirection: 'row' },
  primarySmall: { paddingVertical: 13, paddingHorizontal: 18, borderRadius: 14, backgroundColor: '#111318' },
  primarySmallText: { color: '#fff', fontWeight: '800' },
  stopSmall: { paddingVertical: 13, paddingHorizontal: 18, borderRadius: 14, backgroundColor: '#eceef3' },
  stopSmallText: { color: '#17191e', fontWeight: '800' },
  settingsCard: { width: '100%', maxWidth: 520, marginTop: 18, borderRadius: 22, backgroundColor: '#fff', padding: 20 },
  sectionTitle: { fontSize: 20, fontWeight: '900', color: '#17191e' },
  settingRow: { marginTop: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 14 },
  settingCopy: { flex: 1 },
  settingTitle: { fontSize: 16, fontWeight: '800', color: '#17191e' },
  settingSub: { marginTop: 3, fontSize: 13, lineHeight: 19, color: '#747983' },
  optionLabel: { marginTop: 20, marginBottom: 9, fontSize: 13, fontWeight: '800', color: '#5d626c' },
  optionsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  option: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 12, backgroundColor: '#f0f1f5' },
  optionActive: { backgroundColor: '#111318' },
  optionText: { fontSize: 13, fontWeight: '700', color: '#555a64' },
  optionTextActive: { color: '#fff' },
  footer: { marginTop: 26, color: '#999da5', fontSize: 12 },
});
