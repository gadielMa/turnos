import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient, businessForSlug, isValidSlot } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const body = await req.json();
    const { name, dni, service, date, time, payment_id, business_slug } = body;

    const supabase = adminClient();
    const business = await businessForSlug(supabase, business_slug);
    const validId = business.public_profile?.locale === "pt-BR" ? /^\d{11}$/.test(String(dni)) : /^\d{7,8}$/.test(String(dni));
    if (!name || !validId || !service || !date || !time) {
      return json({ error: "Datos de reserva incompletos o inválidos" }, 400);
    }
    if (!(await isValidSlot(supabase, date, time, business.id))) {
      return json({ error: "Ese horario no está disponible para reservas" }, 400);
    }

    await supabase.rpc("cleanup_expired_bookings");
    const { data, error } = await supabase.from("bookings").insert({
      business_id: business.id,
      name: String(name).trim(),
      dni: String(dni),
      service,
      booking_date: date,
      booking_time: `${time}:00`,
      payment_id: payment_id || null,
      status: "pending",
    }).select("id, name, dni, service, booking_date, booking_time, status, expires_at").single();

    if (error) {
      if (error.code === "23505") return json({ error: "Ese horario acaba de ser reservado" }, 409);
      throw error;
    }
    await supabase.from("clients").upsert({ business_id: business.id, name: String(name).trim(), dni: String(dni) }, { onConflict: "business_id,dni" });
    return json({ booking: data }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Error interno" }, 500);
  }
});
