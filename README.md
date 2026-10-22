# System Support + MES Stats Wallboard

A read-only, television-first dashboard for the Jira `CVIR` project. It refreshes every five minutes and shows:

- operationally open Incident count, excluding `In Review` and `RCA in Progress`;
- a blinking red beacon for SEV-1 incidents created within the configured recent window;
- an audible repeating alarm and full-screen acknowledgement popup for each newly seen SEV-1 ticket;
- current In Review and closed-today counts for Darshita, Heena, Yashy, Shreya, Parveen, Anshul, Nikhil, and Rahul Sethi;
- current-week incident MTTR from Monday in Asia/Kolkata, split into Operational and Drishti groups;
- open CVIR tickets assigned to those members, excluding `In Review` and `RCA in Progress`;
- current `RCA in Progress` incidents where a listed team member is the assignee or appears in `L2 Involved`, alternating with the open-ticket queue;
- manager-maintained resource alignment for SAT, FIIT, FAT, and other ongoing work outside the ticket queue.

The same deployment also includes a purpose-built `/mes` page for Jira project `MES`. The television automatically alternates between System Support Stats and MES Support Stats every 30 seconds. The MES page shows live open work, high-priority and unassigned demand, current-month created/completed throughput, today’s completions, open work by issue type and status, and dynamic workload by MES assignee. Each board still refreshes its Jira data every five minutes, and a board load always requests current data with browser caching disabled.

## Resource alignment manager

The television dashboard is read-only. Managers update the shared Resource Alignment card from the separate `/manage` page on a laptop. That page is intentionally not linked from the TV dashboard and is not included in the Tizen package.

After entering the manager access code, a manager can add or remove an alignment with:

- activity type: SAT, FIIT, FAT, or Other;
- activity/customer title;
- aligned resources;
- schedule;
- optional notes.

Entries are stored centrally in Cloudflare D1 and are therefore shared by every laptop and television. The TV fetches the current list on startup and during each five-minute refresh; multiple pages rotate automatically every 12 seconds.

## Live Jira configuration

The server expects these runtime values. Keep them secret and configure them on the host; never add them to the TV package or source control.

| Variable | Purpose |
| --- | --- |
| `JIRA_BASE_URL` | `https://sinhaludyog.atlassian.net` |
| `JIRA_EMAIL` | Jira account email used by the read-only service account |
| `JIRA_API_TOKEN` | Jira API token for that service account |
| `SEV1_RECENT_MINUTES` | Optional; defaults to `30` |
| `JIRA_TEAM_ACCOUNT_IDS_JSON` | Optional explicit display-name → Jira account-ID map for ambiguous names |
| `RESOURCE_MANAGER_ACCESS_CODE` | Secret access code required for add/remove actions on `/manage` |

Example mapping shape: `{"Darshita":"account-id", "Yashy":"account-id"}`.

Without the Jira values the dashboard intentionally hides unavailable Jira figures. The Jira connector uses only GET/search operations and performs no issue changes. Resource alignment is independent of Jira and uses its own shared database.

## Metric definitions

- **Open incidents:** `project = CVIR`, type Incident, status category not Done, excluding `In Review` and `RCA in Progress` because both statuses are treated as operationally closed.
- **Team open load:** All CVIR tickets, across all creation dates, assigned to the ten configured Jira account IDs and currently in `In progress`, `in progress (L1)`, `in progress (L2)`, `in progress (L3)`, `In Review`, `Open`, or `To Do`. This metric deliberately includes `In Review` and no longer applies the earlier 15 April 2026 creation-date boundary. The Team Movement pending-incident column remains a separate metric beginning 15 April 2026.
- **Recent SEV-1:** unresolved incidents created during the configured recent window whose `INC Severity` is `Sev-1`. Priority `Highest` is used only if the custom field cannot be found.
- **New SEV-1 alarm:** a newly seen ticket key triggers a full-screen alert and repeating tone for up to 10 seconds. Acknowledge dismisses it immediately; otherwise it stops and closes automatically after 10 seconds. The last 100 alerted keys are stored only in that browser or TV using local storage, preventing the same incident from ringing again after each five-minute refresh. Browsers that block sound before user interaction still show the visual alert.
- **In Review:** tickets currently in the exact `In Review` status for each selected assignee.
- **Closed today:** tickets in a Done status category whose resolution date is today, plus Incidents that entered `RCA in Progress` today, using the Jira site timezone.
- **Monthly MTTR:** Only Incidents that were both created during the current month and completed during the current month qualify. `Done` and `RCA in Progress` are both considered completed. MTTR converts the custom `Time to Resolution` field from seconds to hours; records with a blank or invalid value are excluded. Incidents created by Arun Pandey form the Drishti group; incidents created by every other user form the Operational group. Each group is broken out by `INC Severity` against the 2h/24h/72h targets.
- **Open ticket queue:** CVIR work assigned to the selected members whose current status is `In Progress`, `in progress (L1)`, `in progress (L2)`, `in progress (L3)`, or `Open`. `In Review` and `RCA in Progress` are excluded. Darshita is pinned to Jira account ID `712020:c8cf55cc-36d0-41a2-936e-be1b0946dadf`; verification uses the supplied JQL with `In Review` removed.
- **RCA follow-up queue:** Incidents currently in `RCA in Progress` are included when one of the selected team members is either the current Jira assignee or appears in the `L2 Involved` field. A ticket is counted once for every matched team member in Team Movement, even when that person matches through both fields. The main queue alternates between open work and RCA follow-up every 12 seconds; paginated results advance on each return to that view.
- **MES open work:** `project = MES AND statusCategory != Done`. High-priority open work includes Jira priorities `High` and `Highest`. The MES team table is generated from the current assignees in open work, current-month created work, and tickets completed today rather than using the CVIR roster.
- **MES monthly throughput:** Current-month created tickets are compared with tickets that were both created and completed during the same current month. Today’s completion count uses the Jira site day boundary. The MES view links to the source Jira project and remains read-only.
- **Board rotation:** `/` shows System Support Stats and `/mes` shows MES Support Stats. Each page automatically changes to the other after 30 seconds; an active CVIR SEV-1 alert temporarily pauses the transition until its 10-second alarm closes.

## Local validation

Run `npm run check` and `npm run build`. The deployable Worker is generated at `dist/server/index.js`.
