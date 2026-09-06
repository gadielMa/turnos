import { adminClient } from "../_shared/supabase.ts";
import { handleOptions, json } from "../_shared/cors.ts";

async function userFromRequest(req: Request) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await adminClient().auth.getUser(token);
  return error ? null : data.user;
}

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "GET") return json({ error: "Método no permitido" }, 405);

  const user = await userFromRequest(req);
  if (!user) return json({ error: "Iniciá sesión para ver tus donaciones." }, 401);

  try {
    const supabase = adminClient();
    const { data: donations, error } = await supabase
      .from("soypobre_donations")
      .select("id, recipient_id, amount, status, created_at")
      .eq("donor_user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) throw error;

    const recipientIds = [...new Set((donations || []).map((donation) => donation.recipient_id))];
    const { data: recipients, error: recipientsError } = recipientIds.length
      ? await supabase.from("soypobre_requests").select("id, name, alias").in("id", recipientIds)
      : { data: [], error: null };
    if (recipientsError) throw recipientsError;
    const people = new Map((recipients || []).map((recipient) => [recipient.id, recipient]));

    return json({ donations: (donations || []).map((donation) => ({
      ...donation,
      recipient_name: people.get(donation.recipient_id)?.name || people.get(donation.recipient_id)?.alias || "Persona ayudada",
    })) });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "No pudimos cargar tus donaciones." }, 500);
  }
});
