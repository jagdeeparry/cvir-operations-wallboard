(function () {
  'use strict';

  var REFRESH_SECONDS = 300;
  var BOARD_ROTATE_SECONDS = 30;
  var state = { countdown: REFRESH_SECONDS, boardCountdown: BOARD_ROTATE_SECONDS, busy: false, logoTimer: null };
  var apiMeta = document.querySelector('meta[name="cvir-api-base"]');
  var apiBase = apiMeta && apiMeta.content ? apiMeta.content.replace(/\/$/, '') : '';
  var systemBoardUrl = 'index.html';
  var $ = function (id) { return document.getElementById(id); };

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }
  function initials(name) {
    return String(name || '?').split(/\s+/).map(function (part) { return part.charAt(0); }).join('').slice(0, 2).toUpperCase();
  }
  function clock() {
    var now = new Date();
    $('clock').textContent = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(now);
    $('date').textContent = new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'Asia/Kolkata' }).format(now);
  }
  function toast(message) {
    var element = $('toast');
    element.textContent = message;
    element.classList.add('show');
    setTimeout(function () { element.classList.remove('show'); }, 2600);
  }
  function metric(value, suffix) {
    return value == null ? '—' : String(value) + (suffix || '');
  }
  function renderTeam(team) {
    var header = '<div class="mes-team-header" role="row"><span role="columnheader">Owner</span><span role="columnheader">Assigned open</span><span role="columnheader">High priority</span><span role="columnheader">Created this month</span><span role="columnheader">Done today</span><span role="columnheader">Oldest open</span></div>';
    if (!Array.isArray(team) || !team.length) {
      $('mesTeamTable').innerHTML = header + '<div class="empty-state">No MES support ownership data is available.</div>';
      return;
    }
    $('mesTeamTable').innerHTML = header + team.map(function (member) {
      return '<div class="mes-team-row" role="row"><span class="person" role="cell"><i class="avatar">' + esc(initials(member.name)) + '</i><span class="person-name">' + esc(member.name) + '</span></span><span class="metric-cell open" role="cell">' + metric(member.assignedOpen) + '</span><span class="metric-cell pending" role="cell">' + metric(member.highPriorityOpen) + '</span><span class="metric-cell review" role="cell">' + metric(member.createdThisMonth) + '</span><span class="metric-cell closed" role="cell">' + metric(member.completedToday) + '</span><span class="metric-cell mes-age" role="cell">' + (member.oldestOpenDays == null ? '—' : member.oldestOpenDays + 'd') + '</span></div>';
    }).join('');
  }
  function renderStatusMix(items, total) {
    if (!Array.isArray(items) || !items.length) {
      $('statusMix').innerHTML = '<div class="empty-state">No active MES statuses.</div>';
      return;
    }
    $('statusMix').innerHTML = items.map(function (item) {
      var width = total ? Math.max(7, Math.round((item.count / total) * 100)) : 0;
      return '<div class="status-row"><span><b>' + esc(item.name) + '</b><em>' + esc(item.count) + '</em></span><i><b style="width:' + width + '%"></b></i></div>';
    }).join('');
  }
  function render(data) {
    $('openWorkCount').textContent = metric(data.openWorkCount);
    $('highPriorityOpen').textContent = metric(data.highPriorityOpen);
    $('unassignedOpen').textContent = metric(data.unassignedOpen);
    $('monthCreated').textContent = metric(data.monthCreated);
    $('monthCompleted').textContent = metric(data.monthCompleted);
    $('completionRate').textContent = metric(data.completionRate, '%');
    $('completedToday').textContent = metric(data.completedToday);
    $('monthLabel').textContent = new Intl.DateTimeFormat('en-IN', { month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(new Date(data.generatedAt));
    var types = data.typeCounts || {};
    $('typeTask').textContent = metric(types.task);
    $('typeIssue').textContent = metric(types.issue);
    $('typeServiceRequest').textContent = metric(types.serviceRequest);
    $('typeOther').textContent = metric(types.other);
    renderTeam(data.team);
    renderStatusMix(data.statusMix, data.openWorkCount);
    $('lastSync').textContent = new Intl.DateTimeFormat('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date(data.generatedAt));
    $('dataWindow').textContent = data.windowLabel;
    $('modePill').classList.toggle('live', data.mode === 'live');
    $('modePill').classList.toggle('error', data.mode !== 'live');
    $('modeText').textContent = data.mode === 'live' ? 'MES Jira live' : (data.mode === 'unconfigured' ? 'Jira not connected' : 'MES unavailable');
    $('warningText').textContent = data.warnings && data.warnings.length ? data.warnings[0] : 'Read-only dashboard · changes back to System Support Stats every 30 seconds';
  }
  function unavailable() {
    return {
      mode: 'error', generatedAt: new Date().toISOString(), openWorkCount: null, highPriorityOpen: null, unassignedOpen: null,
      monthCreated: null, monthCompleted: null, completionRate: null, completedToday: null,
      typeCounts: { task: null, issue: null, serviceRequest: null, other: null }, statusMix: [], team: [],
      windowLabel: 'Live MES data unavailable', warnings: ['MES dashboard service unavailable · figures are hidden']
    };
  }
  function fetchData(manual) {
    if (state.busy) return;
    state.busy = true;
    $('refreshButton').classList.add('loading');
    if (state.logoTimer) clearTimeout(state.logoTimer);
    $('kimbalRefreshLogo').classList.remove('is-refreshing');
    void $('kimbalRefreshLogo').offsetWidth;
    $('kimbalRefreshLogo').classList.add('is-refreshing');
    fetch(apiBase + '/api/mes-dashboard', { cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(function (response) { if (!response.ok) throw new Error('MES dashboard service returned ' + response.status); return response.json(); })
      .then(function (data) { render(data); state.countdown = REFRESH_SECONDS; if (manual) toast(data.mode === 'live' ? 'Live MES Jira data refreshed' : 'Live MES data unavailable'); })
      .catch(function () { render(unavailable()); state.countdown = REFRESH_SECONDS; if (manual) toast('MES dashboard service unavailable'); })
      .then(function () {
        state.busy = false;
        $('refreshButton').classList.remove('loading');
        state.logoTimer = setTimeout(function () { $('kimbalRefreshLogo').classList.remove('is-refreshing'); state.logoTimer = null; }, 1300);
      });
  }

  $('boardSwitch').href = systemBoardUrl;
  $('refreshButton').addEventListener('click', function () { fetchData(true); });
  setInterval(function () {
    state.countdown -= 1;
    if (state.countdown <= 0) fetchData(false);
    var minutes = Math.floor(state.countdown / 60);
    var seconds = state.countdown % 60;
    $('countdown').textContent = minutes + ':' + (seconds < 10 ? '0' : '') + seconds;
    state.boardCountdown -= 1;
    $('boardCountdown').textContent = Math.max(0, state.boardCountdown) + 's';
    if (state.boardCountdown <= 0) window.location.replace(systemBoardUrl);
  }, 1000);
  clock();
  setInterval(clock, 1000);
  fetchData(false);
}());
