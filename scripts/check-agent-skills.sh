#!/usr/bin/env bash
# Reports which agents on this machine can find the skills that the PRD and plan workflow needs.
# Read-only. See docs/standards/ai-agents.md.
set -u

SKILLS=(brainstorming writing-plans executing-plans sparc-spec goal-plan antislop antislop-copywriting)

# Skills that ship with this repository (antislop) count for every agent that reads them.
REPO="$(cd "$(dirname "$0")/.." && pwd)"

# agent name | folders searched (colon separated)
AGENTS=(
  "claude|$REPO/.claude/skills:$HOME/.claude/skills:$HOME/.claude/plugins/cache"
  "codex|$REPO/.claude/skills:$HOME/.codex/skills:$HOME/.codex/superpowers:$HOME/.agents/skills"
  "gemini|$REPO/.claude/skills:$HOME/.gemini/skills:$HOME/.gemini/extensions:$HOME/.agents/skills"
  "antigravity|$REPO/.claude/skills:$HOME/.gemini/antigravity/skills:$HOME/.gemini/antigravity-ide:$HOME/.agents/skills"
  "kiro|$REPO/.claude/skills:$HOME/.kiro/skills:$HOME/.kiro/powers"
)

hint() {
  case "$1" in
    brainstorming|writing-plans|executing-plans) echo "install Superpowers: https://github.com/obra/superpowers" ;;
    sparc-spec|goal-plan) echo "install Ruflo: claude mcp add claude-flow -- npx -y @claude-flow/cli@latest" ;;
    *) echo "link it: ln -s ~/.agents/skills/$1 <agent skills folder>/$1" ;;
  esac
}

found() {
  local roots="$1" skill="$2" root
  IFS=':' read -ra dirs <<<"$roots"
  for root in "${dirs[@]}"; do
    [ -d "$root" ] || continue
    [ -n "$(find -L "$root" -maxdepth 7 -type d -name "$skill" -print -quit 2>/dev/null)" ] && return 0
  done
  return 1
}

missing=0
for entry in "${AGENTS[@]}"; do
  name="${entry%%|*}"
  roots="${entry#*|}"
  echo "== $name"
  for skill in "${SKILLS[@]}"; do
    if found "$roots" "$skill"; then
      printf '  ok       %s\n' "$skill"
    else
      printf '  MISSING  %s  (%s)\n' "$skill" "$(hint "$skill")"
      missing=$((missing + 1))
    fi
  done
done

echo
if [ "$missing" -eq 0 ]; then echo "All skills found for every agent."; else echo "$missing gap(s). Fix them, then run this again."; fi
exit $(( missing > 0 ))
