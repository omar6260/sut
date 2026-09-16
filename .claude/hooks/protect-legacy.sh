#!/bin/sh
# Bloque toute écriture de Claude Code dans legacy/ (prototype en lecture seule).
# Reçoit le JSON de l'outil sur stdin ; code 2 = refus, message renvoyé à l'agent.
# Attention : src/legacy/ est autorisé, seul <racine>/legacy/ est protégé.
root="${CLAUDE_PROJECT_DIR:-$(pwd)}"
input=$(cat)
file=$(printf '%s' "$input" | node -e '
  let s = ""; process.stdin.on("data", d => s += d).on("end", () => {
    try { const j = JSON.parse(s); process.stdout.write(j.tool_input?.file_path ?? j.tool_input?.notebook_path ?? ""); } catch {}
  });')
[ -z "$file" ] && exit 0
case "$file" in
  /*) abs="$file" ;;
  *)  abs="$root/$file" ;;
esac
case "$abs" in
  "$root"/legacy/*)
    echo "REFUSÉ : $file est dans legacy/ (prototype en lecture seule, règle CLAUDE.md). Travaille dans src/legacy après la phase 03." >&2
    exit 2 ;;
esac
exit 0
