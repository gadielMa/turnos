import { handleOptions, json } from "../_shared/cors.ts";
import { adminClient, businessForSlug, isValidSlot } from "../_shared/supabase.ts";

type PublicService = {
  id: string;
  name: string;
  price: number;
};

Deno.serve(async (req) => {
  const options = handleOptions(req);
  if (options) return options;
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  try {
    const body = await req.json();
    const { name, dni, service, date, time, business_slug } = body;

    const supabase = adminClient();
    const business = await businessForSlug(supabase, business_slug);
    const isBrazilianProfile = business.public_profile?.locale === "pt-BR";
    const validId = isBrazilianProfile ? /^\d{11}$/.test(String(dni)) : /^\d{7,8}$/.test(String(dni));
    if (!name || !validId || !service || !date || !time) {
      return json({ error: "Datos de reserva incompletos o inválidos" }, 400);
    }
    const services = Array.isArray(business.public_profile?.services)
      ? business.public_profile.services as PublicService[]
      : [];
    const selectedService = services.find((item) => item.id === service && Number.isFinite(Number(item.price)));
    if (!selectedService) return json({ error: "El servicio seleccionado no está disponible" }, 400);
    const bookingDuration = Math.min(1440, Math.max(15, Number(business.public_profile?.slot_minutes) || 30));
    const configuredReservationAmount = Number(business.public_profile?.reservation_amount || 0);
    const configuredTestAmount = business.slug === "brian"
      ? Number(Deno.env.get("BRIAN_TEST_CHECKOUT_AMOUNT") || 0)
      : 0;
    // The business may publish a full consultation value and charge a separate
    // symbolic reservation amount through Checkout Pro during its launch.
    const price = configuredReservationAmount > 0
      ? configuredReservationAmount
      : (configuredTestAmount > 0 ? configuredTestAmount : Number(selectedService.price));
    // The public calendar and the checkout must validate against the same
    // duration. Brian publishes 30-minute slots; relying on isValidSlot's
    // 60-minute default made times such as 17:30 appear selectable and then
    // fail only after the customer submitted the form.
    if (!(await isValidSlot(supabase, date, time, business.id, bookingDuration))) {
      return json({ error: "Ese horario no está disponible para reservas" }, 400);
    }

    const directPaymentLink = business.slug === "brian" ? Deno.env.get("BRIAN_DIRECT_PAYMENT_LINK") : null;
    const useCheckoutPro = business.slug === "brian" && Deno.env.get("BRIAN_USE_CHECKOUT_PRO") === "true";
    const accessToken = Deno.env.get("MERCADOPAGO_ACCESS_TOKEN");
    if (!directPaymentLink && !accessToken) return json({ error: "Falta configurar un medio de pago" }, 500);

    await supabase.rpc("cleanup_expired_bookings");

    const { data: booking, error: bookingError } = await supabase.from("bookings").insert({
      business_id: business.id,
      name: String(name).trim(),
      dni: String(dni),
      deleted_at: null,
      service,
      booking_date: date,
      booking_time: `${time}:00`,
      duration_minutes: bookingDuration,
      status: "pending",
    }).select("id, name, dni, service, booking_date, booking_time, status, expires_at").single();

    if (bookingError) {
      if (bookingError.code === "23505" || bookingError.code === "23P01") return json({ error: "Ese horario acaba de ser reservado" }, 409);
      throw bookingError;
    }

    // El cliente pasa a formar parte de la agenda desde que inicia la reserva,
    // incluso si el checkout falla o decide volver a pagar más tarde.
    await supabase.from("clients").upsert({
      business_id: business.id,
      name: String(name).trim(),
      dni: String(dni),
    }, { onConflict: "business_id,dni" });

    // Brian uses a production $1 payment link during the controlled launch.
    // A fixed Mercado Pago link cannot carry the booking reference, so this
    // reservation remains pending until the payment is reviewed in the panel.
    if (directPaymentLink && !useCheckoutPro) {
      return json({ booking, preference_id: null, init_point: directPaymentLink, payment_mode: "manual_confirmation" }, 201);
    }

    const siteUrl = Deno.env.get("PUBLIC_SITE_URL") || "https://induliru.com";
    const turnsPath = Deno.env.get("PUBLIC_TURNS_PATH") || "";
    const bookingUrl = `${siteUrl.replace(/\/$/, "")}${turnsPath}/${business.slug}`;
    const returnDetails = new URLSearchParams({
      booking_date: date,
      booking_time: time,
      booking_name: String(name).trim(),
      booking_service: selectedService.name,
    }).toString();
    const backUrls = turnsPath
      ? {
        success: `${bookingUrl}?payment_status=approved&source=mercadopago&${returnDetails}`,
        failure: `${bookingUrl}?payment_status=failure&source=mercadopago&${returnDetails}`,
        pending: `${bookingUrl}?payment_status=pending&source=mercadopago&${returnDetails}`,
      }
      : {
        success: `${siteUrl}/exito.html?payment_status=approved&source=mercadopago`,
        failure: `${siteUrl}/?payment_status=failure&source=mercadopago`,
        pending: `${siteUrl}/?payment_status=pending&source=mercadopago`,
      };
    const webhookUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook`;
    const preferenceResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        items: [{
          id: service,
          title: selectedService.name,
          quantity: 1,
          currency_id: "ARS",
          unit_price: price,
        }],
        external_reference: booking.id,
        back_urls: backUrls,
        auto_return: "approved",
        notification_url: webhookUrl,
      }),
    });

    const preference = await preferenceResponse.json();
    if (!preferenceResponse.ok) {
      console.error("Mercado Pago preference error", preference);
      await supabase.from("bookings").update({ status: "cancelled" }).eq("id", booking.id).eq("status", "pending");
      return json({ error: "No se pudo crear la preferencia de pago" }, 502);
    }

    await supabase.from("bookings")
      .update({ payment_id: preference.id })
      .eq("id", booking.id);
    return json({
      booking,
      preference_id: preference.id,
      init_point: preference.init_point || preference.sandbox_init_point,
    }, 201);
  } catch (error) {
    console.error("create-preference error", error);
    const message = error instanceof Error
      ? error.message
      : (typeof error === "object" && error && "message" in error ? String(error.message) : "");
    return json({ error: message || "No se pudo iniciar el pago. Intentá nuevamente." }, 500);
  }
});
