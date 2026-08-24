import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";

// Resolve the signed-in professional's business server-side. This avoids
// browser-specific issues with nested PostgREST/RLS reads in embedded Safari.
Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "GET") return json({ error: "Método no permitido" }, 405);

  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Se requiere iniciar sesión" }, 401);

  try {
    const supabase = adminClient();
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return json({ error: "Sesión inválida" }, 401);

    const { data: membership, error: membershipError } = await supabase
      .from("business_members")
      .select("business_id, role")
      .eq("user_id", authData.user.id)
      .limit(1)
      .maybeSingle();
    if (membershipError) throw membershipError;
    if (!membership) return json({ error: "No tenés acceso a ningún negocio." }, 404);

    const { data: business, error: businessError } = await supabase
      .from("businesses")
      .select("id, name, slug")
      .eq("id", membership.business_id)
      .maybeSingle();
    if (businessError) throw businessError;
    if (!business) return json({ error: "No se encontró el negocio asignado." }, 404);

    return json({ business, role: membership.role });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Error interno" }, 500);
  }
});
