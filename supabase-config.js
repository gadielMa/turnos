// Estos dos valores son públicos y se obtienen desde Supabase > Settings > API.
// Nunca colocar aquí la service_role key ni credenciales de Google/Mercado Pago.
const SUPABASE_CONFIG = {
    URL: 'https://jbrjsvkdnyzptkxnflbe.supabase.co',
    ANON_KEY: 'sb_publishable_L7rQxIHg2i7gbuozJrgfWg_NjD3Elz1',
    BUSINESS_SLUG: 'brian'
};

function supabaseFunctionUrl(functionName) {
    if (!SUPABASE_CONFIG.URL) return '';
    return `${SUPABASE_CONFIG.URL.replace(/\/$/, '')}/functions/v1/${functionName}`;
}

function isSupabaseConfigured() {
    return Boolean(SUPABASE_CONFIG.URL && SUPABASE_CONFIG.ANON_KEY);
}
