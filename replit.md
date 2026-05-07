# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Contains an Express API server that also runs a Discord bot for the **2026 Summer Break Event**.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **Discord**: discord.js v14
- **Build**: esbuild (ESM bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run typecheck:libs` — build composite libs (run before api-server typecheck after schema changes)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run build` — build API server

## Discord Bot — 2026 Summer Break Event

The bot lives in `artifacts/api-server/src/bot/`. It starts alongside the Express server.

### Required Secrets
- `DISCORD_BOT_TOKEN` — from Discord Developer Portal → your app → Bot → Reset Token
- `DISCORD_GUILD_ID` — your server's ID (right-click server → Copy Server ID)

### Required Bot Permissions
Manage Roles, Manage Channels, Manage Emojis, Send Messages, Read Message History, Add Reactions, Message Content Intent (enabled in Portal)

### Features
- **XP Tracking**: 15–25 XP per message, 60-second cooldown per user
- **Participant Role**: "2026 Summer Break Event" role auto-assigned on first XP
- **Level-up announcements** in the channel where the message was sent
- **Server Milestones**: 10 milestones based on cumulative server XP that unlock rewards

### Slash Commands
| Command | Who | Description |
|---|---|---|
| `/rank [user]` | Everyone | Personal XP, level, rank, and progress bar |
| `/leaderboard [page]` | Everyone | Top earners with gold/silver/bronze medals |
| `/serverprogress` | Everyone | Full milestone tracker with server progress bar |
| `/countdown` | Everyone | Shows time remaining until event starts |
| `/poll <question> <a> <b> [c] [d]` | Everyone | Create a reaction poll with up to 4 options |
| `/seteventstart <datetime>` | Admins | Set the event start date (ISO format or "now") |
| `/postsignup` | Admins | Post the early sign-up embed in the current channel |
| `/setsignuprole [role]` | Admins | Set which role is auto-assigned on sign-up |
| `/setgoal <milestone> <xp>` | Admins | Change the XP goal for a milestone (1–10) |
| `/setreward <milestone> [options]` | Admins | Change the reward config for a milestone |
| `/postliveprogress [channel]` | Admins | Post the auto-updating live progress tracker embed |
| `/setmultiplier <x> <minutes> [label]` | Admins | Activate a temporary XP multiplier (e.g. 2x for 60 min) |
| `/endmultiplier` | Admins | Cancel the active XP multiplier early |
| `/spin` | Everyone | 🎰 Daily lucky wheel spin for bonus XP (6 tiers) |
| `/shoutout <user> [reason]` | Everyone | Give a member a public shoutout + 75 XP (1h cooldown) |
| `/announce <title> <message>` | Admins | Post a formatted embed announcement as the bot |

### Milestones (Server Total XP)
| XP | Reward |
|---|---|
| 1,000 | #summer-lounge channel created |
| 5,000 | Summer emoji announcement |
| 15,000 | "Summer Scout" role → top 5 |
| 30,000 | Mini Giveaway (30 min, 1 winner) |
| 50,000 | Quick Drop (first to react ⚡ wins) |
| 75,000 | #vip-summer-lounge channel created |
| 100,000 | "Summer Warrior" role → top 10 |
| 150,000 | Big Giveaway (1 hour, 3 winners) |
| 200,000 | #summer-hq secret channel |
| 300,000 | "Summer Legend" role → top 3 + Grand Finale |

### File Structure
```
artifacts/api-server/src/bot/
  index.ts              — bot client init, starts with Express server
  xp.ts                 — XP awarding, cooldown, level calc, event role
  milestones.ts         — milestone definitions, checking, reward execution
  giveaway.ts           — giveaway system with reaction entry
  quickdrop.ts          — quick drop (first to react wins)
  commands/
    rank.ts             — /rank command
    leaderboard.ts      — /leaderboard command
    serverprogress.ts   — /serverprogress command
  events/
    ready.ts            — registers slash commands, seeds milestone DB
    messageCreate.ts    — awards XP and checks milestones on every message
    interactionCreate.ts — routes slash commands to handlers

lib/db/src/schema/
  xpUsers.ts            — xp_users table + server_xp table
  milestones.ts         — milestones table
  giveaways.ts          — giveaways table
```

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
