export function makeCallEvent({ contactName, phone, attempt, reason, at = new Date().toISOString() }) {
  return {
    id: `${Date.now()}-${attempt}`,
    contactName,
    phone,
    attempt,
    reason,
    at,
  };
}

export const CALL_REASON_LABELS = {
  busy: 'Κατειλημμένο',
  no_answer: 'Δεν απάντησε',
  unavailable: 'Μη διαθέσιμο / κλειστό',
  rejected: 'Απορρίφθηκε',
  failed: 'Αποτυχία κλήσης',
  answered: 'Απάντησε',
  unknown: 'Άγνωστη αιτία',
};
