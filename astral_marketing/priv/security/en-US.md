# Responsible Disclosure Policy (Bug Bounty)

**Effective: 18 July 2026**  
**Last updated: 18 July 2026**

## Table of Contents

- [Summary](#summary)
- [1. Who this is for](#1-who-this-is-for)
- [2. In scope](#2-in-scope)
- [3. Out of scope](#3-out-of-scope)
- [4. How to report](#4-how-to-report)
- [5. What to include](#5-what-to-include)
- [6. Rewards and recognition](#6-rewards-and-recognition)
- [7. What to expect from us](#7-what-to-expect-from-us)
- [8. Safe testing rules](#8-safe-testing-rules)
- [9. Operator contacts](#9-operator-contacts)

## Summary

- Found a security issue in Astral — email **security@astraof.com**. Do not publish it until we acknowledge the report and have a reasonable time to investigate and fix.
- If you follow this policy, act in good faith, and avoid privacy harm or service disruption, we will not pursue legal action against you for in-scope security research (safe harbor).
- In scope: `astraof.com` and Astral-operated services we actually control.
- Rewards: Bug Hunter badge, Plutonium gift codes; **cash payouts are not guaranteed** and are considered case by case.
- We aim to acknowledge reports within **five business days**.

## 1. Who this is for

Security researchers, community members, and anyone who finds a potential security issue in Astral. Read this before submitting: it covers scope, triage, and how we credit responsible work.

Astral is operated by:

| Detail | Information |
| --- | --- |
| Name | Individual Entrepreneur Andreev Ivan Sergeevich |
| OGRNIP | 324508100385388 |
| INN | 502991812328 |
| Security email | security@astraof.com |

## 2. In scope

### 2.1. Domain and products

| In scope |
| --- |
| `astraof.com` (web, API, Astral client apps, and related official surfaces on this domain) |

Also in scope:

- infrastructure and operational services directly managed by Astral that affect authentication, authorization, payments, community data, or security-/privacy-relevant processing (user identifiers, account metadata, logs, analytics, telemetry, and similar signals);
- abuse of officially supported product features that enables unauthorized persistence, privilege escalation, or data disclosure.

If you are unsure whether a target is in scope, email us and ask.

### 2.2. Safe harbor

If you follow this policy, act in good faith, and avoid privacy violations or service disruption, Astral will not pursue legal action against you for security research within the described scope.

## 3. Out of scope

Non-exhaustive list:

- third-party services, infrastructure, or integrations we do not control (partner bots, external hosting, etc.);
- issues that require physical access to facilities, servers, or devices;
- social engineering, phishing, bribery, coercion, or manipulation of Astral staff or users;
- DoS, traffic flooding, rate-limit or resource exhaustion testing;
- noisy bulk automated scanning without clear impact and a reliable reproduction path;
- ordinary UI bugs, feature requests, and non-security support — use **support@astraof.com**;
- forks, modified, or outdated third-party deployments that cannot be reproduced on the current official release.

We generally deprioritize reports without concrete security impact (for example missing best-practice headers) unless you show real effect.

## 4. How to report

Email **security@astraof.com**.

Include:

- a short descriptive title;
- why it is a security issue (impact, affected users/systems, realistic attack scenario);
- step-by-step reproduction and PoC (screenshots, logs, recording, curl — where helpful).

Do not publicly disclose the vulnerability until we acknowledge the report and have a reasonable opportunity to investigate and ship a fix. We may agree a disclosure timeline with you.

## 5. What to include

The more complete the report, the faster triage:

- clear summary of the issue and impact;
- step-by-step reproduction;
- environment (browser, OS, client version, region, logged-in state);
- mitigations you tried (cache clear, private window, client restart) and whether it persists;
- severity estimate (CVSS or plain language: what access / what harm).

## 6. Rewards and recognition

For valid, reproducible, meaningful reports we may award:

- a **Bug Hunter** badge on your Astral profile;
- **Plutonium** gift codes on astraof.com.

Higher severity and impact generally mean stronger recognition.

**Cash payouts are not guaranteed.** We may consider individual cases; that does not create an obligation to pay for every report.

### Eligibility

- report privately to security@astraof.com;
- public disclosure before acknowledgement and a reasonable chance to fix may forfeit rewards and recognition;
- for duplicate reports of the same underlying issue, we typically credit the first report that clearly explains the vulnerability and enables reliable reproduction.

## 7. What to expect from us

- **Acknowledgement** — we aim to reply within five business days (often sooner).
- **Triage** — critical findings first; we keep you updated as we investigate.
- **Fix and disclosure** — after a fix, we usually coordinate disclosure and credit with the reporter (anonymity on request).
- **If we cannot reproduce** — we share what we tried and may ask for more detail, environment info, or a clearer PoC.

## 8. Safe testing rules

- Only test accounts, communities, and data you own or have explicit permission to use.
- Community roles, invites, moderation, and settings — only in communities you own/admin or with explicit owner/admin permission.
- Do not access or alter other users’ or other communities’ data without consent.
- Do not use flooding, brute force, or destructive methods.
- Do not run scanners in ways that degrade reliability or produce noisy low-signal reports.
- If testing may trigger real user notifications, support tickets, email, billing, or payments — contact us first.
- Follow applicable law where you live and where the systems run. If unsure, ask before escalating the test.

## 9. Operator contacts

| Topic | Contact |
| --- | --- |
| Vulnerabilities | security@astraof.com |
| General support | support@astraof.com |
| Legal requests | legal@astraof.com |
| Website | https://astraof.com |

Thank you for helping keep Astral safe.

Individual Entrepreneur Andreev Ivan Sergeevich  
OGRNIP 324508100385388 | INN 502991812328
