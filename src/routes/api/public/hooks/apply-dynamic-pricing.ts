import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';

// Computes and applies auto discount % to slots in the next 4 hours based on
// each vendor's active pricing_rules. Idempotent; runs every 5 min via pg_cron.
export const Route = createFileRoute('/api/public/hooks/apply-dynamic-pricing')({
  server: {
    handlers: {
      POST: async () => {
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!,
          { auth: { persistSession: false, autoRefreshToken: false } },
        );

        // 1. Load vendors with dynamic pricing enabled + their active rules.
        const { data: vendors, error: vErr } = await supabase
          .from('vendors')
          .select('id')
          .eq('dynamic_pricing_enabled', true)
          .eq('is_active', true);
        if (vErr) return json({ ok: false, error: vErr.message }, 500);
        if (!vendors?.length) return json({ ok: true, updated: 0 });

        const vendorIds = vendors.map((v) => v.id);
        const { data: rules } = await supabase
          .from('pricing_rules')
          .select('vendor_id, trigger_minutes, max_fill_pct, discount_pct, priority')
          .in('vendor_id', vendorIds)
          .eq('active', true)
          .order('priority', { ascending: false });
        if (!rules?.length) return json({ ok: true, updated: 0 });

        const rulesByVendor = new Map<string, typeof rules>();
        for (const r of rules) {
          if (!rulesByVendor.has(r.vendor_id)) rulesByVendor.set(r.vendor_id, []);
          rulesByVendor.get(r.vendor_id)!.push(r);
        }

        // 2. Load upcoming slots (next 4h) for these vendors.
        const { data: slots } = await supabase
          .from('slots')
          .select('id, vendor_id, date, start_time, capacity, orders_count, auto_discount_pct')
          .in('vendor_id', vendorIds)
          .eq('is_open', true);
        if (!slots?.length) return json({ ok: true, updated: 0 });

        const now = Date.now();
        const horizon = now + 4 * 60 * 60 * 1000;
        let updated = 0;

        for (const s of slots) {
          const startIso = amsterdamWallToIso(s.date, s.start_time);
          const startMs = new Date(startIso).getTime();
          const minutesToStart = (startMs - now) / 60000;
          const cap = s.capacity || 1;
          const fillPct = Math.round(((s.orders_count ?? 0) / cap) * 100);

          let target = 0;
          if (startMs > now && startMs <= horizon) {
            for (const r of rulesByVendor.get(s.vendor_id) ?? []) {
              if (minutesToStart <= r.trigger_minutes && fillPct < r.max_fill_pct) {
                target = Number(r.discount_pct);
                break; // highest-priority wins
              }
            }
          }

          const current = Number(s.auto_discount_pct ?? 0);
          if (Math.abs(current - target) > 0.001) {
            const { error: upErr } = await supabase
              .from('slots')
              .update({ auto_discount_pct: target })
              .eq('id', s.id);
            if (!upErr) updated++;
          }
        }

        return json({ ok: true, updated, scanned: slots.length });
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
