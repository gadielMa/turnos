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
  if (!await donorFromRequest(req)) return json({ error: "Iniciá sesión como donante" }, 401);

  try {
    const url = new URL(req.url);
    const country = url.searchParams.get("country") || "Argentina";
    const province = url.searchParams.get("province");
    const locality = url.searchParams.get("locality");
    const supabase = adminClient();
    let query = supabase
      .from("soypobre_requests")
      .select("id, name, alias, cbu, story, photo_path, photo_url, country, province, locality, created_at")
      .eq("country", country)
      .order("created_at", { ascending: false })
      .limit(60);
    if (province) query = query.eq("province", province);
    if (locality) query = query.eq("locality", locality);
    const { data, error } = await query;
    if (error) throw error;
    const profiles = await Promise.all((data || []).map(async (profile) => {
      let photoUrl = profile.photo_url;
      if (!photoUrl && profile.photo_path) {
        const signed = await supabase.storage.from("soypobre-images").createSignedUrl(profile.photo_path, 3600);
        photoUrl = signed.data?.signedUrl || null;
      }
      return { ...profile, photo_url: photoUrl, cbu: profile.cbu || null, alias: profile.alias || null };
    }));
    return json({ profiles });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "No pudimos cargar las historias." }, 500);
  }
});
