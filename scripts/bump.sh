#!/usr/bin/env bash
# Sets the plugin version in each manifest.
#   ./scripts/bump.sh <major|minor|patch|x.y.z>
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <major|minor|patch|x.y.z>" >&2
  exit 1
fi

files=(
  "plugins/taskade/plugin.json"
  "plugins/taskade/.claude-plugin/plugin.json"
  "plugins/taskade/.cursor-plugin/plugin.json"
  ".claude-plugin/marketplace.json"
)

current_version="$(sed -nE 's/^[[:space:]]*"version": "([0-9]+\.[0-9]+\.[0-9]+)".*/\1/p' "${files[0]}" | head -n 1)"
if [[ -z "$current_version" ]]; then
  echo "No version found in ${files[0]}. Write it as \"version\": \"x.y.z\"." >&2
  exit 1
fi
IFS=. read -r major minor patch <<< "$current_version"
# Read each part in base 10, so that a part such as 08 is not read as octal.
major=$((10#$major))
minor=$((10#$minor))
patch=$((10#$patch))

case "$1" in
  major) new_version="$((major + 1)).0.0" ;;
  minor) new_version="$major.$((minor + 1)).0" ;;
  patch) new_version="$major.$minor.$((patch + 1))" ;;
  *)
    if [[ "$1" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]]; then
      new_version="$1"
    else
      echo "Usage: $0 <major|minor|patch|x.y.z>" >&2
      exit 1
    fi
    ;;
esac

IFS=. read -r new_major new_minor new_patch <<< "$new_version"
if (( new_major < major || (new_major == major && new_minor < minor) || (new_major == major && new_minor == minor && new_patch <= patch) )); then
  echo "Version $new_version is not above the current version $current_version." >&2
  exit 1
fi

for file in "${files[@]}"; do
  perl -0pi -e "s/\"version\": \"[0-9]+\\.[0-9]+\\.[0-9]+\"/\"version\": \"$new_version\"/" "$file"
done

for file in "${files[@]}"; do
  if ! grep -q "\"version\": \"$new_version\"" "$file"; then
    echo "$file does not hold version $new_version. Set it by hand." >&2
    exit 1
  fi
done

echo "Updated version: $current_version -> $new_version"
echo "After the merge, tag the commit: git tag -a taskade--v$new_version -m \"taskade $new_version\""
