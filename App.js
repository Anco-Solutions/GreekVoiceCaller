import React, { useState } from 'react';
import { Alert, Linking, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';
import * as Contacts from 'expo-contacts';

export default function App() {
  const [status, setStatus] = useState('Πες μου ποιον θέλεις να καλέσω.');
  const [listening, setListening] = useState(false);

  async function startVoice() {
    setListening(true);
    setStatus('Σε ακούω… Πες, για παράδειγμα: «Κάλεσε τον Γιώργο».');
    // Speech recognition will be added in the next milestone.
    setTimeout(() => setListening(false), 1200);
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

    const normalized = name.trim().toLocaleLowerCase('el-GR');
    const matches = data.filter((contact) => {
      const full = `${contact.firstName || ''} ${contact.lastName || ''}`.trim().toLocaleLowerCase('el-GR');
      return full.includes(normalized) || (contact.firstName || '').toLocaleLowerCase('el-GR').includes(normalized);
    });

    if (!matches.length) {
      setStatus(`Δεν βρήκα επαφή με το όνομα «${name}».`);
      return;
    }

    const withPhone = matches.filter(c => c.phoneNumbers?.some(p => p.number));
    if (!withPhone.length) {
      setStatus(`Η επαφή «${name}» δεν έχει αποθηκευμένο αριθμό.`);
      return;
    }

    if (withPhone.length > 1) {
      setStatus(`Βρήκα ${withPhone.length} επαφές. Στο επόμενο βήμα θα σε ρωτήσω ποια εννοείς.`);
      return;
    }

    const contact = withPhone[0];
    const phone = contact.phoneNumbers[0].number.replace(/[^0-9+]/g, '');
    setStatus(`Καλώ ${contact.name || name}…`);
    await Linking.openURL(`tel:${phone}`);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.container}>
        <Text style={styles.logo}>🎙️</Text>
        <Text style={styles.title}>Greek Voice Caller</Text>
        <Text style={styles.subtitle}>Ο ελληνικός φωνητικός σου Caller</Text>

        <View style={styles.card}>
          <Text style={styles.status}>{status}</Text>
        </View>

        <Pressable style={[styles.mic, listening && styles.micActive]} onPress={startVoice}>
          <Text style={styles.micText}>{listening ? '🔴' : '🎙️'}</Text>
        </Pressable>
        <Text style={styles.hint}>Πάτησε και μίλησε στα ελληνικά</Text>

        <Pressable style={styles.demo} onPress={() => findContactAndCall('Γιώργο')}>
          <Text style={styles.demoText}>Δοκιμή: «Κάλεσε τον Γιώργο»</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f7f7fb' },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  logo: { fontSize: 52, marginBottom: 8 },
  title: { fontSize: 30, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { marginTop: 6, color: '#666', fontSize: 16 },
  card: { width: '100%', minHeight: 100, marginTop: 36, borderRadius: 20, backgroundColor: '#fff', padding: 24, justifyContent: 'center', elevation: 2 },
  status: { textAlign: 'center', fontSize: 18, lineHeight: 27 },
  mic: { width: 104, height: 104, borderRadius: 52, marginTop: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#111' },
  micActive: { transform: [{ scale: 1.05 }] },
  micText: { fontSize: 40 },
  hint: { marginTop: 14, color: '#666' },
  demo: { marginTop: 28, padding: 14, borderRadius: 12, backgroundColor: '#e9e9ef' },
  demoText: { fontWeight: '600' },
});
