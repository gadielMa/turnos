const supabaseClient = window.supabase.createClient(SUPABASE_CONFIG.URL, SUPABASE_CONFIG.ANON_KEY);
const loginView = document.getElementById('loginView');
const dashboard = document.getElementById('dashboard');
const businessDashboard = document.getElementById('businessDashboard');
const businessSlug = new URLSearchParams(window.location.search).get('business');
const isPlatformOwnerRoute = window.location.pathname.includes('/adminadmin');
let currentBusiness = null;
let platformOwnerBusinessAccess = false;
let scheduleCalendar = null;
let appointmentsCalendar = null;
let scheduleRules = [];
let editingRuleIndex = null;
let editingClientId = null;
let pendingClientDeleteId = null;
let emailClientId = null;
const earlyHoursVisible = { appointments: false, schedule: false };
const ARGENTINA_HOLIDAYS_2026 = {
  '2026-01-01': 'Año Nuevo', '2026-02-16': 'Carnaval', '2026-02-17': 'Carnaval',
  '2026-03-23': 'Feriado turístico', '2026-03-24': 'Día Nacional de la Memoria',
  '2026-04-02': 'Día del Veterano y de los Caídos en Malvinas', '2026-04-03': 'Viernes Santo',
  '2026-05-01': 'Día del Trabajo', '2026-05-25': 'Revolución de Mayo', '2026-06-15': 'Paso a la Inmortalidad de Güemes',
  '2026-06-20': 'Paso a la Inmortalidad de Belgrano', '2026-07-09': 'Día de la Independencia', '2026-07-10': 'Feriado turístico',
  '2026-08-17': 'Paso a la Inmortalidad de San Martín', '2026-10-12': 'Día del Respeto a la Diversidad Cultural',
  '2026-11-23': 'Día de la Soberanía Nacional', '2026-12-07': 'Feriado turístico', '2026-12-08': 'Inmaculada Concepción', '2026-12-25': 'Navidad',
};
function argentinaHoliday(date) { return ARGENTINA_HOLIDAYS_2026[dateOnly(date)] || null; }

function showMessage(element, message, type) { element.textContent = message; element.className = `admin-message ${type}`; }
function showNotice(title, details) {
  document.getElementById('noticeTitle').textContent = title;
  const body = document.getElementById('noticeBody');
  body.replaceChildren();
  details.forEach(([label, value]) => {
    const line = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = `${label}: `;
    line.append(strong, value);
    body.appendChild(line);
  });
  document.getElementById('noticeModal').classList.add('open');
}
function closeNotice() { document.getElementById('noticeModal').classList.remove('open'); }
function showView(authenticated) { loginView.style.display = authenticated ? 'none' : 'block'; dashboard.style.display = 'none'; businessDashboard.style.display = 'none'; document.getElementById('clientsPanel').classList.remove('active'); document.getElementById('billingPanel').classList.remove('active'); }
function friendlyAdminUrl(route) {
  const match = window.location.pathname.match(/^(.*)\/(?:adminadmin|admin)(?:\/index\.html)?\/?$/);
  if (match) return `${match[1]}/${route}/`;
  return `${window.location.origin}${window.location.pathname.replace(/(?:adminadmin|admin)(?:\.html)?\/?$/, `${route}/`)}`;
}
function dateOnly(date) { return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }
function parseDate(value) { return new Date(`${value}T12:00:00`); }
function addDays(date, days) { const next = new Date(date); next.setDate(next.getDate() + days); return next; }
function dateDiff(a, b) { return Math.round((parseDate(a) - parseDate(b)) / 86400000); }
function dateRangeDates(start, end) { const dates = []; for (let date = new Date(start); date < end; date = addDays(date, 1)) dates.push(new Date(date)); return dates; }

function ruleApplies(rule, date) {
  const value = dateOnly(date);
  if (!rule.active || value < rule.start_date || (rule.until_date && value > rule.until_date)) return false;
  const days = dateDiff(value, rule.start_date);
  if (rule.frequency === 'once') return value === rule.start_date;
  if (rule.frequency === 'weekly') return rule.weekdays.includes(parseDate(value).getDay()) && Math.floor(days / 7) % rule.interval_count === 0;
  const start = parseDate(rule.start_date);
  const current = parseDate(value);
  const months = (current.getFullYear() - start.getFullYear()) * 12 + current.getMonth() - start.getMonth();
  return current.getDate() === start.getDate() && months >= 0 && months % rule.interval_count === 0;
}

function eventDataForRange(start, end) {
  return scheduleRules.flatMap((rule, index) => dateRangeDates(start, end).filter((date) => ruleApplies(rule, date)).map((date) => ({
    id: `${rule.id || 'new'}-${dateOnly(date)}`,
    title: rule.title || 'Disponible',
    start: `${dateOnly(date)}T${rule.start_time.slice(0, 5)}:00`,
    end: `${dateOnly(date)}T${rule.end_time.slice(0, 5)}:00`,
    extendedProps: { ruleIndex: index },
  })));
}

function refreshCalendar() { if (scheduleCalendar) scheduleCalendar.refetchEvents(); }

function calendarToolbar() {
  return window.matchMedia('(max-width: 720px)').matches
    ? { left: 'prev,next', center: 'title', right: '' }
    : { left: 'prev,next today', center: 'title', right: 'timeGridWeek,dayGridMonth' };
}

function calendarDensity() {
  return window.matchMedia('(max-width: 720px)').matches
    ? { dayHeaderFormat: { weekday: 'narrow', day: 'numeric' }, slotDuration: '00:30:00' }
    : { dayHeaderFormat: { weekday: 'short', day: 'numeric', month: 'numeric' }, slotDuration: '00:15:00' };
}

async function loadAppointmentsCalendar() {
  const { data: bookings, error } = await supabaseClient
    .from('bookings')
    .select('id, name, service, booking_date, booking_time, status, payment_method')
    .eq('business_id', currentBusiness.id)
    .in('status', ['pending', 'confirmed', 'cancelled'])
    .order('booking_date').order('booking_time');
  if (error) throw error;

  const serviceNames = serviceNamesForCurrentBusiness();
  const events = (bookings || []).map((booking) => {
    const start = `${booking.booking_date}T${booking.booking_time.slice(0, 8)}`;
    const end = new Date(`${start}-03:00`);
    end.setMinutes(end.getMinutes() + bookingDurationMinutes());
    const paid = booking.payment_method === 'mercadopago' && booking.status === 'confirmed';
    const cash = booking.payment_method === 'cash';
    const color = paid ? '#2e9d58' : cash ? '#d84a4a' : '#d49b2a';
    return { id: `booking-${booking.id}`, title: `${booking.name} · ${serviceNames[booking.service] || booking.service}`, start, end: end.toISOString(), backgroundColor: color, borderColor: color, extendedProps: { booking } };
  });

  appointmentsCalendar?.destroy();
  appointmentsCalendar = new FullCalendar.Calendar(document.getElementById('appointmentsCalendar'), {
    initialView: 'timeGridWeek', initialDate: new Date(), locale: 'es', firstDay: 1, allDaySlot: false,
    buttonText: { today: 'Hoy', month: 'Mes', week: 'Semana', day: 'Día', list: 'Lista' },
    slotMinTime: '06:00:00', slotMaxTime: '24:00:00', slotLabelInterval: '01:00:00', height: 'auto',
    headerToolbar: calendarToolbar(), events, ...calendarDensity(),
    eventClick: (info) => { const booking = info.event.extendedProps.booking; showNotice('Detalle del turno', [['Cliente', booking.name], ['Servicio', serviceNames[booking.service] || booking.service], ['Fecha y hora', `${booking.booking_date} · ${booking.booking_time.slice(0, 5)}`], ['Estado', booking.status === 'confirmed' ? 'Confirmado' : booking.status]]); },
  });
  appointmentsCalendar.render();
}

async function loadClients() {
  const { data, error } = await supabaseClient.from('clients').select('id, name, dni, email, whatsapp').eq('business_id', currentBusiness.id).order('name');
  if (error) throw error;
  const list = document.getElementById('clientsList');
  list.replaceChildren();
  (data || []).forEach((client) => {
    const row = document.createElement('tr');
    const name = document.createElement('td'); name.textContent = client.name;
    const dni = document.createElement('td'); dni.textContent = client.dni;
    const contact = document.createElement('td'); contact.className = 'client-contact';
    if (client.email) {
      const emailText = document.createElement('span'); emailText.textContent = client.email; contact.appendChild(emailText);
    }
    if (client.whatsapp) {
      const whatsappText = document.createElement('span'); whatsappText.textContent = client.email ? ` · ${client.whatsapp}` : client.whatsapp; contact.appendChild(whatsappText);
    }
    if (!client.email && !client.whatsapp) contact.textContent = '—';
    const actions = document.createElement('td'); actions.className = 'client-actions';
    if (client.email) {
      const email = document.createElement('button'); email.type = 'button'; email.className = 'client-email-button client-action'; email.dataset.action = 'email'; email.dataset.id = client.id; email.dataset.name = client.name; email.dataset.email = client.email; email.title = `Enviar email a ${client.email}`; email.innerHTML = '<i class="fas fa-envelope"></i> Mail'; actions.appendChild(email);
    }
    if (client.whatsapp) {
      const whatsapp = document.createElement('a'); whatsapp.className = 'client-whatsapp-link client-action'; whatsapp.href = `https://wa.me/${String(client.whatsapp).replace(/\D/g, '')}`; whatsapp.target = '_blank'; whatsapp.rel = 'noopener'; whatsapp.title = `Abrir WhatsApp de ${client.whatsapp}`; whatsapp.innerHTML = '<i class="fab fa-whatsapp"></i> Wsp'; actions.appendChild(whatsapp);
    }
    const edit = document.createElement('button'); edit.className = 'client-action client-edit'; edit.dataset.action = 'edit'; edit.dataset.id = client.id; edit.dataset.name = client.name; edit.dataset.dni = client.dni; edit.dataset.email = client.email || ''; edit.dataset.whatsapp = client.whatsapp || ''; edit.textContent = 'Editar';
    const remove = document.createElement('button'); remove.className = 'client-action client-delete'; remove.dataset.action = 'delete'; remove.dataset.id = client.id; remove.dataset.name = client.name; remove.dataset.dni = client.dni; remove.textContent = 'Eliminar';
    actions.append(edit, remove); row.append(name, dni, contact, actions); list.appendChild(row);
  });
}

async function loadPlatformBusinesses() {
  const list = document.getElementById('businessListItems');
  list.replaceChildren();
  const { data: businesses, error: businessesError } = await supabaseClient
    .from('businesses')
    .select('id, name, slug, status')
    .order('name');
  if (businessesError) throw businessesError;

  const { data: memberships, error: membershipsError } = await supabaseClient
    .from('business_members')
    .select('business_id, user_id')
    .eq('role', 'owner');
  if (membershipsError) throw membershipsError;

  const ownerIds = [...new Set((memberships || []).map((membership) => membership.user_id))];
  const { data: profiles, error: profilesError } = ownerIds.length
    ? await supabaseClient.from('profiles').select('id, full_name').in('id', ownerIds)
    : { data: [], error: null };
  if (profilesError) throw profilesError;
  const profileById = new Map((profiles || []).map((profile) => [profile.id, profile.full_name]));
  const ownerByBusiness = new Map((memberships || []).map((membership) => [membership.business_id, profileById.get(membership.user_id)]));

  if (!businesses?.length) {
    const empty = document.createElement('p');
    empty.className = 'business-empty';
    empty.textContent = 'Todavía no hay negocios creados.';
    list.appendChild(empty);
    return;
  }

  businesses.forEach((business) => {
    const item = document.createElement('article');
    item.className = 'business-item';
    const details = document.createElement('div');
    const title = document.createElement('strong');
    title.textContent = business.name;
    const owner = document.createElement('small');
    owner.textContent = `${ownerByBusiness.get(business.id) || 'Masajista'} · /${business.slug}`;
    details.append(title, owner);
    const enter = document.createElement('button');
    enter.type = 'button';
    enter.className = 'business-enter';
    enter.textContent = 'Ingresar';
    enter.addEventListener('click', () => {
      sessionStorage.setItem('platformBusinessAccess', business.slug);
      window.location.assign(`${window.location.pathname}?business=${encodeURIComponent(business.slug)}`);
    });
    item.append(details, enter);
    list.appendChild(item);
  });
}

function businessServices() { return Array.isArray(currentBusiness?.public_profile?.services) ? currentBusiness.public_profile.services : []; }
function serviceNamesForCurrentBusiness() { return Object.fromEntries(businessServices().map((service) => [service.id, service.name])); }
function servicePricesForCurrentBusiness() { return Object.fromEntries(businessServices().map((service) => [service.id, Number(service.price) || 0])); }
function bookingDurationMinutes() { return Number(currentBusiness?.public_profile?.slot_minutes) || 60; }
function formatMoney(value) { return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value); }
function renderBusinessServices() {
  const container = document.getElementById('businessServices');
  if (!container) return;
  container.replaceChildren();
  const services = businessServices();
  if (!services.length) {
    const empty = document.createElement('p');
    empty.textContent = 'Todavía no hay servicios configurados.';
    container.appendChild(empty);
    return;
  }
  services.forEach((service) => {
    const card = document.createElement('article');
    card.className = 'service-summary-card';
    const name = document.createElement('strong');
    name.textContent = service.name;
    const price = document.createElement('span');
    price.textContent = formatMoney(Number(service.price) || 0);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.dataset.serviceId = service.id;
    remove.textContent = 'Eliminar servicio';
    card.append(name, price, remove);
    container.appendChild(card);
  });
}
function serviceIdFromName(name) {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
async function saveBusinessServices(services) {
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const response = await fetch(supabaseFunctionUrl('update-business-services'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_CONFIG.ANON_KEY, Authorization: `Bearer ${sessionData.session?.access_token || ''}` },
    body: JSON.stringify({ business_id: currentBusiness.id, services }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'No se pudieron guardar los servicios');
  currentBusiness.public_profile = { ...(currentBusiness.public_profile || {}), services };
  renderBusinessServices();
}
function ensureBillingMonths() {
  const select = document.getElementById('billingMonth');
  if (select.options.length) return;
  const now = new Date();
  for (let offset = -12; offset <= 12; offset++) {
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    const value = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    const option = document.createElement('option'); option.value = value;
    const label = new Intl.DateTimeFormat('es-AR', { month: 'long', year: 'numeric' }).format(date);
    option.textContent = `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
    select.appendChild(option);
  }
  select.value = dateOnly(now).slice(0, 7);
}
async function loadBilling() {
  const month = document.getElementById('billingMonth').value || dateOnly(new Date()).slice(0, 7);
  document.getElementById('billingMonth').value = month;
  const [year, monthNumber] = month.split('-').map(Number);
  const start = `${month}-01`;
  const next = new Date(year, monthNumber, 1);
  const end = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
  const { data, error } = await supabaseClient.from('bookings').select('name, service, status, payment_method').eq('business_id', currentBusiness.id).eq('status', 'confirmed').gte('booking_date', start).lt('booking_date', end);
  if (error) throw error;
  const prices = servicePricesForCurrentBusiness();
  const names = serviceNamesForCurrentBusiness();
  const paid = (data || []).filter((booking) => booking.payment_method !== 'pending');
  const total = paid.reduce((sum, booking) => sum + (prices[booking.service] || 0), 0);
  document.getElementById('billingTotal').textContent = formatMoney(total);
  document.getElementById('billingCount').textContent = String(paid.length);
  document.getElementById('billingAverage').textContent = formatMoney(paid.length ? total / paid.length : 0);
  const byService = {}; const byClient = {};
  paid.forEach((booking) => { const service = booking.service; const client = booking.name; byService[service] ||= { count: 0, total: 0 }; byClient[client] ||= { count: 0, total: 0 }; byService[service].count++; byService[service].total += prices[service] || 0; byClient[client].count++; byClient[client].total += prices[service] || 0; });
  const fillRows = (elementId, rows, labelNames) => { const body = document.getElementById(elementId); body.replaceChildren(); Object.entries(rows).sort((a, b) => b[1].total - a[1].total).forEach(([label, values]) => { const row = document.createElement('tr'); const name = document.createElement('td'); name.textContent = labelNames?.[label] || label; const count = document.createElement('td'); count.textContent = values.count; const amount = document.createElement('td'); amount.textContent = formatMoney(values.total); row.append(name, count, amount); body.appendChild(row); }); };
  fillRows('billingServices', byService, names); fillRows('billingClients', byClient);
}

function openScheduleModal({ ruleIndex = null, date, start = '14:00', end = '15:00' }) {
  editingRuleIndex = ruleIndex;
  const rule = ruleIndex === null ? null : scheduleRules[ruleIndex];
  document.getElementById('scheduleModalTitle').textContent = rule ? 'Editar horario' : 'Nuevo horario';
  document.getElementById('scheduleDate').value = rule?.start_date || date;
  document.getElementById('scheduleStart').value = (rule?.start_time || start).slice(0, 5);
  document.getElementById('scheduleEnd').value = (rule?.end_time || end).slice(0, 5);
  document.getElementById('scheduleFrequency').value = rule?.frequency || 'once';
  document.getElementById('scheduleInterval').value = rule?.interval_count || 1;
  document.getElementById('scheduleOccurrences').value = rule?.occurrences || '';
  document.getElementById('scheduleUntil').value = rule?.until_date || '';
  document.getElementById('scheduleDelete').style.display = rule ? 'inline-block' : 'none';
  document.getElementById('scheduleModal').classList.add('open');
}

function closeScheduleModal() { document.getElementById('scheduleModal').classList.remove('open'); editingRuleIndex = null; }

async function loadBusinessDashboard(user, allowPlatformOwner = platformOwnerBusinessAccess) {
  if (!businessSlug) return false;
  const { data: business, error: businessError } = await supabaseClient.from('businesses').select('id, name, slug, public_profile').eq('slug', businessSlug).maybeSingle();
  if (businessError || !business) throw new Error('No se encontró ese negocio');
  const { data: membership, error: membershipError } = await supabaseClient.from('business_members').select('role').eq('business_id', business.id).eq('user_id', user.id).maybeSingle();
  if ((membershipError || !membership) && !allowPlatformOwner) throw new Error('No tenés acceso a este negocio');

  currentBusiness = business;
  document.getElementById('businessTitle').textContent = business.name;
  renderBusinessServices();
  businessDashboard.style.display = 'block';
  let { data: rules, error: rulesError } = await supabaseClient.from('availability_rules').select('*').eq('business_id', business.id).order('start_date');
  if (rulesError) throw rulesError;
  scheduleRules = rules || [];
  scheduleCalendar?.destroy();
  scheduleCalendar = new FullCalendar.Calendar(document.getElementById('hoursCalendar'), {
    initialView: 'timeGridWeek', initialDate: new Date(), locale: 'es', firstDay: 1, allDaySlot: false,
    buttonText: { today: 'Hoy', month: 'Mes', week: 'Semana', day: 'Día', list: 'Lista' },
    slotMinTime: '06:00:00', slotMaxTime: '24:00:00', snapDuration: '00:15:00', slotLabelInterval: '01:00:00', height: 'auto', editable: true, selectable: true,
    headerToolbar: calendarToolbar(), ...calendarDensity(),
    events: (info, success) => success(eventDataForRange(info.start, info.end)),
    dayCellClassNames: (info) => {
      const classes = [];
      if (info.date.getDay() === 0) classes.push('sunday-cell');
      if (argentinaHoliday(info.date)) classes.push('argentina-holiday');
      return classes;
    },
    selectAllow: (info) => !argentinaHoliday(info.start) && info.start.getDay() !== 0,
    select: (info) => openScheduleModal({ date: dateOnly(info.start), start: info.startStr.slice(11, 16), end: info.endStr.slice(11, 16) }),
    dateClick: (info) => {
      if (argentinaHoliday(info.date) || info.date.getDay() === 0) return;
      openScheduleModal({ date: dateOnly(info.date), start: info.dateStr.slice(11, 16) || '14:00', end: new Date(info.date.getTime() + 30 * 60000).toTimeString().slice(0, 5) });
    },
    eventClick: (info) => openScheduleModal({ ruleIndex: info.event.extendedProps.ruleIndex, date: dateOnly(info.event.start), start: info.event.start.toTimeString(), end: info.event.end.toTimeString() }),
    eventChange: (info) => {
      const index = info.event.extendedProps.ruleIndex;
      if (index === undefined || !info.event.start || !info.event.end) return;
      const rule = scheduleRules[index];
      rule.start_date = dateOnly(info.event.start);
      rule.start_time = info.event.start.toTimeString().slice(0, 8);
      rule.end_time = info.event.end.toTimeString().slice(0, 8);
      if (rule.frequency === 'weekly') rule.weekdays = [info.event.start.getDay()];
    },
  });
  scheduleCalendar.render();
  await loadAppointmentsCalendar();
  await loadClients();
  requestAnimationFrame(() => {
    scheduleCalendar?.updateSize();
    appointmentsCalendar?.updateSize();
  });
  return true;
}

async function refreshSession() {
  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) return showView(false);
  try {
    const { data: profile, error } = await supabaseClient.from('profiles').select('role').eq('id', data.session.user.id).single();
    if (error) throw error;
    showView(true);
    if (profile.role === 'platform_owner' && !isPlatformOwnerRoute) throw new Error('Esta URL es solo para profesionales. Ingresá por /adminadmin.');
    if (profile.role !== 'platform_owner' && isPlatformOwnerRoute) throw new Error('Esta URL es solo para administración general. Ingresá por /admin.');
    if (profile.role === 'platform_owner' && !businessSlug) {
      dashboard.style.display = 'block';
      try {
        await loadPlatformBusinesses();
      } catch (error) {
        const list = document.getElementById('businessListItems');
        list.replaceChildren();
        const failure = document.createElement('p');
        failure.className = 'business-empty';
        failure.textContent = `No se pudieron cargar los negocios: ${error.message}`;
        list.appendChild(failure);
      }
    }
    else if (!businessSlug) {
      const { data: memberships, error: membershipError } = await supabaseClient
        .from('business_members')
        .select('business_id, businesses(slug)')
        .eq('user_id', data.session.user.id)
        .limit(1);
      if (membershipError || !memberships?.length || !memberships[0].businesses?.slug) throw new Error('No tenés acceso a ningún negocio. Este usuario todavía no fue asignado a un negocio.');
      window.location.replace(`${window.location.pathname}?business=${encodeURIComponent(memberships[0].businesses.slug)}`);
      return;
    } else {
      const platformBusinessAccess = sessionStorage.getItem('platformBusinessAccess');
      const allowPlatformOwner = profile.role === 'platform_owner' && platformBusinessAccess === businessSlug;
      platformOwnerBusinessAccess = allowPlatformOwner;
      if (allowPlatformOwner) sessionStorage.removeItem('platformBusinessAccess');
      await loadBusinessDashboard(data.session.user, allowPlatformOwner);
    }
  } catch (error) { await supabaseClient.auth.signOut(); showMessage(document.getElementById('loginMessage'), error.message, 'error'); showView(false); }
}

document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = event.target.querySelector('button'); button.disabled = true;
  const { error } = await supabaseClient.auth.signInWithPassword({ email: document.getElementById('loginEmail').value.trim(), password: document.getElementById('loginPassword').value });
  button.disabled = false; if (error) return showMessage(document.getElementById('loginMessage'), error.message, 'error'); await refreshSession();
});
for (const id of ['logoutBtn', 'businessLogoutBtn']) document.getElementById(id).addEventListener('click', async () => { await supabaseClient.auth.signOut(); platformOwnerBusinessAccess = false; sessionStorage.removeItem('platformBusinessAccess'); showView(false); });

function showPlatformPanel(panelId, tabId) {
  const list = document.getElementById('businessListItems');
  document.querySelectorAll('.platform-panel').forEach((panel) => panel.classList.toggle('active', panel.id === panelId));
  document.querySelectorAll('#dashboard .panel-tab').forEach((tab) => tab.classList.toggle('active', tab.id === tabId));
  if (panelId === 'reviewBusinessesPanel') {
    list.replaceChildren();
    const loading = document.createElement('p');
    loading.className = 'business-empty';
    loading.textContent = 'Cargando negocios...';
    list.appendChild(loading);
    loadPlatformBusinesses().catch((error) => {
      list.replaceChildren();
      const failure = document.createElement('p');
      failure.className = 'business-empty';
      failure.textContent = `No se pudieron cargar los negocios: ${error.message}`;
      list.appendChild(failure);
    });
  }
}
window.showPlatformPanel = showPlatformPanel;
document.getElementById('dashboard').addEventListener('click', (event) => {
  const tab = event.target.closest('#createBusinessTab, #reviewBusinessesTab');
  if (!tab) return;
  showPlatformPanel(tab.id === 'reviewBusinessesTab' ? 'reviewBusinessesPanel' : 'createBusinessPanel', tab.id);
});

document.getElementById('appointmentsTab').addEventListener('click', () => {
  document.getElementById('appointmentsTab').classList.add('active'); document.getElementById('scheduleTab').classList.remove('active');
  document.getElementById('clientsTab').classList.remove('active'); document.getElementById('billingTab').classList.remove('active'); document.getElementById('appointmentsPanel').classList.add('active'); document.getElementById('schedulePanel').classList.remove('active'); document.getElementById('clientsPanel').classList.remove('active'); document.getElementById('billingPanel').classList.remove('active');
  appointmentsCalendar?.updateSize();
});
document.getElementById('scheduleTab').addEventListener('click', () => {
  document.getElementById('scheduleTab').classList.add('active'); document.getElementById('appointmentsTab').classList.remove('active'); document.getElementById('clientsTab').classList.remove('active'); document.getElementById('billingTab').classList.remove('active');
  document.getElementById('schedulePanel').classList.add('active'); document.getElementById('appointmentsPanel').classList.remove('active'); document.getElementById('clientsPanel').classList.remove('active'); document.getElementById('billingPanel').classList.remove('active');
  scheduleCalendar?.updateSize();
});
document.getElementById('newScheduleButton').addEventListener('click', () => openScheduleModal({ date: dateOnly(new Date()), start: '14:00', end: '15:00' }));
document.getElementById('serviceForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = document.getElementById('servicesMessage');
  const name = document.getElementById('serviceName').value.trim();
  const id = serviceIdFromName(name);
  const price = Number(document.getElementById('servicePrice').value);
  const description = document.getElementById('serviceDescription').value.trim();
  if (!id || !Number.isFinite(price) || price <= 0) return showMessage(message, 'Completá un nombre y un precio válido.', 'error');
  const services = businessServices();
  if (services.some((service) => service.id === id)) return showMessage(message, 'Ya existe un servicio con ese nombre.', 'error');
  try {
    await saveBusinessServices([...services, { id, name, price, description }]);
    event.target.reset();
    showMessage(message, 'Servicio agregado correctamente.', 'success');
  } catch (error) { showMessage(message, error.message, 'error'); }
});
document.getElementById('businessServices').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-service-id]');
  if (!button) return;
  const services = businessServices().filter((service) => service.id !== button.dataset.serviceId);
  try { await saveBusinessServices(services); showMessage(document.getElementById('servicesMessage'), 'Servicio eliminado.', 'success'); }
  catch (error) { showMessage(document.getElementById('servicesMessage'), error.message, 'error'); }
});
document.getElementById('clientsTab').addEventListener('click', () => {
  document.getElementById('clientsTab').classList.add('active'); document.getElementById('appointmentsTab').classList.remove('active'); document.getElementById('scheduleTab').classList.remove('active'); document.getElementById('billingTab').classList.remove('active');
  document.getElementById('clientsPanel').classList.add('active'); document.getElementById('appointmentsPanel').classList.remove('active'); document.getElementById('schedulePanel').classList.remove('active'); document.getElementById('billingPanel').classList.remove('active');
});
document.getElementById('billingTab').addEventListener('click', async () => {
  document.getElementById('billingTab').classList.add('active'); document.getElementById('appointmentsTab').classList.remove('active'); document.getElementById('scheduleTab').classList.remove('active'); document.getElementById('clientsTab').classList.remove('active');
  document.getElementById('billingPanel').classList.add('active'); document.getElementById('appointmentsPanel').classList.remove('active'); document.getElementById('schedulePanel').classList.remove('active'); document.getElementById('clientsPanel').classList.remove('active');
  ensureBillingMonths();
  try { await loadBilling(); } catch (error) { showMessage(document.getElementById('appointmentsMessage'), error.message, 'error'); }
});
document.getElementById('billingMonth').addEventListener('change', () => loadBilling());

document.getElementById('clientForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const name = document.getElementById('clientName').value.trim();
  const dni = document.getElementById('clientDni').value.trim();
  const email = document.getElementById('clientEmail').value.trim().toLowerCase() || null;
  const whatsapp = document.getElementById('clientWhatsapp').value.trim() || null;
  const message = document.getElementById('clientsMessage');
  if (!/^\d{7,8}$/.test(dni)) return showMessage(message, 'El DNI debe tener 7 u 8 dígitos.', 'error');
  const { error } = await supabaseClient.from('clients').upsert({ business_id: currentBusiness.id, name, dni, email, whatsapp }, { onConflict: 'business_id,dni' });
  if (error) return showMessage(message, error.message, 'error');
  showMessage(message, 'Cliente guardado correctamente.', 'success');
  event.target.reset();
  await loadClients();
});

function closeClientConfirm() { document.getElementById('clientConfirmModal').classList.remove('open'); pendingClientDeleteId = null; }
function showClientNotice(title, text) {
  document.getElementById('clientConfirmTitle').textContent = title;
  document.getElementById('clientConfirmText').textContent = text;
  document.getElementById('clientConfirmAccept').style.display = 'none';
  document.getElementById('clientConfirmCancel').textContent = 'Entendido';
  document.getElementById('clientConfirmModal').classList.add('open');
}
function showClientDeleteConfirm(id, name) {
  pendingClientDeleteId = id;
  document.getElementById('clientConfirmTitle').textContent = 'Eliminar cliente';
  document.getElementById('clientConfirmText').textContent = `¿Querés eliminar a ${name} de la lista? Sus reservas no se borrarán.`;
  document.getElementById('clientConfirmAccept').style.display = 'inline-block';
  document.getElementById('clientConfirmCancel').textContent = 'Cancelar';
  document.getElementById('clientConfirmModal').classList.add('open');
}

document.getElementById('clientConfirmCancel').addEventListener('click', closeClientConfirm);
document.getElementById('clientConfirmAccept').addEventListener('click', async () => {
  if (!pendingClientDeleteId) return;
  const { error } = await supabaseClient.from('clients').delete().eq('id', pendingClientDeleteId).eq('business_id', currentBusiness.id);
  closeClientConfirm();
  if (error) return showMessage(document.getElementById('clientsMessage'), error.message, 'error');
  await loadClients();
});

document.getElementById('clientsList').addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-id]');
  if (!button) return;
  const id = button.dataset.id;
  if (button.dataset.action === 'email') {
    emailClientId = id;
    document.getElementById('clientEmailRecipient').textContent = `Para: ${button.dataset.name} · ${button.dataset.email}`;
    document.getElementById('clientEmailSubject').value = 'Mensaje de Induliru';
    document.getElementById('clientEmailMessage').value = '';
    document.getElementById('clientEmailStatus').className = 'admin-message';
    document.getElementById('clientEmailStatus').textContent = '';
    document.getElementById('clientEmailModal').classList.add('open');
    return;
  }
  if (button.dataset.action === 'delete') {
    const { data: bookings, error } = await supabaseClient.from('bookings').select('id').eq('business_id', currentBusiness.id).eq('dni', button.dataset.dni).limit(1);
    if (error) return showMessage(document.getElementById('clientsMessage'), error.message, 'error');
    if (bookings?.length) return showClientNotice('Cliente con reservas', 'No se puede eliminar este cliente porque tiene turnos asociados. Las reservas deben seguir siendo consultables por DNI.');
    return showClientDeleteConfirm(id, button.dataset.name);
  } else {
    editingClientId = id;
    document.getElementById('editClientName').value = button.dataset.name;
    document.getElementById('editClientDni').value = button.dataset.dni;
    document.getElementById('editClientEmail').value = button.dataset.email;
    document.getElementById('editClientWhatsapp').value = button.dataset.whatsapp;
    const { data: bookings } = await supabaseClient.from('bookings').select('id').eq('business_id', currentBusiness.id).eq('dni', button.dataset.dni).limit(1);
    const hasBookings = Boolean(bookings?.length);
    document.getElementById('editClientDni').readOnly = hasBookings;
    document.getElementById('editClientNotice').style.display = hasBookings ? 'block' : 'none';
    document.getElementById('editClientNotice').textContent = hasBookings ? 'Este cliente tiene reservas: el DNI no se puede modificar.' : '';
    document.getElementById('clientEditModal').classList.add('open');
  }
});

document.getElementById('clientEditCancel').addEventListener('click', () => { document.getElementById('clientEditModal').classList.remove('open'); editingClientId = null; });
document.getElementById('clientEditForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const { error } = await supabaseClient.from('clients').update({ name: document.getElementById('editClientName').value.trim(), dni: document.getElementById('editClientDni').value.trim(), email: document.getElementById('editClientEmail').value.trim().toLowerCase() || null, whatsapp: document.getElementById('editClientWhatsapp').value.trim() || null }).eq('id', editingClientId).eq('business_id', currentBusiness.id);
  if (error) return showMessage(document.getElementById('clientsMessage'), error.message, 'error');
  document.getElementById('clientEditModal').classList.remove('open'); editingClientId = null; await loadClients();
});

function closeClientEmailModal() { document.getElementById('clientEmailModal').classList.remove('open'); emailClientId = null; }
document.getElementById('clientEmailCancel').addEventListener('click', closeClientEmailModal);
document.getElementById('clientEmailForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.target.querySelector('button[type="submit"]');
  const status = document.getElementById('clientEmailStatus');
  button.disabled = true;
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const response = await fetch(supabaseFunctionUrl('send-client-email'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_CONFIG.ANON_KEY, Authorization: `Bearer ${sessionData.session?.access_token || ''}` },
    body: JSON.stringify({ business_id: currentBusiness.id, client_id: emailClientId, subject: document.getElementById('clientEmailSubject').value.trim(), message: document.getElementById('clientEmailMessage').value.trim() }),
  });
  const result = await response.json().catch(() => ({}));
  button.disabled = false;
  if (!response.ok) {
    const domainError = String(result.error || '').toLowerCase().includes('domain is not verified');
    return showMessage(status, domainError ? 'Resend todavía no verificó induliru.com. Completá la verificación DNS del dominio para poder enviar desde hola@induliru.com.' : (result.error || 'No se pudo enviar el email.'), 'error');
  }
  showMessage(status, `Email enviado. Quedan ${result.remaining} envíos este mes.`, 'success');
  setTimeout(closeClientEmailModal, 1400);
});

function toggleEarlyHours(kind, calendar, button) {
  earlyHoursVisible[kind] = !earlyHoursVisible[kind];
  calendar?.setOption('slotMinTime', earlyHoursVisible[kind] ? '00:00:00' : '06:00:00');
  button.textContent = earlyHoursVisible[kind] ? 'Ocultar 00:00–06:00' : 'Mostrar 00:00–06:00';
}
document.getElementById('appointmentsEarlyHours').addEventListener('click', (event) => toggleEarlyHours('appointments', appointmentsCalendar, event.currentTarget));
document.getElementById('scheduleEarlyHours').addEventListener('click', (event) => toggleEarlyHours('schedule', scheduleCalendar, event.currentTarget));

document.getElementById('cashBookingButton').addEventListener('click', () => {
  document.getElementById('cashDate').value = dateOnly(new Date());
  document.getElementById('cashTime').value = '14:00';
  document.getElementById('cashModal').classList.add('open');
});
document.getElementById('cashCancel').addEventListener('click', () => document.getElementById('cashModal').classList.remove('open'));
document.getElementById('cashForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const date = document.getElementById('cashDate').value;
  const cashDni = document.getElementById('cashDni').value.trim();
  if (!/^\d{7,8}$/.test(cashDni)) return showNotice('Revisá los datos', [['DNI', 'Debe tener 7 u 8 dígitos.']]);
  const { error } = await supabaseClient.from('bookings').insert({
    business_id: currentBusiness.id,
    name: document.getElementById('cashName').value.trim(),
    dni: cashDni,
    service: document.getElementById('cashService').value,
    booking_date: date,
    booking_time: `${document.getElementById('cashTime').value}:00`,
    status: 'confirmed',
    payment_method: document.getElementById('cashPaymentMethod').value,
  });
  if (error) return showNotice('No se pudo guardar el turno', [['Detalle', error.code === '23505' ? 'Ese horario ya está ocupado.' : error.message]]);
  await supabaseClient.from('clients').upsert({ business_id: currentBusiness.id, name: document.getElementById('cashName').value.trim(), dni: cashDni }, { onConflict: 'business_id,dni' });
  document.getElementById('cashModal').classList.remove('open');
  document.getElementById('cashForm').reset();
  await loadAppointmentsCalendar();
});

document.getElementById('scheduleCancel').addEventListener('click', closeScheduleModal);
document.getElementById('scheduleDelete').addEventListener('click', () => { if (editingRuleIndex !== null && window.confirm('¿Querés eliminar este horario?')) { scheduleRules.splice(editingRuleIndex, 1); closeScheduleModal(); refreshCalendar(); } });
document.getElementById('scheduleForm').addEventListener('submit', (event) => {
  event.preventDefault();
  const date = document.getElementById('scheduleDate').value;
  const frequency = document.getElementById('scheduleFrequency').value;
  const rule = { ...(editingRuleIndex === null ? {} : scheduleRules[editingRuleIndex]), business_id: currentBusiness.id, title: 'Disponible', start_date: date, start_time: `${document.getElementById('scheduleStart').value}:00`, end_time: `${document.getElementById('scheduleEnd').value}:00`, frequency, interval_count: Number(document.getElementById('scheduleInterval').value) || 1, occurrences: Number(document.getElementById('scheduleOccurrences').value) || null, until_date: document.getElementById('scheduleUntil').value || null, weekdays: frequency === 'weekly' ? [parseDate(date).getDay()] : [], active: true };
  if (rule.start_time >= rule.end_time) return showNotice('Revisá el horario', [['Detalle', 'La hora de inicio debe ser anterior a la hora de fin.']]);
  if (editingRuleIndex === null) scheduleRules.push(rule); else scheduleRules[editingRuleIndex] = rule;
  closeScheduleModal(); refreshCalendar();
});

document.getElementById('hoursForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const button = event.target.querySelector('button'); const message = document.getElementById('hoursMessage'); button.disabled = true;
  await supabaseClient.from('availability_rules').delete().eq('business_id', currentBusiness.id);
  const payload = scheduleRules.map(({ id, created_at, updated_at, ...rule }) => rule);
  const { error } = payload.length ? await supabaseClient.from('availability_rules').insert(payload) : { error: null };
  button.disabled = false; showMessage(message, error ? error.message : 'Horarios guardados correctamente.', error ? 'error' : 'success');
  if (!error) await loadBusinessDashboard((await supabaseClient.auth.getUser()).data.user);
});

document.getElementById('createForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.target; const button = form.querySelector('button'); const message = document.getElementById('createMessage'); button.disabled = true;
  const { data: sessionData } = await supabaseClient.auth.getSession();
  const response = await fetch(supabaseFunctionUrl('create-business-admin'), { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_CONFIG.ANON_KEY, 'Authorization': `Bearer ${sessionData.session?.access_token || ''}` }, body: JSON.stringify({ full_name: document.getElementById('fullName').value.trim(), email: document.getElementById('email').value.trim(), password: document.getElementById('password').value, business_name: document.getElementById('businessName').value.trim(), slug: document.getElementById('slug').value.trim().toLowerCase() }) });
  const result = await response.json().catch(() => ({})); button.disabled = false; if (!response.ok) return showMessage(message, result.error || 'No se pudo crear la cuenta', 'error'); showMessage(message, `Cuenta creada para ${result.admin.email}. Negocio: ${result.business.slug}`, 'success'); form.reset(); await loadPlatformBusinesses().catch(() => {});
});

function applyDarkMode(enabled) {
  document.body.classList.toggle('dark-mode', enabled);
  document.querySelectorAll('.dark-mode-toggle').forEach((button) => {
    button.textContent = enabled ? '☀' : '☾';
    button.setAttribute('aria-label', enabled ? 'Desactivar modo oscuro' : 'Activar modo oscuro');
  });
}
applyDarkMode(localStorage.getItem('adminDarkMode') === 'true');
document.querySelectorAll('.dark-mode-toggle').forEach((button) => button.addEventListener('click', () => {
  const enabled = !document.body.classList.contains('dark-mode');
  localStorage.setItem('adminDarkMode', String(enabled));
  applyDarkMode(enabled);
}));
document.getElementById('noticeClose').addEventListener('click', closeNotice);
document.getElementById('noticeModal').addEventListener('click', (event) => { if (event.target.id === 'noticeModal') closeNotice(); });

refreshSession();
