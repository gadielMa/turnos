import { corsHeaders, handleOptions, json } from "../_shared/cors.ts";
import { adminClient, businessForSlug, slotsForDate } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    const month = url.searchParams.get("month");
    const businessSlug = url.searchParams.get("business") || "antonella-morselli";
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
      .select("booking_date, booking_time")
      .eq("business_id", business.id)
      .in("status", ["pending", "confirmed"]);
    query = month ? query.gte("booking_date", rangeStart).lt("booking_date", rangeEnd) : query.eq("booking_date", date!);
    const { data, error } = await query;

    if (error) throw error;
    if (month) {
      const occupiedByDate = new Map<string, Set<string>>();
      (data ?? []).forEach((row) => {
        const day = (row as { booking_date: string }).booking_date;
        const values = occupiedByDate.get(day) || new Set<string>();
        values.add((row as { booking_time: string }).booking_time.slice(0, 5));
        occupiedByDate.set(day, values);
      });
      const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
      const availableDates = (await Promise.all(Array.from({ length: daysInMonth }, async (_, index) => {
        const day = `${month}-${String(index + 1).padStart(2, "0")}`;
        const occupied = occupiedByDate.get(day) || new Set<string>();
        const available = (await slotsForDate(supabase, day, business.id)).filter((slot) => !occupied.has(slot));
        return available.length ? day : null;
      }))).filter(Boolean);
      return json({ month, available_dates: availableDates });
    }

    const occupied = new Set((data ?? []).map((row) => row.booking_time.slice(0, 5)));
    const available = (await slotsForDate(supabase, date!, business.id)).filter((slot) => !occupied.has(slot));

    return new Response(JSON.stringify({ date, available }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Error interno" }, 500);
  }
});
