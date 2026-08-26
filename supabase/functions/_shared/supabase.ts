import { createClient } from "npm:@supabase/supabase-js@2";

export function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  let serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY");

  // Supabase expone las nuevas claves secretas como un JSON con nombres.
  // La clave creada por defecto se encuentra en SUPABASE_SECRET_KEYS.default.
  const secretKeysJson = Deno.env.get("SUPABASE_SECRET_KEYS");
  console.log("Supabase admin config:", {
    hasUrl: Boolean(url),
    hasSecretKeysJson: Boolean(secretKeysJson),
    hasCustomSecret: Boolean(serviceRoleKey),
  });
  if (secretKeysJson) {
    try {
      const secretKeys = JSON.parse(secretKeysJson);
      console.log("Supabase secret key names:", Object.keys(secretKeys));
      serviceRoleKey = secretKeys.default || serviceRoleKey;
    } catch {
      throw new Error("SUPABASE_SECRET_KEYS no contiene un JSON válido");
    }
  }

  if (!url || !serviceRoleKey) {
    throw new Error("Faltan SUPABASE_URL o una secret key de Supabase");
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function businessForSlug(
  supabase: ReturnType<typeof adminClient>,
  slug = "brian",
) {
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, slug, status, public_profile")
    .eq("slug", slug)
    .eq("status", "active")
    .single();

  if (error || !data) throw new Error("Negocio no encontrado");
  return data;
}

type BusinessHours = {
  start_time: string;
  end_time: string;
  slot_minutes: number;
  active: boolean;
};

type AvailabilityRule = {
  start_date: string;
  start_time: string;
  end_time: string;
  frequency: "once" | "weekly" | "monthly";
  interval_count: number;
  occurrences: number | null;
  until_date: string | null;
  weekdays: number[];
  active: boolean;
};

const ARGENTINA_HOLIDAYS_2026 = new Set([
  "2026-01-01", "2026-02-16", "2026-02-17", "2026-03-23", "2026-03-24",
  "2026-04-02", "2026-04-03", "2026-05-01", "2026-05-25", "2026-06-15",
  "2026-06-20", "2026-07-09", "2026-07-10", "2026-08-17", "2026-10-12",
  "2026-11-23", "2026-12-07", "2026-12-08", "2026-12-25",
]);

function weekdayForDate(date: string) {
  return new Date(`${date}T12:00:00-03:00`).getUTCDay();
}

function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function dateToDayNumber(date: string) {
  return Math.floor(Date.parse(`${date}T12:00:00-03:00`) / 86400000);
}

function ruleAppliesOnDate(rule: AvailabilityRule, date: string) {
  if (!rule.active || date < rule.start_date || (rule.until_date && date > rule.until_date)) return false;
  const dateValue = new Date(`${date}T12:00:00-03:00`);
  const startValue = new Date(`${rule.start_date}T12:00:00-03:00`);
  const daysSinceStart = dateToDayNumber(date) - dateToDayNumber(rule.start_date);

  if (rule.frequency === "once") return date === rule.start_date;
  if (rule.frequency === "weekly") {
    if (!rule.weekdays.includes(dateValue.getUTCDay())) return false;
    const weekNumber = Math.floor(daysSinceStart / 7);
    if (weekNumber % rule.interval_count !== 0) return false;
    if (rule.occurrences) {
      let count = 0;
      for (let offset = 0; offset <= daysSinceStart; offset++) {
        const current = new Date(startValue);
        current.setUTCDate(current.getUTCDate() + offset);
        if (rule.weekdays.includes(current.getUTCDay()) && Math.floor(offset / 7) % rule.interval_count === 0) count++;
      }
      if (count > rule.occurrences) return false;
    }
    return true;
  }

  const monthsSinceStart = (dateValue.getUTCFullYear() - startValue.getUTCFullYear()) * 12
    + dateValue.getUTCMonth() - startValue.getUTCMonth();
  if (monthsSinceStart < 0 || monthsSinceStart % rule.interval_count !== 0) return false;
  if (rule.occurrences && (monthsSinceStart / rule.interval_count) + 1 > rule.occurrences) return false;
  return dateValue.getUTCDate() === startValue.getUTCDate()
    && dateValue.getUTCDate() <= new Date(Date.UTC(dateValue.getUTCFullYear(), dateValue.getUTCMonth() + 1, 0)).getUTCDate();
}

function slotsFromRange(startTime: string, endTime: string, slotMinutes = 60) {
  const slots: string[] = [];
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  for (let minute = start; minute + slotMinutes <= end; minute += slotMinutes) {
    slots.push(`${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`);
  }
  return slots;
}

async function hoursForDate(
  supabase: ReturnType<typeof adminClient>,
  date: string,
  businessId?: string,
) {
  let query = supabase
    .from("business_hours")
    .select("start_time, end_time, slot_minutes, active")
    .eq("weekday", weekdayForDate(date));

  if (businessId) query = query.eq("business_id", businessId);
  const { data, error } = await query.maybeSingle();

  if (error) throw error;
  return data as BusinessHours | null;
}

export async function slotsForDate(
  supabase: ReturnType<typeof adminClient>,
  date: string,
  businessId?: string,
  slotMinutes = 60,
) {
  if (ARGENTINA_HOLIDAYS_2026.has(date)) return [];
  const { data: rules, error: rulesError } = await supabase
    .from("availability_rules")
    .select("start_date, start_time, end_time, frequency, interval_count, occurrences, until_date, weekdays, active")
    .eq("business_id", businessId)
    .eq("active", true);
  if (!rulesError && rules?.length) {
    return [...new Set((rules as AvailabilityRule[])
      .filter((rule) => ruleAppliesOnDate(rule, date))
      .flatMap((rule) => slotsFromRange(rule.start_time, rule.end_time, slotMinutes)))].sort();
  }

  const hours = await hoursForDate(supabase, date, businessId);
  if (!hours || !hours.active) return [];

  return slotsFromRange(hours.start_time, hours.end_time, hours.slot_minutes);
}

export async function isValidSlot(
  supabase: ReturnType<typeof adminClient>,
  date: string,
  time: string,
  businessId?: string,
  slotMinutes = 60,
) {
  const slots = await slotsForDate(supabase, date, businessId, slotMinutes);
  return slots.includes(time.slice(0, 5));
}
