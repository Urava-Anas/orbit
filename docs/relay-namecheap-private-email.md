# Orbit Relay — Namecheap Private Email

Relay treats each business mailbox as an independently authenticated operating identity.

## Connection flow

Workspace owner/admin → Relay → Connectors → Connect mailbox → enter full business email + mailbox password → Orbit verifies encrypted IMAP and SMTP → credential is stored in Supabase Vault → recent inbox messages sync → user selects that mailbox in Relay.

Namecheap Private Email settings used by Relay:

- Host: `mail.privateemail.com`
- IMAP: port 993, SSL/TLS
- SMTP: port 465, SSL/TLS
- Username: full mailbox address
- Password: that mailbox's Private Email password

## Product behavior

- Multiple mailboxes can be connected to one workspace.
- Selecting a mailbox scopes Inbox, compose identity, sync health, tools and recommendations.
- Relay imports recent inbound messages with IMAP UID cursoring and de-duplication.
- Conversation context is linked to matching leads and online form submissions when possible.
- Orbit Brief recommends next work from unread mail, missing business context, new forms, due lead follow-ups and stale sync state.
- Credential management is owner/admin only.
- Mailbox passwords are stored in Supabase Vault and are not exposed through normal workspace tables or browser state.
- User-triggered sync runs through the authenticated Orbit workspace session and existing RLS policies.
- Disconnect removes the stored credential while retaining synced business history.
- Outbound communication remains subject to Orbit's Green/Amber/Red authority model; this connector does not bypass approval controls.

Deployment marker: Relay Vault credential hotfix.
