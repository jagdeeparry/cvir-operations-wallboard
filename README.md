# CVIR Operations Wallboard

A read-only, television-first dashboard for the Jira `CVIR` project. It refreshes every five minutes and shows:

- operationally open Incident count, excluding `In Review` and `RCA in Progress`;
- a blinking red beacon for SEV-1 incidents created within the configured recent window;
- current In Review and closed-today counts for Darshita, Heena, Yashy, Shreya, Parveen, Anshul, Nikhil, and Rahul Sethi;
- current-week incident MTTR from Monday in Asia/Kolkata, split into Operational and Drishti groups;
- open CVIR tickets assigned to those members, excluding `In Review` and `RCA in Progress`.

## Live Jira configuration

The server expects these runtime values. Keep them secret and configure them on the host; never add them to the TV package or source control.

| Variable | Purpose |
| --- | --- |
| `JIRA_BASE_URL` | `https://sinhaludyog.atlassian.net` |
| `JIRA_EMAIL` | Jira account email used by the read-only service account |
| `JIRA_API_TOKEN` | Jira API token for that service account |
| `SEV1_RECENT_MINUTES` | Optional; defaults to `30` |
| `JIRA_TEAM_ACCOUNT_IDS_JSON` | Optional explicit display-name → Jira account-ID map for ambiguous names |

Example mapping shape: `{"Darshita":"account-id", "Yashy":"account-id"}`.

Without these values the dashboard intentionally shows clearly labeled preview data. The Jira connector uses only GET/search operations and performs no issue changes.

## Metric definitions

- **Open incidents:** `project = CVIR`, type Incident, status category not Done, excluding `In Review` and `RCA in Progress` because both statuses are treated as operationally closed.
- **Recent SEV-1:** unresolved incidents created during the configured recent window whose `INC Severity` is `Sev-1`. Priority `Highest` is used only if the custom field cannot be found.
- **In Review:** tickets currently in the exact `In Review` status for each selected assignee.
- **Closed today:** tickets in a Done status category whose resolution date is today, plus Incidents that entered `RCA in Progress` today, using the Jira site timezone.
- **Weekly MTTR:** Incident statuses `Done` and `RCA in Progress` are both considered closed. MTTR converts the custom `Time to Resolution` field from seconds to hours; that field measures incident creation until the ticket reaches `RCA in Progress`. Incidents created by Arun Pandey form the Drishti group; incidents created by every other user form the Operational group. For Done incidents only, `created` to `resolutiondate` is used when the custom value is absent. Records without either value are excluded. Each group is broken out by `INC Severity` against the 2h/24h/72h targets.
- **Open ticket queue:** CVIR work assigned to the selected members whose current status is `In Progress`, `in progress (L1)`, `in progress (L2)`, `in progress (L3)`, or `Open`. `In Review` and `RCA in Progress` are excluded. Darshita is pinned to Jira account ID `712020:c8cf55cc-36d0-41a2-936e-be1b0946dadf`; verification uses the supplied JQL with `In Review` removed.

## Local validation

Run `npm run check` and `npm run build`. The deployable Worker is generated at `dist/server/index.js`.
