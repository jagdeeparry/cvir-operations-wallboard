# Samsung TV package

This folder is a Samsung Tizen TV web-app project. The dashboard shell works at 1920×1080, supports TV focus, refreshes every five minutes, and rotates the ticket queue every 12 seconds.

## Build and install

1. Install Samsung Tizen Studio and the TV Extension on the computer used to deploy to the TV.
2. In Tizen Studio, create or select a Samsung certificate profile. A `.wgt` cannot be installed on a physical TV until it is signed with your certificate.
3. Enable Developer Mode on the TV, enter the development computer's IP address, then restart the TV.
4. Import this generated folder as an existing Tizen project, build the signed package, connect to the TV in Device Manager, and select **Run As → Tizen Web Application**.

The hosted deployment remains private by default. Before a physical TV can consume live Jira data, choose a protected network-access method or explicitly approve a different Site audience. Do not embed a Jira API token in this package.
