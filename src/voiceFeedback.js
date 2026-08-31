import * as Speech from 'expo-speech';

export function speakGreek(message) {
  if (!message) return;
  Speech.stop();
  Speech.speak(message, {
    language: 'el-GR',
    rate: 0.95,
    pitch: 1.0,
  });
}

export function stopSpeaking() {
  Speech.stop();
}
