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
    const { recipient_id, amount, receipt_url, receipt_public_id } = await req.json();
    const parsedAmount = Number(amount);
    if (!recipient_id || !Number.isFinite(parsedAmount) || parsedAmount <= 0 || !receipt_url) {
      return json({ error: "Completá el monto y cargá el comprobante." }, 400);
    }
    const metadata = user.user_metadata || {};
    const supabase = adminClient();
    const { error: donorError } = await supabase.from("soypobre_donors").upsert({
      user_id: user.id,
      name: String(metadata.soypobre_donor_name).trim(),
      country: String(metadata.soypobre_donor_country || "Argentina").trim(),
      province: metadata.soypobre_donor_province ? String(metadata.soypobre_donor_province).trim() : null,
      locality: metadata.soypobre_donor_locality ? String(metadata.soypobre_donor_locality).trim() : null,
      ranking_consent: metadata.soypobre_donor_ranking_consent === true,
    }, { onConflict: "user_id" });
    if (donorError) throw donorError;
    const { data: donation, error } = await supabase.from("soypobre_donations").insert({
      donor_user_id: user.id,
      recipient_id,
      amount: parsedAmount,
      receipt_url,
      receipt_public_id: receipt_public_id || null,
      status: "reported",
    }).select("id, amount, created_at").single();
    if (error) throw error;
    return json({ donation }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "No pudimos registrar la transferencia." }, 500);
  }
});
