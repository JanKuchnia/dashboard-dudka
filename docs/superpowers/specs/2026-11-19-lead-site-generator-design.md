# Lead site generator: design draft

Status: **approved 2026-11-19.** Brainstorm notes from 2026-11-19 (IDEAS.md item 13), revised the same day after review. Switched from agy to the Claude Code CLI.

## Intent

For a lead at the offer stage, automatically build a **demo homepage** to show the client. If the client agrees, I clone the repo into my own workspace and build the real site from it. It's an internal tool for the two of us (me and the CFO). The demo is judged on its design, not on SEO or completeness.

## Flow

1. In the CRM, one of us marks a lead with **"Zrób stronę"**. This opens a short, optional field, "Co klient chce", where we can note pages, colors or a logo link; it's saved as `site_brief`. The button sets `site_status = 'ZLECONA'` and `site_requested_at = now()`.
2. A worker on the **homelab** runs once a minute and claims one `ZLECONA` lead by moving it to `W_TOKU`. The [Homelab worker](#homelab-worker) section covers how it runs.
3. The worker starts a non-interactive **Claude Code** run (`claude -p`) with the lead's data and `site_brief`.
4. Claude **researches** the business. The Google data (name, category, city, address, phone, rating and review count, Maps link, current website) tells it where to look. The homepage's content comes from what the research finds. Where `site_brief` and the research disagree, `site_brief` wins.
5. **claude-seo** plans the homepage's sections and copy, using `seo-local` and `seo-content-brief`.
6. **Stitch** designs the homepage as one desktop screen.
7. The worker creates a **public repo on my GitHub account (JanKuchnia)**, named after the business, and pushes the homepage to it. It then turns on **GitHub Pages**, so the demo has a link we can send the client.
8. The worker writes the result back: `GOTOWA` with the repo and demo links, or `BLAD` with the reason.

Because the homelab only makes outbound calls to Supabase, it never has to accept traffic from the internet, and no secret ever sits in the browser.

## Split

| Where | What |
|---|---|
| `1-database-supabase/` | `site_*` columns, the worker's two RPCs |
| `2-web-crm-app/` | "Zrób stronę" button with the optional brief field, site status badge, repo link and demo link on the lead, the same in local demo mode |
| `5-site-worker/` (new) | worker script, prompt, Claude settings, systemd units. Kept out of Vercel uploads by a root `.vercelignore` |
| Homelab | runs a clone of this repo's `5-site-worker/`, with Claude Code (claude-seo, Stitch) and `gh` |

A root `.vercelignore` works here because `2-web-crm-app/` has none of its own, so Vercel falls back to the root one.

## Status on the lead

New columns on `leads`, added with `alter table … add column if not exists` like the other schema upgrades:

- `site_status`: empty, `ZLECONA`, `W_TOKU`, `GOTOWA` or `BLAD`
- `site_brief`: the optional "Co klient chce" text
- `site_requested_at`
- `site_repo_url`
- `site_preview_url`: the GitHub Pages link we send the client
- `site_error`: why the run failed, shown on the lead when the status is `BLAD`

The button appears only when both of these hold:

- `deal_stage` is `OFERTA` or `WYGRANA`
- the site status is empty or `BLAD`, so a failed run can be started again

A lead that is `GOTOWA` is never rebuilt. Status changes from the worker show up in the CRM on their own, because Realtime is already on for `leads`.

In local demo mode (`localApi`), the button only sets `ZLECONA`. Nothing processes it, so it stays in that state.

## What counts as done

- One homepage (`index.html`) that opens locally and looks finished.
- It uses the business's real name, address and phone, plus the content the research found.
- No placeholder text such as lorem ipsum or "Twoja firma".
- **Images and reviews:**
  - Stitch's own generated images are fine for the demo.
  - Photos copied from the business's Google Maps or Facebook pages are not allowed.
  - The repo and the demo are public, so review quotes stay short and show only the reviewer's first name.
- SEO extras (meta tags, structured data, sitemap) and other pages are not required.

## Homelab worker

The homelab runs Debian, so systemd user services are available. Claude Code and `gh` are installed under one user account. The worker lives in a clone of this repo at `~/dashboard-dudka`, so below, `W` means `~/dashboard-dudka/5-site-worker`.

### How it runs

A **systemd user timer** starts a one-shot bash script (`curl` + `jq`), so there's no long-running daemon to babysit.

```ini
# ~/.config/systemd/user/site-worker.service
[Service]
Type=oneshot
EnvironmentFile=%h/.config/site-worker/env
ExecStart=%h/dashboard-dudka/5-site-worker/run.sh
TimeoutStartSec=90min

# ~/.config/systemd/user/site-worker.timer
[Timer]
OnBootSec=2min
OnUnitInactiveSec=1min

[Install]
WantedBy=timers.target
```

- `OnUnitInactiveSec` counts from when the previous run *finished*, so two jobs never run at once. That gives the "one worker" guarantee the failure rules rely on.
- To make the timer run without anyone logged in, run `loginctl enable-linger <user>` once.
- Logs: `journalctl --user -u site-worker`.

`env` holds `CLAUDE_CODE_OAUTH_TOKEN` and the homelab Supabase login.

### What one run does (`run.sh`)

1. **Get a Supabase token.** The worker reuses the cached token in `~/.config/site-worker/token.json` until it expires. Only then does it sign in again as the homelab login (password grant). Signing in on every run would mean 1,440 sign-ins and sessions a day.
2. Call `claim_site_job()`. If it returns nothing, exit.
3. Create a fresh work folder, `~/site-jobs/<lead_id>-<YYYYMMDD-HHMM>/`. The timestamp means a re-run after `BLAD` never lands on a previous run's leftovers.
4. Run Claude in that folder. The Supabase credentials are removed from its environment first, and its output is saved for debugging.
   ```
   env -u SUPABASE_EMAIL -u SUPABASE_PASSWORD \
   timeout 60m claude -p "$(cat $W/prompt.md) <lead JSON with site_brief>" \
       --settings $W/claude-settings.json \
       --mcp-config ~/.config/site-worker/stitch.json --strict-mcp-config \
       --allowedTools "Read Write Edit Bash WebSearch WebFetch Skill mcp__stitch__*" \
       --permission-mode dontAsk \
       --output-format json --json-schema "$(cat $W/result.schema.json)" \
       > run.json
   ```
   - Steps 4–6 of the flow and the definition of done are written in `prompt.md`.
   - Claude writes the homepage into `./site/`.
   - The result JSON contains `{ok, error, stitch_project_url}`.
   - `--permission-mode dontAsk` denies anything not on the allow list instead of waiting for an answer, so a run can't stall on a prompt.
   - `--strict-mcp-config` loads only Stitch, not the other MCP servers on the account.
   - `run.json` stays in the work folder and is never pushed. It holds the full result for when the one-line `BLAD` reason isn't enough.
5. If `ok` is true and `site/index.html` exists, push the site:
   - The script writes `site/README.md` with the business name, the lead id and the Stitch project link, so the design can be adjusted in Stitch later.
   - It adds `<meta name="robots" content="noindex">` to `index.html`, so search engines don't index the public demo. It also adds an empty `.nojekyll`, so Pages serves the files as they are.
   - It creates the repo, pushes, and turns on Pages:
     ```
     cd site && git init -b main && git add -A && git commit -m "Demo strony głównej"
     gh repo create <slug> --public --description "lead <lead_id>" --source . --push
     gh api -X POST repos/JanKuchnia/<slug>/pages -f "source[branch]=main" -f "source[path]=/"
     ```
     When a re-run reuses a repo, Pages is already on, so the script ignores the "already exists" error from the last command.
   - The demo link is `https://jankuchnia.github.io/<slug>/`. Pages usually publishes within a minute or two, and the worker doesn't wait for it.
   - The repo is public, so anyone can see everything in it, the README included. The README holds nothing secret: just the business name, the lead id and the Stitch link, which only works for your Stitch account. `run.json` stays in the work folder and never reaches the repo.
6. Call `finish_site_job()` with one of two results:
   - `GOTOWA`, `https://github.com/JanKuchnia/<slug>` and the demo link
   - `BLAD` and the error from Claude, git or `gh`

Steps 5 and 6 are in the script, not left to Claude. That way a repo is created only for a finished site, and the repo name is always predictable. Work folders are kept for debugging; delete them by hand.

### What Claude can touch (`claude-settings.json`)

```json
{
  "permissions": {
    "deny": ["Read(~/.config/gh/**)", "Read(~/.config/site-worker/**)"]
  },
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true,
    "filesystem": { "denyRead": ["~/.config/gh", "~/.config/site-worker"] }
  },
  "hooks": {
    "PostToolUse": [{
      "matcher": "mcp__stitch__generate_screen_from_text|mcp__stitch__edit_screens|mcp__stitch__generate_variants",
      "hooks": [{ "type": "command", "command": "cat ~/dashboard-dudka/5-site-worker/stitch-reminder.json" }]
    }]
  }
}
```

- Bash commands run in the sandbox. They can write only inside the work folder, and they have no network access because no domains are allowed.
- Neither Claude's tools nor its Bash commands can read the GitHub or worker credentials, or the cached Supabase token.
- Web research goes through `WebSearch` and `WebFetch`.

### When Stitch asks questions

Sometimes Stitch replies with a question or with suggestions (such as "Yes, make them all") instead of, or alongside, a screen. These replies come back in the tool result's `output_components`. Today Claude misses them because the call times out and the Stitch tool description tells it to check `get_screen` instead. That path shows only the screens and never the message.

**Why the call times out:** Stitch is an HTTP MCP server, and Claude Code gives each HTTP request 60 seconds by default, while Stitch takes minutes to generate.

The fixes, cheapest first:

1. **Make the call wait for Stitch.** Add `"timeout": 300000` (5 minutes) to the Stitch entry in `stitch.json`. Most generations finish within that, so the call returns Stitch's whole reply, questions included, instead of timing out into the `get_screen` path. If a generation takes longer, Claude waits another 5 minutes (step 5).
2. **Leave Stitch nothing to ask.** `prompt.md` tells Claude to give Stitch a complete prompt: business name and category, Polish copy, the homepage's sections from the plan, style and colors (from `site_brief` when given). Every prompt ends with "Nie zadawaj pytań. Podejmij rozsądne decyzje i wygeneruj ekran teraz."
3. **Claude answers for us.** The tool description says to show Stitch's questions to the user, and in a headless run there is no user. `prompt.md` says:
   - Claude acts as the user. After every Stitch call it reads `output_components` before looking at any screens.
   - When there's a question, Claude answers it by calling `generate_screen_from_text` again, with the answer as the prompt.
   - When there are suggestions, Claude picks the one that fits the plan. It turns down any offer to make more pages, because v1 builds only the homepage.
   - It allows at most two rounds. After that, it ends with `ok: false` and puts Stitch's question in `error`, which the worker saves to `site_error`. Over time, those errors show what to add to `prompt.md`.
4. **A hook makes sure Claude doesn't skip step 3.** A `PostToolUse` hook on Stitch's three generating tools adds a fixed reminder after every result. The hook sits in `claude-settings.json` and reads the reminder from `stitch-reminder.json`:
   ```json
   {"hookSpecificOutput": {"hookEventName": "PostToolUse",
     "additionalContext": "Read output_components in this Stitch result before checking screens. If Stitch asked a question or offered suggestions, answer it now, following the rules in the prompt."}}
   ```
   The reminder is the same every time, so the hook doesn't depend on the exact shape of Stitch's response.
5. **If the call isn't finished after 5 minutes**, Claude waits up to 5 more minutes. A tool call that's already running can't be extended, but Stitch keeps generating on its side after Claude Code stops waiting. So Claude checks `list_screens` every 30 seconds (`sleep 30` in Bash, at most 10 checks) and compares it with the screen count from before the call.
   - **A new screen appears:** Claude carries on with the plan. Any message Stitch sent with that screen is lost on this path. It's usually a follow-up suggestion, and the plan already says what to build next.
   - **No new screen after the extra 5 minutes:** Stitch probably asked something. Claude sends the same prompt once more with the no-questions line, and if that fails too, ends with `ok: false`.

### Repo name

1. Make a slug from `company_name`: transliterate it to ASCII (`iconv -t ascii//TRANSLIT` turns ł into l), lowercase it, and turn spaces into hyphens. For example, "Salon Fryzjerski Łucja" becomes `salon-fryzjerski-lucja`.
2. **If that repo already exists and its description is `lead <same lead_id>`,** reuse it and force-push. This happens when an earlier run created the repo but died before reporting back.
3. If it exists and belongs to another lead, add the city, `salon-fryzjerski-lucja-krakow`, and run the same check.
4. If that name is taken too, the run ends with `BLAD` ("repo name taken"), and we sort it out by hand.

The slug function gets a small test covering Polish characters, punctuation and repeated spaces.

### Failures

- Each Claude run is capped by `timeout 60m`.
- The systemd timeout (`TimeoutStartSec=90min`) is the backstop for a hung script. If systemd kills the script, the lead is left in `W_TOKU`.
- `claim_site_job()` first moves any lead still in `W_TOKU` to `BLAD` ("run przerwany"), then claims the next lead. This is safe because the timer never runs two jobs at once.
  `shortcut: assumes a single worker; switch to a started-at timestamp if a second worker is ever added.`

### Setup on the homelab (once)

1. Install Claude Code. On any machine, run `claude setup-token` and put the token in `~/.config/site-worker/env` as `CLAUDE_CODE_OAUTH_TOKEN`.
2. Install claude-seo:
   ```
   claude plugin marketplace add AgriciDaniel/claude-seo
   claude plugin install claude-seo@agricidaniel-claude-seo
   ```
3. Write `~/.config/site-worker/stitch.json`: an HTTP server at `https://stitch.googleapis.com/mcp` with an `X-Goog-Api-Key` header and `"timeout": 300000`. This is the same setup as on this machine (`claude mcp get stitch`), plus the timeout.
4. Create the homelab Supabase login and add its email and password to `env`. Make the folder readable only by you (`chmod 700 ~/.config/site-worker`).
5. `gh auth login` as JanKuchnia.
6. Clone this repo to `~/dashboard-dudka`. To update the worker later, run `git pull` there.
7. Install the two units and run `systemctl --user enable --now site-worker.timer`.
8. Do a first run by hand on one test lead (`systemctl --user start site-worker`). Check that:
   - Stitch works under these permissions, and Claude answers its questions
   - the Bash sandbox runs on the homelab, since it needs bubblewrap on Linux
   - `sleep 30` works in a headless run

### Why not a container (yet)

Most of the homelab runs in Docker, but v1 skips it. A plain systemd user service is less to maintain for one worker on one machine:

- **The sandbox and Docker conflict.** Claude Code's Bash sandbox uses bubblewrap, which can't start inside an unprivileged Docker container. The workaround (`enableWeakerNestedSandbox`) weakens the sandbox, so the container would have to become the security boundary instead.
- **A container adds moving parts.** You'd need an image with Claude Code, claude-seo and `gh` built in. You'd still need a host timer to start it, plus volumes for the config and work folders. Claude Code also updates itself, but an image has to be rebuilt to update.

A container becomes worth it in either of these cases:

- **The homelab has no systemd user services**, as on Unraid, TrueNAS or Synology, or everything there already runs in Docker.
- **You want stronger isolation against prompt injection.** Each run would get a fresh container that's thrown away afterwards and holds only the Claude token. The script on the host would keep the GitHub and Supabase credentials and do the push itself.

## Verified on this machine

These were tested on 2026-11-19 with Claude Code 2.1.323, using `claude -p` with Haiku:

- **Denying instead of waiting works.** Both `--permission-mode dontAsk` and `--permission-prompts none` denied a tool that wasn't on the allow list, in about 14 seconds and without hanging. The spec uses `dontAsk`.
- **The per-server `"timeout"` in an `--mcp-config` file works.** The test used a local stand-in MCP server whose tool takes 75 seconds. Without the setting, the call failed at the 60-second limit. With `"timeout": 120000`, it finished.
- **The hook's message reaches Claude.** A `PostToolUse` hook loaded through `--settings` fired on the MCP tool, and Claude received its `additionalContext`.
- **`--strict-mcp-config` leaves plugins alone.** Only the servers from `--mcp-config` loaded, but plugins still did, so `claude-seo:seo-local` and `claude-seo:seo-content-brief` were available.

These were not tested here, and the first homelab run covers them:

- Stitch itself, since the test used a stand-in server
- the Bash sandbox
- `sleep 30` in a headless run

## Findings

- **Claude Code fits better than agy.** claude-seo is a Claude Code plugin, so it runs natively, without the `CLAUDE_PLUGIN_ROOT` problem agy had. Stitch already works in Claude Code on this machine. Headless mode has the flags the worker needs: `--json-schema`, `--strict-mcp-config` and `--permission-mode dontAsk`.
- **Runs use your Claude plan.** The `setup-token` token bills to your subscription, so long runs count against the same usage limits as your normal Claude use. The other option is `ANTHROPIC_API_KEY` with `--max-budget-usd` as a per-run cap.
- **Some modes ignore the token.** The token only covers model requests, so it can't load claude.ai connectors. That's fine, because Stitch is a direct HTTP server. Don't use `--bare`, because it doesn't read the token.
- **The claude-seo API keys aren't needed.** PageSpeed, CrUX and Search Console measure a site that already exists, so `~/.config/claude-seo/` stays off the homelab.
- **Stitch asks questions that Claude misses.** The cause is the 60-second limit on each HTTP request to an MCP server, which Stitch's calls exceed. [When Stitch asks questions](#when-stitch-asks-questions) covers the fix.
- **Stitch's limit.** Stitch has a monthly generation limit. Building only the homepage keeps each lead to one generation, plus at most two question rounds and one resend.
- **Stitch's HTML loads Tailwind from a CDN script.** That's fine for a demo. The real site is built separately after the client agrees.
- **The repos are public because of GitHub Pages.** GitHub Free serves Pages only from public repos. As a result, every lead's demo and name show on my GitHub profile. `noindex` only keeps the demos out of search results.
- **Prompt injection.** Claude reads outside websites during research. The sandbox, the deny rules and the tool allow list keep it away from the GitHub and Supabase credentials, and from the network outside web tools. One risk remains: `CLAUDE_CODE_OAUTH_TOKEN` is in Claude's own environment, so a malicious page could try to get it leaked through `WebFetch`. The worst case is someone using your Claude plan until you revoke the token.

## Worker database access

The worker gets limited access. It does not use the `service_role` key.

- **A dedicated homelab login.** This is an ordinary Supabase email-and-password user that is *not* in `team_members`.
- **A `site_workers (email)` table**, locked down the same way as `team_members`: RLS on, and all rights revoked from `anon` and `authenticated`. A security-definer function, `is_site_worker()`, checks it, mirroring `is_team_member()`.
- **Two security-definer RPCs**, granted to `authenticated` and revoked from `public` and `anon`. Each starts with `if not public.is_site_worker() then raise exception`.
  - `claim_site_job()` first moves any lead still in `W_TOKU` to `BLAD` ("run przerwany"). It then claims the oldest `ZLECONA` lead, marks it `W_TOKU`, and returns the lead's data and `site_brief`.
  - `finish_site_job(lead_id, status, repo_url, preview_url, error)` accepts only `GOTOWA` or `BLAD`, and only for a lead that is in `W_TOKU`.
- **The existing schema already keeps the login out.** RLS on `leads` and `call_logs` allows only team members. The existing functions run with the caller's rights, except `undo_call` and `call_feed`, which check `is_team_member()`. So, as checked in `schema.sql`, the homelab login can do nothing except call the two new RPCs. If the homelab is compromised, the attacker can't read or change the rest of the CRM.

## Decided

- A lead that is `GOTOWA` is never rebuilt.
- Repos are public, on my GitHub account, named after the business. GitHub Free serves Pages only from public repos.
- The generator runs on the Claude Code CLI, not agy.
- The output is a demo for the client. If they agree, I clone it and build the real site by hand.
- Only the homepage is generated, and it's judged on design.
- The button is only available at the `OFERTA` and `WYGRANA` deal stages.
- The brief field is optional. When it's filled in, it takes priority over the research, which is still used.
- The research results are the content. The Google data only tells Claude where to look.
- The worker code lives in this repo under `5-site-worker/` and is never uploaded to Vercel.
- The demo goes out to the client as a GitHub Pages link.
- Only I can push to the repos. The CFO isn't added as a collaborator for now.
- The homelab (Debian) runs the worker as a systemd user service, not in Docker.
- The worker gets limited database access through its own login and two RPCs, not the `service_role` key.

## Not in v1

- Pages other than the homepage.
- SEO extras.
- Generating many leads at once.

## Open questions

None.
