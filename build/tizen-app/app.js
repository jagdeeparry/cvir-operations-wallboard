(function () {
  'use strict';

  var REFRESH_SECONDS = 300;
  var PAGE_SIZE = 6;
  var ROTATE_SECONDS = 12;
  var state = { countdown: REFRESH_SECONDS, page: 0, tickets: [], data: null, busy: false };
  var apiMeta = document.querySelector('meta[name="cvir-api-base"]');
  var apiBase = apiMeta && apiMeta.content ? apiMeta.content.replace(/\/$/, '') : '';

  var $ = function (id) { return document.getElementById(id); };
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]; }); }
  function initials(name) { return String(name || '?').split(/\s+/).map(function (x) { return x.charAt(0); }).join('').slice(0, 2).toUpperCase(); }
  function formatDuration(hours) { if (hours == null) return '—'; return hours < 1 ? Math.round(hours * 60) + 'm' : hours.toFixed(hours < 10 ? 1 : 0) + 'h'; }
  function clock() {
    var now = new Date();
    $('clock').textContent = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(now);
    $('date').textContent = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' }).format(now);
  }
  function toast(message) { var el = $('toast'); el.textContent = message; el.classList.add('show'); setTimeout(function () { el.classList.remove('show'); }, 2600); }
  function drawSpark(values) { $('incidentSpark').innerHTML = values.map(function (v) { return '<i style="height:' + Math.max(16, Math.min(100, v)) + '%"></i>'; }).join(''); }
  function renderTeam(team) {
    var header = '<div class="team-header" role="row"><span role="columnheader">Owner</span><span role="columnheader">In review</span><span role="columnheader">Closed</span><span role="columnheader">Open</span></div>';
    $('teamTable').innerHTML = header + team.map(function (member) {
      return '<div class="team-row" role="row"><span class="person" role="cell"><i class="avatar">' + esc(initials(member.name)) + '</i><span class="person-name">' + esc(member.name) + '</span></span><span class="metric-cell review" role="cell">' + member.inReview + '</span><span class="metric-cell closed" role="cell">' + member.closedToday + '</span><span class="metric-cell open" role="cell">' + member.open + '</span></div>';
    }).join('');
  }
  function renderQueue() {
    var tickets = state.tickets;
    if (!tickets.length) { $('ticketList').innerHTML = '<div class="empty-state">No open tickets assigned to the selected team.</div>'; $('queueRange').textContent = '0 tickets'; $('pagerDots').innerHTML = ''; return; }
    var pages = Math.ceil(tickets.length / PAGE_SIZE);
    if (state.page >= pages) state.page = 0;
    var start = state.page * PAGE_SIZE;
    var slice = tickets.slice(start, start + PAGE_SIZE);
    $('queueRange').textContent = (start + 1) + '–' + Math.min(start + PAGE_SIZE, tickets.length) + ' of ' + tickets.length;
    $('pagerDots').innerHTML = Array.apply(null, Array(Math.min(pages, 8))).map(function (_, i) { return '<i class="' + (i === state.page ? 'active' : '') + '"></i>'; }).join('');
    $('ticketList').innerHTML = slice.map(function (ticket, index) {
      var isIncident = String(ticket.type).toLowerCase() === 'incident';
      return '<div class="ticket-row" style="animation-delay:' + (index * 35) + 'ms"><span class="ticket-key"><i class="type-icon ' + (isIncident ? 'incident' : '') + '">' + (isIncident ? '!' : '◆') + '</i>' + esc(ticket.key) + '</span><span class="ticket-copy"><span class="ticket-title">' + esc(ticket.summary) + '</span><span class="ticket-updated">Updated ' + esc(ticket.updated) + '</span></span><span class="owner-chip">' + esc(ticket.assignee) + '</span><span class="status-chip">' + esc(ticket.status) + '</span></div>';
    }).join('');
  }
  function render(data) {
    state.data = data; state.tickets = data.openTickets || []; state.page = 0;
    $('openIncidents').textContent = data.openIncidentCount;
    drawSpark(data.openIncidentTrend || [46,52,49,58,54,61,57,64,60,69,65,68]);
    $('sevCount').textContent = data.recentSev1.length;
    $('sevWindow').textContent = 'last ' + data.sev1WindowMinutes + ' min';
    $('sevCard').classList.toggle('alert', data.recentSev1.length > 0);
    $('sevMessage').textContent = data.recentSev1.length ? (data.recentSev1[0].key + ' · ' + data.recentSev1[0].summary) : 'No new critical incidents';
    $('mttrValue').textContent = data.mttr.hours == null ? '—' : data.mttr.hours.toFixed(1);
    $('resolvedCount').textContent = data.mttr.resolvedCount;
    $('medianMttr').textContent = formatDuration(data.mttr.medianHours);
    $('mttrGauge').style.setProperty('--progress', Math.min(100, Math.max(4, (data.mttr.hours || 0) / 24 * 100)) + '%');
    $('teamOpenTotal').textContent = data.teamOpen.total;
    $('teamIncidentTotal').textContent = data.teamOpen.incidents;
    $('teamOtherTotal').textContent = data.teamOpen.other;
    renderTeam(data.team);
    renderQueue();
    $('lastSync').textContent = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date(data.generatedAt));
    $('dataWindow').textContent = data.windowLabel;
    $('modePill').classList.toggle('live', data.mode === 'live');
    $('modeText').textContent = data.mode === 'live' ? 'Jira live' : 'Preview data';
    $('warningText').textContent = data.warnings && data.warnings.length ? data.warnings[0] : 'Read-only · refreshes every 5 minutes';
  }
  function fetchData(manual) {
    if (state.busy) return;
    state.busy = true; $('refreshButton').classList.add('loading');
    fetch(apiBase + '/api/dashboard', { cache: 'no-store', headers: { 'Accept': 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('Dashboard service returned ' + r.status); return r.json(); })
      .then(function (data) { render(data); state.countdown = REFRESH_SECONDS; if (manual) toast(data.mode === 'live' ? 'Live Jira data refreshed' : 'Preview data refreshed'); })
      .catch(function () { render(window.CVIR_PREVIEW_DATA); state.countdown = REFRESH_SECONDS; if (manual) toast('Using bundled preview data'); })
      .then(function () { state.busy = false; $('refreshButton').classList.remove('loading'); });
  }
  window.CVIR_PREVIEW_DATA = {
    mode: 'demo', generatedAt: new Date().toISOString(), sev1WindowMinutes: 30, openIncidentCount: 72,
    openIncidentTrend: [43,55,51,60,58,64,61,72,66,70,63,68], recentSev1: [{key:'CVIR-10576',summary:'DGVCL · LS data not pushing to MDM'}],
    mttr: { hours: 8.7, medianHours: 6.2, resolvedCount: 14 }, teamOpen: { total: 31, incidents: 19, other: 12 },
    team: [
      {name:'Darshita',inReview:3,closedToday:2,open:5},{name:'Heena',inReview:4,closedToday:3,open:4},{name:'Yashy',inReview:2,closedToday:1,open:3},{name:'Shreya',inReview:3,closedToday:2,open:4},
      {name:'Parveen',inReview:1,closedToday:2,open:2},{name:'Anshul',inReview:2,closedToday:1,open:4},{name:'Nikhil',inReview:1,closedToday:3,open:3},{name:'Rahul Sethi',inReview:4,closedToday:2,open:6}
    ],
    openTickets: [
      {key:'CVIR-10576',summary:'DGVCL · LS data not pushing to MDM',type:'Incident',assignee:'Rahul Sethi',status:'In Progress L1',updated:'8 min ago'},
      {key:'CVIR-10571',summary:'Data sync latency observed for production meters',type:'Incident',assignee:'Heena',status:'In Review',updated:'17 min ago'},
      {key:'CVIR-10568',summary:'Validation required for missing daily profile',type:'Task',assignee:'Shreya',status:'In Progress',updated:'29 min ago'},
      {key:'CVIR-10563',summary:'Investigate delayed command acknowledgement',type:'Incident',assignee:'Nikhil',status:'In Progress L2',updated:'42 min ago'},
      {key:'CVIR-10557',summary:'Reconcile failed ingestion batch for MDM',type:'Bug',assignee:'Darshita',status:'In Review',updated:'1h ago'},
      {key:'CVIR-10549',summary:'RCA evidence and timeline review',type:'Incident',assignee:'Anshul',status:'RCA in Progress',updated:'2h ago'},
      {key:'CVIR-10542',summary:'Utility dashboard count mismatch',type:'Task',assignee:'Parveen',status:'In Progress',updated:'3h ago'},
      {key:'CVIR-10531',summary:'Retry queue depth above threshold',type:'Incident',assignee:'Yashy',status:'In Progress L3',updated:'4h ago'}
    ],
    windowLabel: 'Asia/Kolkata · Monday 00:00 → now', warnings: ['Preview mode · add Jira secrets for live data']
  };
  $('refreshButton').addEventListener('click', function () { fetchData(true); });
  setInterval(function () { state.countdown -= 1; if (state.countdown <= 0) fetchData(false); var m = Math.floor(state.countdown / 60); var s = state.countdown % 60; $('countdown').textContent = m + ':' + (s < 10 ? '0' : '') + s; }, 1000);
  setInterval(function () { var pages = Math.ceil(state.tickets.length / PAGE_SIZE); if (pages > 1) { state.page = (state.page + 1) % pages; renderQueue(); } }, ROTATE_SECONDS * 1000);
  clock(); setInterval(clock, 1000); fetchData(false);
}());
