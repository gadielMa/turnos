import { adminClient } from "../_shared/supabase.ts";
import { handleOptions, json } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  try {
    const url = new URL(req.url);
    const country = url.searchParams.get("country") || "Argentina";
    const province = url.searchParams.get("province");
    const locality = url.searchParams.get("locality");
    const period = url.searchParams.get("period") || "month";
    const now = new Date();
    const since = period === "month" ? new Date(now.getFullYear(), now.getMonth(), 1).toISOString() : period === "quarter" ? new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString() : null;
    const supabase = adminClient();
    let donorsQuery = supabase.from("soypobre_donors").select("user_id, name, country, province, locality, ranking_consent").eq("country", country).eq("ranking_consent", true);
    if (province) donorsQuery = donorsQuery.eq("province", province);
    if (locality) donorsQuery = donorsQuery.eq("locality", locality);
    const { data: donors, error: donorsError } = await donorsQuery;
    if (donorsError) throw donorsError;
    const donorIds = (donors || []).map((donor) => donor.user_id);
    if (!donorIds.length) return json({ ranking: [], recent: [] });
    let donationsQuery = supabase.from("soypobre_donations").select("donor_user_id, recipient_id, amount").in("donor_user_id", donorIds).in("status", ["reported", "confirmed"]);
    if (since) donationsQuery = donationsQuery.gte("created_at", since);
    const { data: donations, error: donationsError } = await donationsQuery;
    if (donationsError) throw donationsError;
    let recentQuery = supabase.from("soypobre_donations")
      .select("donor_user_id, recipient_id, amount, created_at")
      .in("donor_user_id", donorIds)
      .in("status", ["reported", "confirmed"])
      .order("created_at", { ascending: false })
      .limit(2);
    if (since) recentQuery = recentQuery.gte("created_at", since);
    const { data: recentDonations, error: recentError } = await recentQuery;
    if (recentError) throw recentError;
    const recipientIds = [...new Set((recentDonations || []).map((donation) => donation.recipient_id))];
    const { data: recipients, error: recipientsError } = recipientIds.length
      ? await supabase.from("soypobre_requests").select("id, name, alias").in("id", recipientIds)
      : { data: [], error: null };
    if (recipientsError) throw recipientsError;
    const donorNames = new Map((donors || []).map((donor) => [donor.user_id, donor.name]));
    const recipientNames = new Map((recipients || []).map((recipient) => [recipient.id, recipient.name || recipient.alias || "una persona"]));
    const ranks = new Map((donors || []).map((donor) => [donor.user_id, { name: donor.name, amount: 0, recipients: new Set<string>() }]));
    (donations || []).forEach((donation) => {
      const entry = ranks.get(donation.donor_user_id);
      if (!entry) return;
      entry.amount += Number(donation.amount);
      entry.recipients.add(donation.recipient_id);
    });
    const ranking = [...ranks.values()]
      .filter((entry) => entry.amount > 0)
      .sort((a, b) => b.recipients.size - a.recipients.size || b.amount - a.amount)
      .slice(0, 100)
      .map((entry, index) => ({ rank: index + 1, name: entry.name, amount: entry.amount, recipients: entry.recipients.size }));
    const recent = (recentDonations || []).map((donation) => ({
      donor_name: donorNames.get(donation.donor_user_id) || "Una persona",
      recipient_name: recipientNames.get(donation.recipient_id) || "una persona",
      amount: Number(donation.amount),
      created_at: donation.created_at,
    }));
    return json({ ranking, recent });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "No pudimos calcular el ranking." }, 500);
  }
});
