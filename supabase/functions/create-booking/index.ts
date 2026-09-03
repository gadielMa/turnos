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
    const text = (spanish: string, portuguese: string) => business.public_profile?.locale === "pt-BR" ? portuguese : spanish;
    if (!business.public_profile?.booking_without_payment) return json({ error: text("Este negocio requiere pago online", "Este negócio exige pagamento online") }, 403);

    const isBrazilian = business.public_profile?.locale === "pt-BR";
    const validId = isBrazilian ? /^\d{11}$/.test(String(dni)) : /^\d{7,8}$/.test(String(dni));
    if (!name || !validId || !date || !time) return json({ error: text("Datos de reserva incompletos o inválidos", "Dados do agendamento incompletos ou inválidos") }, 400);
    const durationMinutes = Math.min(1440, Math.max(15, Number(business.public_profile?.slot_minutes) || 60));
    if (!(await isValidSlot(supabase, date, time, business.id, durationMinutes))) return json({ error: text("Ese horario no está disponible para reservas", "Este horário não está disponível para agendamento") }, 400);

    const { data: booking, error: bookingError } = await supabase.from("bookings").insert({
      business_id: business.id,
      name: String(name).trim(),
      dni: String(dni),
      service: String(service || "consulta"),
      booking_date: date,
      booking_time: `${time}:00`,
      duration_minutes: durationMinutes,
      status: "confirmed",
      payment_method: "no_payment",
    }).select("id, name, service, booking_date, booking_time, status").single();

    if (bookingError) {
      if (bookingError.code === "23505" || bookingError.code === "23P01") return json({ error: text("Ese horario acaba de ser reservado", "Este horário acabou de ser reservado") }, 409);
      throw bookingError;
    }
    await supabase.from("clients").upsert({ business_id: business.id, name: String(name).trim(), dni: String(dni), deleted_at: null }, { onConflict: "business_id,dni" });
    return json({ booking }, 201);
  } catch (error) {
    const message = error instanceof Error ? error.message : (typeof error === "object" && error && "message" in error ? String(error.message) : "Error interno");
    return json({ error: message === "Error interno" ? "Não foi possível confirmar o agendamento. Tente novamente." : message }, 500);
  }
});
