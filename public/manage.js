(function () {
  'use strict';
  var CODE_STORAGE = 'cvir-resource-manager-code';
  var managerCode = '';
  var $ = function (id) { return document.getElementById(id); };
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[ch]; }); }
  function message(id, text, type) { var el = $(id); el.textContent = text || ''; el.className = 'message' + (type ? ' ' + type : ''); }
  function request(path, options) {
    var config = options || {};
    config.headers = Object.assign({ 'Accept': 'application/json', 'X-Manager-Access-Code': managerCode }, config.headers || {});
    return fetch(path, config).then(function (response) { return response.json().catch(function () { return {}; }).then(function (body) { if (!response.ok) throw new Error(body.error || 'Request failed'); return body; }); });
  }
  function completedLabel(value) {
    if (!value) return 'Completed';
    var date = new Date(String(value).replace(' ', 'T') + (String(value).indexOf('Z') === -1 ? 'Z' : ''));
    if (isNaN(date.getTime())) return 'Completed ' + value;
    return 'Completed ' + date.toLocaleString([], { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' });
  }
  function row(item, completed) {
    var status = completed ? '<span class="completed-status">' + esc(completedLabel(item.completedAt)) + '</span>' : '<span class="row-schedule">' + esc(item.schedule || 'Schedule not set') + '</span>';
    var actions = completed
      ? '<button class="danger" type="button" data-delete-id="' + item.id + '">Delete</button>'
      : '<span class="row-actions"><button class="complete" type="button" data-complete-id="' + item.id + '">Mark completed</button><button class="danger" type="button" data-delete-id="' + item.id + '">Delete</button></span>';
    return '<div class="manager-row' + (completed ? ' is-completed' : '') + '"><span class="activity-badge">' + esc(item.activityType) + '</span><span class="row-title"><strong>' + esc(item.title) + '</strong><span>' + esc(item.notes || 'No additional notes') + '</span></span><span class="row-resources"><strong>' + esc(item.resources) + '</strong><span>Resources</span></span>' + status + actions + '</div>';
  }
  function render(activeItems, completedItems) {
    $('alignmentCount').textContent = activeItems.length + ' active';
    $('completedCount').textContent = completedItems.length + ' completed';
    $('managerList').innerHTML = activeItems.length ? activeItems.map(function (item) { return row(item, false); }).join('') : '<div class="empty">No active resource alignments on the TV board.</div>';
    $('completedList').innerHTML = completedItems.length ? completedItems.map(function (item) { return row(item, true); }).join('') : '<div class="empty">No completed activities yet.</div>';
  }
  function loadItems() { return request('/api/resource-alignments').then(function (body) { render(body.items || [], body.completedItems || []); }); }
  function unlock(code) {
    managerCode = code;
    return request('/api/resource-alignments/auth').then(function () {
      sessionStorage.setItem(CODE_STORAGE, managerCode);
      $('loginPanel').hidden = true; $('managerWorkspace').hidden = false;
      return loadItems();
    });
  }
  $('loginForm').addEventListener('submit', function (event) {
    event.preventDefault(); message('loginMessage', 'Checking access…');
    unlock($('managerCode').value.trim()).then(function () { message('loginMessage', ''); }).catch(function () { managerCode = ''; message('loginMessage', 'Access code is incorrect.', 'error'); });
  });
  $('alignmentForm').addEventListener('submit', function (event) {
    event.preventDefault(); message('formMessage', 'Publishing…');
    var payload = { activityType:$('activityType').value, title:$('activityTitle').value.trim(), resources:$('resources').value.trim(), schedule:$('schedule').value.trim(), notes:$('notes').value.trim() };
    request('/api/resource-alignments', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) }).then(function () { $('alignmentForm').reset(); message('formMessage', 'Published to the TV board.', 'success'); return loadItems(); }).catch(function (error) { message('formMessage', error.message, 'error'); });
  });
  $('managerWorkspace').addEventListener('click', function (event) {
    var completeButton = event.target.closest('[data-complete-id]');
    if (completeButton) {
      completeButton.disabled = true; message('alignmentMessage', 'Marking activity completed…');
      request('/api/resource-alignments/' + encodeURIComponent(completeButton.getAttribute('data-complete-id')) + '/complete', { method:'POST' }).then(function () { message('alignmentMessage', 'Activity completed and removed from the TV board.', 'success'); return loadItems(); }).catch(function (error) { completeButton.disabled = false; message('alignmentMessage', error.message, 'error'); });
      return;
    }
    var deleteButton = event.target.closest('[data-delete-id]'); if (!deleteButton) return;
    deleteButton.disabled = true; message('alignmentMessage', 'Deleting record…');
    request('/api/resource-alignments/' + encodeURIComponent(deleteButton.getAttribute('data-delete-id')), { method:'DELETE' }).then(function () { message('alignmentMessage', 'Record deleted.', 'success'); return loadItems(); }).catch(function (error) { deleteButton.disabled = false; message('alignmentMessage', error.message, 'error'); });
  });
  $('lockButton').addEventListener('click', function () { managerCode = ''; sessionStorage.removeItem(CODE_STORAGE); $('managerWorkspace').hidden = true; $('loginPanel').hidden = false; $('managerCode').value = ''; $('managerCode').focus(); });
  var saved = sessionStorage.getItem(CODE_STORAGE); if (saved) unlock(saved).catch(function () { sessionStorage.removeItem(CODE_STORAGE); });
}());
