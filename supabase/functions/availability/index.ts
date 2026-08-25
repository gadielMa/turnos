import { corsHeaders, handleOptions, json } from "../_shared/cors.ts";
import { adminClient, businessForSlug, slotsForDate } from "../_shared/supabase.ts";

function minutes(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

function slotIsFree(slot: string, duration: number, bookings: Array<{ booking_time: string; duration_minutes?: number }>) {
  const start = minutes(slot);
  const end = start + duration;
  return !bookings.some((booking) => {
    const bookedStart = minutes(booking.booking_time);
    const bookedEnd = bookedStart + (Number(booking.duration_minutes) || 30);
    return start < bookedEnd && bookedStart < end;
  });
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    const month = url.searchParams.get("month");
    const businessSlug = url.searchParams.get("business") || "antonella";
    if ((!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) && (!month || !/^\d{4}-\d{2}$/.test(month))) return json({ error: "Fecha inválida" }, 400);

    const supabase = adminClient();
    const business = await businessForSlug(supabase, businessSlug);
    await supabase.rpc("cleanup_expired_bookings");
    const rangeStart = month ? `${month}-01` : date!;
    const nextMonth = month ? new Date(`${month}-01T12:00:00`) : null;
    if (nextMonth) nextMonth.setMonth(nextMonth.getMonth() + 1);
    const rangeEnd = month ? nextMonth!.toISOString().slice(0, 10) : date!;
    let query = supabase
      .from("bookings")
      .select("booking_date, booking_time, duration_minutes")
      .eq("business_id", business.id)
      .in("status", ["pending", "confirmed"]);
    query = month ? query.gte("booking_date", rangeStart).lt("booking_date", rangeEnd) : query.eq("booking_date", date!);
    const { data, error } = await query;

    if (error) throw error;
    if (month) {
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
      const occupiedByDate = new Map<string, Array<{ booking_time: string; duration_minutes?: number }>>();
      (data ?? []).forEach((row) => {
        const day = (row as { booking_date: string }).booking_date;
        const values = occupiedByDate.get(day) || [];
        values.push(row as { booking_time: string; duration_minutes?: number });
        occupiedByDate.set(day, values);
      });
      const slotDuration = Math.min(1440, Math.max(15, Number(business.public_profile?.slot_minutes) || 30));
      const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
      const availableDates = (await Promise.all(Array.from({ length: daysInMonth }, async (_, index) => {
        const day = `${month}-${String(index + 1).padStart(2, "0")}`;
        if (day < today) return null;
        const occupied = occupiedByDate.get(day) || [];
        const available = (await slotsForDate(supabase, day, business.id, slotDuration)).filter((slot) => slotIsFree(slot, slotDuration, occupied));
        return available.length ? day : null;
      }))).filter(Boolean);
      return json({ month, available_dates: availableDates });
    }

    const slotDuration = Math.min(1440, Math.max(15, Number(business.public_profile?.slot_minutes) || 30));
    const available = (await slotsForDate(supabase, date!, business.id, slotDuration)).filter((slot) => slotIsFree(slot, slotDuration, data ?? []));

    return new Response(JSON.stringify({ date, available }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Error interno" }, 500);
  }
});
