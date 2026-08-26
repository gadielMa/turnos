import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient, businessForSlug } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;

  try {
    const dni = new URL(req.url).searchParams.get("dni") || "";
    const businessSlug = new URL(req.url).searchParams.get("business") || "brian";

    const supabase = adminClient();
    const business = await businessForSlug(supabase, businessSlug);
    const validId = business.public_profile?.locale === "pt-BR" ? /^\d{11}$/.test(dni) : /^\d{7,8}$/.test(dni);
    if (!validId) return json({ error: "Documento inválido" }, 400);
    await supabase.rpc("cleanup_expired_bookings");
    const { data, error } = await supabase.from("bookings")
      .select("id, name, dni, service, booking_date, booking_time, status, created_at")
      .eq("business_id", business.id)
      .eq("dni", dni)
      .in("status", ["pending", "confirmed"])
      .order("booking_date", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    return json({ appointment: data });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Error interno" }, 500);
  }
});
