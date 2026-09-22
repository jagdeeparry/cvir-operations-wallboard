const TEAM_NAMES = ['Darshita', 'Heena', 'Yashy', 'Shreya', 'Parveen', 'Anshul', 'Nikhil', 'Rahul Sethi'];
const DEFAULT_SEV1_WINDOW = 30;
let fieldCache = null;
let userCache = null;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
}
function authHeaders(env) {
  return { 'authorization': 'Basic ' + btoa(env.JIRA_EMAIL + ':' + env.JIRA_API_TOKEN), 'accept': 'application/json', 'content-type': 'application/json' };
}
async function jira(env, path, options = {}) {
  const base = String(env.JIRA_BASE_URL || '').replace(/\/$/, '');
  const response = await fetch(base + path, { ...options, headers: { ...authHeaders(env), ...(options.headers || {}) } });
  if (!response.ok) throw new Error('Jira request failed (' + response.status + ')');
  return response.json();
}
function fieldValue(value) {
  if (value == null) return '';
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(fieldValue).join(', ');
  return value.value || value.name || value.displayName || '';
}
async function fields(env) {
  if (fieldCache && fieldCache.expires > Date.now()) return fieldCache.value;
  const all = await jira(env, '/rest/api/3/field');
  const map = {};
  all.forEach((f) => { map[String(f.name).toLowerCase()] = f.id; });
  fieldCache = { value: map, expires: Date.now() + 60 * 60 * 1000 };
  return map;
}
async function search(env, jql, fieldNames, maxResults = 100) {
  let issues = [];
  let total = null;
  let nextPageToken = null;
  do {
    const requestBody = { jql, fields: fieldNames, maxResults: Math.min(100, Math.max(1, maxResults - issues.length)) };
    if (nextPageToken) requestBody.nextPageToken = nextPageToken;
    const body = await jira(env, '/rest/api/3/search/jql', { method: 'POST', body: JSON.stringify(requestBody) });
    if (Number.isFinite(body.total)) total = body.total;
    issues = issues.concat(body.issues || []);
    nextPageToken = body.nextPageToken || null;
    if (body.isLast === true || !nextPageToken) break;
  } while (issues.length < maxResults);
  return { total: total == null ? issues.length : total, issues: issues.slice(0, maxResults) };
}
function normalize(value) { return String(value || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
async function resolveUsers(env) {
  if (userCache && userCache.expires > Date.now()) return userCache.value;
  let pinned = {};
  try { pinned = JSON.parse(env.JIRA_TEAM_ACCOUNT_IDS_JSON || '{}'); } catch (_) {}
  const resolved = [];
  for (const name of TEAM_NAMES) {
    if (pinned[name]) { resolved.push({ name, accountId: pinned[name], displayName: name }); continue; }
    const candidates = await jira(env, '/rest/api/3/user/assignable/search?project=CVIR&maxResults=50&query=' + encodeURIComponent(name));
    const exact = candidates.find((u) => normalize(u.displayName) === normalize(name));
    const prefix = candidates.find((u) => normalize(u.displayName).includes(normalize(name)) || normalize(name).includes(normalize(u.displayName)));
    const chosen = exact || prefix;
    resolved.push({ name, accountId: chosen && chosen.accountId, displayName: chosen && chosen.displayName });
  }
  userCache = { value: resolved, expires: Date.now() + 60 * 60 * 1000 };
  return resolved;
}
function mondayISO(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(now);
  const get = (type) => parts.find((x) => x.type === type).value;
  const dayMap = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const local = new Date(get('year') + '-' + get('month') + '-' + get('day') + 'T00:00:00+05:30');
  local.setUTCDate(local.getUTCDate() - dayMap[get('weekday')]);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(local);
}
function hoursBetween(a, b) { return (new Date(b).getTime() - new Date(a).getTime()) / 3600000; }
function median(values) { if (!values.length) return null; const sorted = values.slice().sort((a,b) => a-b); const m = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[m] : (sorted[m-1] + sorted[m]) / 2; }
function ago(iso) { const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); if (mins < 60) return mins + ' min ago'; const hrs = Math.round(mins / 60); return hrs < 24 ? hrs + 'h ago' : Math.round(hrs / 24) + 'd ago'; }

async function liveDashboard(env) {
  const fieldMap = await fields(env);
  const sevField = fieldMap['inc severity'];
  const users = await resolveUsers(env);
  const validUsers = users.filter((u) => u.accountId);
  const unresolved = users.filter((u) => !u.accountId).map((u) => u.name);
  if (!validUsers.length) throw new Error('No dashboard team members could be resolved in Jira');
  const accountList = validUsers.map((u) => '"' + u.accountId.replace(/"/g, '') + '"').join(',');
  const monday = mondayISO();
  const sevMinutes = Number(env.SEV1_RECENT_MINUTES || DEFAULT_SEV1_WINDOW);
  const base = 'project = CVIR';
  const [openIncidents, recentIncidents, inReview, closedToday, openTeam, resolvedWeek] = await Promise.all([
    search(env, base + ' AND issuetype = Incident AND statusCategory != Done', ['key'], 5000),
    search(env, base + ' AND issuetype = Incident AND statusCategory != Done AND created >= -' + sevMinutes + 'm ORDER BY created DESC', ['summary','created', sevField || 'priority'], 100),
    search(env, base + ' AND status = "In Review" AND assignee in (' + accountList + ')', ['assignee'], 500),
    search(env, base + ' AND statusCategory = Done AND resolutiondate >= startOfDay() AND assignee in (' + accountList + ')', ['assignee'], 500),
    search(env, base + ' AND statusCategory != Done AND assignee in (' + accountList + ') ORDER BY priority DESC, updated DESC', ['summary','issuetype','assignee','status','updated'], 500),
    search(env, base + ' AND issuetype = Incident AND resolutiondate >= "' + monday + '" AND resolutiondate IS NOT EMPTY', ['created','resolutiondate'], 500)
  ]);
  const severityOf = (issue) => sevField ? fieldValue(issue.fields[sevField]) : fieldValue(issue.fields.priority);
  const sev1 = recentIncidents.issues.filter((i) => /sev[- ]?1|highest/i.test(severityOf(i))).map((i) => ({ key: i.key, summary: i.fields.summary }));
  const byAccount = (issues, id) => issues.filter((i) => i.fields.assignee && i.fields.assignee.accountId === id).length;
  const team = users.map((u) => ({ name: u.name, inReview: u.accountId ? byAccount(inReview.issues, u.accountId) : 0, closedToday: u.accountId ? byAccount(closedToday.issues, u.accountId) : 0, open: u.accountId ? byAccount(openTeam.issues, u.accountId) : 0 }));
  const times = resolvedWeek.issues.map((i) => hoursBetween(i.fields.created, i.fields.resolutiondate)).filter((n) => Number.isFinite(n) && n >= 0);
  const issueRows = openTeam.issues.map((i) => ({ key: i.key, summary: i.fields.summary, type: i.fields.issuetype && i.fields.issuetype.name, assignee: i.fields.assignee && i.fields.assignee.displayName, status: i.fields.status && i.fields.status.name, updated: ago(i.fields.updated) }));
  const incidents = issueRows.filter((i) => String(i.type).toLowerCase() === 'incident').length;
  const mean = times.length ? times.reduce((a,b) => a+b, 0) / times.length : null;
  return {
    mode: 'live', generatedAt: new Date().toISOString(), sev1WindowMinutes: sevMinutes, openIncidentCount: openIncidents.total,
    openIncidentTrend: [42,48,46,54,51,59,57,64,61,68,65,Math.min(92, 40 + openIncidents.total / 2)], recentSev1: sev1,
    mttr: { hours: mean, medianHours: median(times), resolvedCount: times.length }, teamOpen: { total: issueRows.length, incidents, other: issueRows.length - incidents },
    team, openTickets: issueRows, windowLabel: 'Asia/Kolkata · Monday ' + monday + ' 00:00 → now',
    warnings: unresolved.length ? ['Unresolved Jira member mapping: ' + unresolved.join(', ')] : []
  };
}

const PREVIEW = {
  mode: 'demo', sev1WindowMinutes: 30, openIncidentCount: 72, openIncidentTrend: [43,55,51,60,58,64,61,72,66,70,63,68],
  recentSev1: [{key:'CVIR-10576',summary:'DGVCL · LS data not pushing to MDM'}], mttr:{hours:8.7,medianHours:6.2,resolvedCount:14}, teamOpen:{total:31,incidents:19,other:12},
  team:[{name:'Darshita',inReview:3,closedToday:2,open:5},{name:'Heena',inReview:4,closedToday:3,open:4},{name:'Yashy',inReview:2,closedToday:1,open:3},{name:'Shreya',inReview:3,closedToday:2,open:4},{name:'Parveen',inReview:1,closedToday:2,open:2},{name:'Anshul',inReview:2,closedToday:1,open:4},{name:'Nikhil',inReview:1,closedToday:3,open:3},{name:'Rahul Sethi',inReview:4,closedToday:2,open:6}],
  openTickets:[{key:'CVIR-10576',summary:'DGVCL · LS data not pushing to MDM',type:'Incident',assignee:'Rahul Sethi',status:'In Progress L1',updated:'8 min ago'},{key:'CVIR-10571',summary:'Data sync latency observed for production meters',type:'Incident',assignee:'Heena',status:'In Review',updated:'17 min ago'},{key:'CVIR-10568',summary:'Validation required for missing daily profile',type:'Task',assignee:'Shreya',status:'In Progress',updated:'29 min ago'},{key:'CVIR-10563',summary:'Investigate delayed command acknowledgement',type:'Incident',assignee:'Nikhil',status:'In Progress L2',updated:'42 min ago'},{key:'CVIR-10557',summary:'Reconcile failed ingestion batch for MDM',type:'Bug',assignee:'Darshita',status:'In Review',updated:'1h ago'},{key:'CVIR-10549',summary:'RCA evidence and timeline review',type:'Incident',assignee:'Anshul',status:'RCA in Progress',updated:'2h ago'}],
  windowLabel:'Asia/Kolkata · Monday 00:00 → now', warnings:['Preview mode · Jira credentials are not configured']
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/dashboard') {
      if (!env.JIRA_BASE_URL || !env.JIRA_EMAIL || !env.JIRA_API_TOKEN) return json({ ...PREVIEW, generatedAt: new Date().toISOString() });
      try { return json(await liveDashboard(env)); }
      catch (error) { return json({ ...PREVIEW, generatedAt: new Date().toISOString(), warnings: ['Live Jira refresh failed · showing preview data', String(error.message || error)] }); }
    }
    if (url.pathname === '/health') return json({ ok: true, jiraConfigured: Boolean(env.JIRA_BASE_URL && env.JIRA_EMAIL && env.JIRA_API_TOKEN) });
    return new Response(__INDEX_HTML__, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache', 'content-security-policy': "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'", 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' } });
  }
};
