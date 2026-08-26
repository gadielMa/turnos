import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient } from "../_shared/supabase.ts";

const colorPattern = /^#[0-9a-f]{6}$/i;

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "No autorizado" }, 401);
    const admin = adminClient();
    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "No autorizado" }, 401);

    const { business_id, workplaces } = await req.json();
    if (!business_id || !Array.isArray(workplaces) || workplaces.length < 1 || workplaces.length > 20) return json({ error: "Datos de lugares inválidos" }, 400);
    const ids = new Set<string>();
    for (const workplace of workplaces) {
      const id = String(workplace?.id || "");
      const name = String(workplace?.name || "").trim();
      const color = String(workplace?.color || "");
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || !name || name.length > 60 || !colorPattern.test(color) || ids.has(id)) return json({ error: "Cada lugar necesita nombre, identificador y color válidos" }, 400);
      ids.add(id);
    }

    const { data: profile } = await admin.from("profiles").select("role").eq("id", userData.user.id).maybeSingle();
    const { data: membership } = await admin.from("business_members").select("role").eq("business_id", business_id).eq("user_id", userData.user.id).maybeSingle();
    if (profile?.role !== "platform_owner" && !membership?.role) return json({ error: "No tenés acceso a este negocio" }, 403);
    if (profile?.role !== "platform_owner" && !["owner", "admin"].includes(membership.role)) return json({ error: "No tenés permisos para modificar lugares" }, 403);

    const { data: business, error: businessError } = await admin.from("businesses").select("public_profile").eq("id", business_id).single();
    if (businessError || !business) return json({ error: "Negocio no encontrado" }, 404);
    const { error } = await admin.from("businesses").update({ public_profile: { ...(business.public_profile || {}), workplaces } }).eq("id", business_id);
    if (error) throw error;
    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "No se pudieron guardar los lugares" }, 500);
  }
});
