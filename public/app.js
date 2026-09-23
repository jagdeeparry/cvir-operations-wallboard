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
  function renderMttrLane(number, entry, target) {
    var hours = entry && entry.hours;
    $('mttrSev' + number).textContent = hours == null ? '—' : formatDuration(hours);
    var ratio = hours == null ? 0 : hours / target;
    $('mttrBar' + number).style.width = Math.min(100, Math.max(hours == null ? 0 : 5, ratio * 100)) + '%';
    $('mttrLane' + number).classList.toggle('breach', hours != null && hours > target);
  }
  function renderTeam(team) {
    function metric(value) { return value == null ? '—' : value; }
    var header = '<div class="team-header" role="row"><span role="columnheader">Owner</span><span role="columnheader">Assigned open</span><span role="columnheader">Closed / In Review today</span></div>';
    $('teamTable').innerHTML = header + team.map(function (member) {
      return '<div class="team-row" role="row"><span class="person" role="cell"><i class="avatar">' + esc(initials(member.name)) + '</i><span class="person-name">' + esc(member.name) + '</span></span><span class="metric-cell open" role="cell">' + metric(member.assignedOpen) + '</span><span class="metric-cell closed" role="cell">' + metric(member.completedOrReviewedToday) + '</span></div>';
    }).join('');
  }
  function renderQueue() {
    var tickets = state.tickets;
    if (!tickets.length) { var message = state.data && state.data.mode !== 'live' ? 'Live Jira connection required to load assignments.' : 'No open tickets assigned to the selected team.'; $('ticketList').innerHTML = '<div class="empty-state">' + message + '</div>'; $('queueRange').textContent = state.data && state.data.mode !== 'live' ? 'Unavailable' : '0 tickets'; $('pagerDots').innerHTML = ''; return; }
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
    $('openIncidents').textContent = data.openIncidentCount == null ? '—' : data.openIncidentCount;
    drawSpark(data.openIncidentTrend || []);
    $('sevCount').textContent = data.mode === 'live' ? data.recentSev1.length : '—';
    $('sevWindow').textContent = 'last ' + data.sev1WindowMinutes + ' min';
    $('sevCard').classList.toggle('alert', data.recentSev1.length > 0);
    $('sevMessage').textContent = data.mode !== 'live' ? 'Waiting for live Jira data' : (data.recentSev1.length ? (data.recentSev1[0].key + ' · ' + data.recentSev1[0].summary) : 'No new critical incidents');
    renderMttrLane(1, data.mttr.bySeverity.sev1, 2);
    renderMttrLane(2, data.mttr.bySeverity.sev2, 24);
    renderMttrLane(3, data.mttr.bySeverity.sev3, 72);
    $('mttrResolvedLabel').textContent = data.mttr.resolvedCount == null ? 'Live data required' : data.mttr.resolvedCount + ' resolved · Mon → now';
    $('teamOpenTotal').textContent = data.teamOpen.total == null ? '—' : data.teamOpen.total;
    $('teamIncidentTotal').textContent = data.teamOpen.incidents == null ? '—' : data.teamOpen.incidents;
    $('teamOtherTotal').textContent = data.teamOpen.other == null ? '—' : data.teamOpen.other;
    renderTeam(data.team);
    renderQueue();
    $('lastSync').textContent = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date(data.generatedAt));
    $('dataWindow').textContent = data.windowLabel;
    $('modePill').classList.toggle('live', data.mode === 'live');
    $('modePill').classList.toggle('error', data.mode !== 'live');
    $('modeText').textContent = data.mode === 'live' ? 'Jira live' : (data.mode === 'unconfigured' ? 'Jira not connected' : 'Jira unavailable');
    $('warningText').textContent = data.warnings && data.warnings.length ? data.warnings[0] : 'RCA in Progress counted closed · read-only';
  }
  function fetchData(manual) {
    if (state.busy) return;
    state.busy = true; $('refreshButton').classList.add('loading');
    fetch(apiBase + '/api/dashboard', { cache: 'no-store', headers: { 'Accept': 'application/json' } })
      .then(function (r) { if (!r.ok) throw new Error('Dashboard service returned ' + r.status); return r.json(); })
      .then(function (data) { render(data); state.countdown = REFRESH_SECONDS; if (manual) toast(data.mode === 'live' ? 'Live Jira data refreshed' : 'Live Jira data unavailable'); })
      .catch(function () { render(window.CVIR_UNAVAILABLE_DATA); state.countdown = REFRESH_SECONDS; if (manual) toast('Dashboard service unavailable'); })
      .then(function () { state.busy = false; $('refreshButton').classList.remove('loading'); });
  }
  window.CVIR_UNAVAILABLE_DATA = {
    mode: 'error', generatedAt: new Date().toISOString(), sev1WindowMinutes: 30, openIncidentCount: null,
    openIncidentTrend: [], recentSev1: [], mttr: { resolvedCount: null, bySeverity: { sev1: {hours:null}, sev2: {hours:null}, sev3: {hours:null} } },
    teamOpen: { total: null, incidents: null, other: null }, team: ['Darshita','Heena','Yashy','Shreya','Parveen','Anshul','Nikhil','Rahul Sethi'].map(function (name) { return {name:name,assignedOpen:null,completedOrReviewedToday:null}; }),
    openTickets: [], windowLabel: 'Live CVIR data unavailable', warnings: ['Dashboard service unavailable · figures are hidden']
  };
  $('refreshButton').addEventListener('click', function () { fetchData(true); });
  setInterval(function () { state.countdown -= 1; if (state.countdown <= 0) fetchData(false); var m = Math.floor(state.countdown / 60); var s = state.countdown % 60; $('countdown').textContent = m + ':' + (s < 10 ? '0' : '') + s; }, 1000);
  setInterval(function () { var pages = Math.ceil(state.tickets.length / PAGE_SIZE); if (pages > 1) { state.page = (state.page + 1) % pages; renderQueue(); } }, ROTATE_SECONDS * 1000);
  clock(); setInterval(clock, 1000); fetchData(false);
}());
