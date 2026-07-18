import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';

// Marks orders as no-show when their slot's end_time + vendor.grace_minutes
// has passed and the order was never collected. Runs every 5 min via pg_cron.
export const Route = createFileRoute('/api/public/hooks/mark-no-shows')({
  server: {
    handlers: {
      POST: async () => {
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        const { data: orders, error } = await supabase
          .from('orders')
          .select('id, slot:slots(date, end_time), vendor:vendors(grace_minutes)')
          .is('collected_at', null)
          .is('no_show_at', null)
          .in('status', ['paid', 'confirmed']);

        if (error) {
          console.error('[mark-no-shows] query failed', error);
          return json({ ok: false, error: error.message }, 500);
        }

        const now = Date.now();
        const toMark: string[] = [];
        for (const o of orders ?? []) {
          const slot = (o as any).slot;
          const vendor = (o as any).vendor;
          if (!slot?.date || !slot?.end_time) continue;
          const grace = Number(vendor?.grace_minutes ?? 10);
          const endIso = amsterdamWallToIso(slot.date, slot.end_time);
          const cutoff = new Date(endIso).getTime() + grace * 60 * 1000;
          if (now >= cutoff) toMark.push(o.id);
        }

        if (toMark.length > 0) {
          const stamp = new Date().toISOString();
          const { error: upErr } = await supabase
            .from('orders')
            .update({ status: 'no_show', no_show_at: stamp })
            .in('id', toMark);
          if (upErr) {
            console.error('[mark-no-shows] update failed', upErr);
            return json({ ok: false, error: upErr.message }, 500);
          }
        }

        return json({ ok: true, scanned: orders?.length ?? 0, marked: toMark.length });
      },
    },
  },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function amsterdamWallToIso(date: string, time: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm, ss] = time.split(':').map(Number);
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