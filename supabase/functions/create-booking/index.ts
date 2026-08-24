import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient, businessForSlug, isValidSlot } from "../_shared/supabase.ts";

// Used only by professionals who explicitly enabled reservations without an
// online payment. The slot is still validated and reserved atomically.
Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const { name, dni, service, date, time, business_slug } = await req.json();
    const supabase = adminClient();
    const business = await businessForSlug(supabase, business_slug);
    if (!business.public_profile?.booking_without_payment) return json({ error: "Este negocio requiere pago online" }, 403);

    const isBrazilian = business.public_profile?.locale === "pt-BR";
    const validId = isBrazilian ? /^\d{11}$/.test(String(dni)) : /^\d{7,8}$/.test(String(dni));
    if (!name || !validId || !date || !time) return json({ error: "Datos de reserva incompletos o inválidos" }, 400);
    if (!(await isValidSlot(supabase, date, time, business.id))) return json({ error: "Ese horario no está disponible para reservas" }, 400);

    const { data: booking, error: bookingError } = await supabase.from("bookings").insert({
      business_id: business.id,
      name: String(name).trim(),
      dni: String(dni),
      service: String(service || "consulta"),
      booking_date: date,
      booking_time: `${time}:00`,
      duration_minutes: Math.min(240, Math.max(15, Number(business.public_profile?.slot_minutes) || 60)),
      status: "confirmed",
      payment_method: "no_payment",
    }).select("id, name, service, booking_date, booking_time, status").single();

    if (bookingError) {
      if (bookingError.code === "23505" || bookingError.code === "23P01") return json({ error: "Ese horario acaba de ser reservado" }, 409);
      throw bookingError;
    }
    await supabase.from("clients").upsert({ business_id: business.id, name: String(name).trim(), dni: String(dni) }, { onConflict: "business_id,dni" });
    return json({ booking }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Error interno" }, 500);
  }
});
