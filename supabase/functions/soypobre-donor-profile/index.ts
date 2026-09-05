import { adminClient } from "../_shared/supabase.ts";
import { handleOptions, json } from "../_shared/cors.ts";

async function donorFromRequest(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user?.user_metadata?.soypobre_donor_name) return null;
  return data.user;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);
  const user = await donorFromRequest(req);
  if (!user) return json({ error: "Iniciá sesión como donante" }, 401);
  try {
    const { name, country, province, locality } = await req.json();
    if (!String(name || "").trim() || !String(country || "").trim() || !String(province || "").trim() || !String(locality || "").trim()) return json({ error: "Completá nombre, país, provincia y localidad." }, 400);
    const supabase = adminClient();
    const nextMetadata = { ...user.user_metadata, soypobre_donor_name: String(name).trim(), soypobre_donor_country: String(country).trim(), soypobre_donor_province: String(province).trim(), soypobre_donor_locality: String(locality).trim() };
    const { error: authError } = await supabase.auth.admin.updateUserById(user.id, { user_metadata: nextMetadata });
    if (authError) throw authError;
    const { error } = await supabase.from("soypobre_donors").upsert({ user_id: user.id, name: nextMetadata.soypobre_donor_name, country: nextMetadata.soypobre_donor_country, province: nextMetadata.soypobre_donor_province, locality: nextMetadata.soypobre_donor_locality, ranking_consent: nextMetadata.soypobre_donor_ranking_consent === true }, { onConflict: "user_id" });
    if (error) throw error;
    return json({ profile: { name: nextMetadata.soypobre_donor_name, country: nextMetadata.soypobre_donor_country, province: nextMetadata.soypobre_donor_province, locality: nextMetadata.soypobre_donor_locality } });
  } catch (error) {
    const message = error instanceof Error ? error.message : (typeof error === "object" && error && "message" in error ? String(error.message) : "");
    return json({ error: message || "No pudimos guardar tus datos." }, 500);
  }
});
