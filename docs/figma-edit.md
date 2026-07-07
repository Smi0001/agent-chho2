# figma-edit: creating and updating designs

The `figma` capability (remote MCP) is read-only. To create or modify designs from a
prompt, the designer role uses a second capability, `figma-edit`, backed by the
community server [`claude-talk-to-figma-mcp`](https://github.com/arinspunk/claude-talk-to-figma-mcp)
(CTF, MIT). It drives the Figma Plugin API — the only interface that can write design
nodes — through a companion desktop plugin over a localhost WebSocket.

This is experimental. Wireframes and structural layouts are realistic; polished visual
design is not, because the model composes low-level node operations.

## Topology

Three local processes cooperate:

1. **MCP server** (`claude-talk-to-figma-mcp-server`). chho2 spawns this per run. It
   connects to the socket server on `ws://localhost:3055`.
2. **Socket server** (`claude-talk-to-figma-mcp-socket`). You run this once and leave
   it up. It relays messages between the MCP server and the plugin.
3. **Figma plugin**, imported into Figma Desktop and running in the open file. It joins
   a channel on the socket; the agent pairs by calling `join_channel` with that id.

Nothing leaves your machine except the design operations Figma itself syncs to its
cloud, which is the same file you already edit by hand.

## Known limitation: Linux (figma-linux)

Figma ships no official Linux desktop app. The community `figma-linux` snap cannot load
local **development** plugins — importing the plugin manifest fails with "An error
occurred while loading the plugin environment / Unable to load code", regardless of the
manifest or `code.js`. This blocks any local plugin-bridge (both `figma-edit` and
`figma-express`) on Linux; it is a client limitation, not a chho2 or server issue. chho2's
own side still verifies on Linux (`agent-chho2 mcp figma-edit` enumerates the tools, and
the socket runs). To exercise create/update-design end to end, use official Figma Desktop
on macOS or Windows, or a Community-published bridge plugin (published plugins load on
figma-linux; local dev imports do not).

## Windows E2E runbook (self-contained)

Official Figma Desktop for Windows loads local dev plugins, so run the end-to-end check
there. All commands are PowerShell.

```powershell
# 1. agent-chho2 (this feature branch) + a provider token
git clone https://github.com/Smi0001/agent-chho2.git
cd agent-chho2; git checkout feat/figma-designer; npm install
# put CLAUDE_CODE_OAUTH_TOKEN=... in .env (same token used elsewhere)

# 2. bun (the CTF socket server uses Bun.serve); restart the shell afterwards
powershell -c "irm bun.sh/install.ps1 | iex"

# 3. CTF socket + the full plugin (npm ships only the manifest, so copy code.js from the repo)
mkdir $HOME\figma-bridge; cd $HOME\figma-bridge
npm i claude-talk-to-figma-mcp@1.0.0
git clone --depth 1 https://github.com/arinspunk/claude-talk-to-figma-mcp.git ctf-src
mkdir plugin; copy ctf-src\src\claude_mcp_plugin\* plugin\
# In plugin\manifest.json delete the line  "enablePrivatePluginApi": true,  (entitlement-gated)

# 4. start the socket (leave this window open)
bun node_modules\claude-talk-to-figma-mcp\dist\socket.js
```

Then in **Figma Desktop (Windows)**:
1. Open a throwaway **Draft** design file (not Dev Mode).
2. Quick Actions (`Ctrl + /`) -> `Import plugin from manifest` -> pick
   `%USERPROFILE%\figma-bridge\plugin\manifest.json`.
3. Quick Actions -> run `Claude Talk to Figma` -> copy the **channel id**.

Finally, back in the agent-chho2 window:
```powershell
$env:FIGMA_CHANNEL="<channel-id-from-plugin>"
npm run dev -- run designer create-design prompt="A login screen: logo, email + password fields, primary button, 'forgot password' link" --permissions allowlist
```
Expect a wireframe/structural layout to appear in the open file; polished visual design is
out of scope. If import still errors, check Figma Desktop is updated and you are not in Dev
Mode. The macOS steps are identical apart from paths and the bun install
(`curl -fsSL https://bun.sh/install | bash`).

## One-time setup (reference)

Do this on **macOS or Windows Figma Desktop** (see the Linux limitation above).

Requirements: Node.js, Figma Desktop, and **bun**. The socket server uses `Bun.serve`,
so it needs the bun runtime (the MCP server that chho2 spawns runs on node and does not).
Install bun with `curl -fsSL https://bun.sh/install | bash` (then add `~/.bun/bin` to
PATH). The `figma-express` backend below needs no bun.

1. Start the socket server and leave it running. Its published bin has no `node` shebang
   and calls `Bun.serve`, so run it with bun rather than the bin name:

   ```bash
   mkdir -p ~/.figma-bridge && cd ~/.figma-bridge
   npm i claude-talk-to-figma-mcp@1.0.0
   bun node_modules/claude-talk-to-figma-mcp/dist/socket.js
   ```

2. Get the plugin code. The npm package ships only the plugin `manifest.json`, not its
   `code.js`/`ui.html` (Figma reports "Unable to load code" if you import from the
   package). Fetch the full plugin folder from the repo instead:

   ```bash
   tmp=$(mktemp -d)
   git clone --depth 1 https://github.com/arinspunk/claude-talk-to-figma-mcp.git "$tmp/ctf"
   mkdir -p ~/.figma-bridge/plugin
   cp -f "$tmp/ctf/src/claude_mcp_plugin/"* ~/.figma-bridge/plugin/ && rm -rf "$tmp"
   ```

   In Figma Desktop, open a design file (import is unavailable from the home screen and
   from Dev Mode; the plugin's editorType is figma/figjam). Use Quick Actions
   (`Ctrl`/`Cmd` + `/`) → `Import plugin from manifest` and pick
   `~/.figma-bridge/plugin/manifest.json`. It imports as a local development plugin (it
   uses proposed/private Plugin APIs, so it is not a published plugin).

3. Run the plugin: Quick Actions (`Ctrl`/`Cmd` + `/`) → `Claude Talk to Figma`, and note
   the **channel id** it shows. Create designs in a throwaway Draft, not a real file.

4. Optional: put the channel id in your environment so you do not paste it each run:

   ```bash
   FIGMA_CHANNEL=<channel-id-from-plugin>
   ```

## Running a design task

Create and update are gated writes. Because a single task calls dozens of distinct
write tools, the designer role pre-approves the whole `figma-edit` server with a
`figma-edit.*` entry in its `allowWrites`. That takes effect only under
`permissions.mode: allowlist`; under the default `ask` mode you approve per tool.

```bash
# allowlist mode: figma-edit writes are pre-approved for the designer role
agent-chho2 run designer create-design prompt="A login screen: logo, email + password fields, primary button, 'forgot password' link" --permissions allowlist

agent-chho2 run designer update-design figmaUrl="https://www.figma.com/file/…?node-id=…" prompt="Change the primary button to #E63946 and increase vertical spacing to 16px"
```

The socket server and the plugin must be running, and the plugin must be paired to the
open file, or `join_channel` and every write call will fail.

## Security and compliance

- **Third-party code with write access to your designs.** CTF is MIT and its source was
  reviewed before wiring (readable TypeScript, minimal dependencies). It runs locally
  and holds no token. Re-review on version bumps; the pin is `FIGMA_EDIT_VERSION` in
  `src/mcp/registry.ts`.
- **Destructive operations exist** (`delete_node`, `delete_page`). Figma version history
  is the recovery path. Run against a branch or a copy first.
- **Design content may contain personal data.** Under the DPDP Act 2023, do not build or
  edit designs that embed real customer, policyholder, or health data; use synthetic or
  redacted content. Regulated-data review applies as for any capability that touches
  real data.

## Alternative backend: figma-express (non-commercial)

`figma-express` (`figma-mcp-express`, a Go plugin-bridge with a compact batch-ops tool
surface) is wired as an interchangeable alternative to `figma-edit`. Both write designs;
pick one per task by setting the task's `capabilities` to `[figma-express]`.

> **License notice — non-commercial use only.** The `figma-mcp-express` `LICENSE` file
> carries the **Commons Clause License Condition v1.0** (the npm `license` field reports
> MIT, but the file adds a restriction). Commons Clause forbids *selling* the software,
> where selling includes offering, for a fee, a product or service whose value derives
> substantially from it. Internal use is fine. **Do not enable this capability in any
> copy of chho2 that is sold, resold, or offered as a paid product or service, and do not
> redistribute it for sale.** `figma-edit` (CTF) is MIT and carries no such restriction;
> prefer it if there is any chance of commercial distribution.

Setup mirrors `figma-edit` (a socket/channel + its own Figma desktop plugin), but the
plugin and install steps are specific to that project — follow its README
(<https://github.com/sunhome243/figma-mcp-express>). chho2 spawns the server with
`npx -y figma-mcp-express@<pinned> --port 1994`. Gating differs: its write tools are
classified by the name heuristic (not an explicit list), and the designer role
pre-approves the server with `figma-express.*` the same way as `figma-edit`.

Notes: it ships as ~149 MB of precompiled Go binaries (an opaque supply-chain surface
versus CTF's readable TypeScript), which is a reason to prefer `figma-edit` unless you
specifically want the compact batch-ops workflow.
