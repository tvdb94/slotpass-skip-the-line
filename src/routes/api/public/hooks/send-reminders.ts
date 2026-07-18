import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';
import { sendReminderEmail } from '@/lib/notifications';

// Cron endpoint — scans upcoming orders whose pickup slot starts within the
// next ~30 minutes and queues a reminder. Called by pg_cron every 5 minutes.
export const Route = createFileRoute('/api/public/hooks/send-reminders')({
  server: {
    handlers: {
      POST: async () => {
        const url = process.env.SUPABASE_URL!;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const supabase = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });

        // Find candidates: paid/confirmed orders, no reminder yet, no no-show, not collected.
        const { data: orders, error } = await supabase
          .from('orders')
          .select(
            'id, order_code, customer_name, customer_email, customer_phone, reminder_sent_at, collected_at, no_show_at, status, slot:slots(date, start_time), vendor:vendors(name, timezone)',
          )
          .is('reminder_sent_at', null)
          .is('collected_at', null)
          .is('no_show_at', null)
          .in('status', ['paid', 'confirmed']);

        if (error) {
          console.error('[send-reminders] query failed', error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const now = Date.now();
        const windowMs = 30 * 60 * 1000; // 30 minutes ahead
        let processed = 0;

        for (const o of orders ?? []) {
          const slot = (o as any).slot;
          const vendor = (o as any).vendor;
          if (!slot?.date || !slot?.start_time) continue;
          // Build pickup timestamp in Europe/Amsterdam. Slots are stored as
          // wall-clock date + time; treat as local Amsterdam time. UTC offset
          // varies with DST, so use Intl to resolve.
          const pickupIso = amsterdamWallToIso(slot.date, slot.start_time);
          const pickupMs = new Date(pickupIso).getTime();
          const delta = pickupMs - now;
          if (delta <= 0 || delta > windowMs) continue;

          const res = await sendReminderEmail({
            orderCode: o.order_code,
            customerName: o.customer_name,
            customerEmail: o.customer_email,
            customerPhone: o.customer_phone,
            vendorName: vendor?.name ?? '',
            pickupAt: pickupIso,
          });

          if (res.sent) {
            await supabase
              .from('orders')
              .update({ reminder_sent_at: new Date().toISOString() })
              .eq('id', o.id);
            processed += 1;
          }
        }

        return new Response(
          JSON.stringify({ ok: true, scanned: orders?.length ?? 0, processed }),
          { headers: { 'Content-Type': 'application/json' } },
        );
      },
    },
  },
});

// Convert an Amsterdam wall-clock date + time to a UTC ISO string, respecting DST.
function amsterdamWallToIso(date: string, time: string): string {
  // date: "YYYY-MM-DD", time: "HH:MM:SS"
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm, ss] = time.split(':').map(Number);
  // Approximate: create a UTC date, then compute Amsterdam offset for that instant.
  const utcGuess = Date.UTC(y, m - 1, d, hh, mm, ss || 0);
  const offsetMin = amsterdamOffsetMinutes(new Date(utcGuess));
  return new Date(utcGuess - offsetMin * 60 * 1000).toISOString();
}

function amsterdamOffsetMinutes(at: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
  const parts = Object.fromEntries(dtf.formatToParts(at).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(
    Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour), Number(parts.minute), Number(parts.second),
  );
  return Math.round((asUtc - at.getTime()) / 60000);
}