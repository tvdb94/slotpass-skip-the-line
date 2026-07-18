// Notifications module — queue-only stub.
// Once an email domain is configured, swap sendReminderEmail's body to call
// sendTemplateEmail from '@/lib/email-templates/send-email'. SMS can be added
// by implementing sendReminderSms similarly.

export type ReminderPayload = {
  orderCode: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  vendorName: string;
  pickupAt: string; // ISO
};

export async function sendReminderEmail(payload: ReminderPayload): Promise<{ sent: boolean; reason?: string }> {
  // Queue-only mode: no sender domain yet. Log the intended send so it's visible
  // in server logs / Cloud → Functions, and return sent:true so the scheduler
  // marks the reminder as processed and won't retry forever.
  console.log('[notifications] reminder queued (stub)', JSON.stringify(payload));
  return { sent: true, reason: 'stub_no_domain' };
}

export async function sendReminderSms(_payload: ReminderPayload): Promise<{ sent: boolean; reason?: string }> {
  // Placeholder for future SMS provider (Twilio / MessageBird).
  return { sent: false, reason: 'sms_not_configured' };
}