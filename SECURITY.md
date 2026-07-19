# Security Policy

## Supported version

Mise is an early-stage learning project. Only the current `main` branch is
supported; there are no stable release branches yet.

## Reporting a vulnerability

Please use GitHub's **Report a vulnerability** flow on the repository's
Security tab. Do not open a public issue for suspected credential exposure,
authentication or authorization bypasses, private-data disclosure, or another
issue that could put users at risk.

Reports should include the affected surface, reproduction steps, likely
impact, and any suggested mitigation. Reports are reviewed on a best-effort
basis; this project does not yet promise a response or remediation SLA.

The experimental MCP surface currently returns fixtures only. OAuth and real
user data remain out of scope until every tool can bind an authenticated
identity to authorization and user-scoped data access.
