# freedoom — puts Freedoom in the WAD folder once, when the module is installed, then ends.
#
# Freedoom (https://freedoom.github.io) is free game data for Doom's engine: Phase 1 plays as Doom,
# Phase 2 as Doom II. Its release's zip is fetched, checked against the SHA-256 below and its two
# WADs unpacked into the folder the page lists. A marker beside them says it was done, so a WAD
# deleted from the page stays deleted. Without the network it tries again every ten minutes.
release=0.13.0
url=https://github.com/freedoom/freedoom/releases/download/v$release/freedoom-$release.zip
sha256=3f9b264f3e3ce503b4fb7f6bdcb1f419d93c7b546f4df3e874dd878db9688f59
wads=/groups/users/doom
marker=$wads/.freedoom-$release
work=$wads/.freedoom-download

if [ -e "$marker" ]; then
  echo "freedoom: $release is already in $wads"
  exit 0
fi

mkdir -p "$wads"
until curl -fLs -o "$work.zip" "$url"; do
  echo "freedoom: could not fetch $url; trying again in ten minutes"
  sleep 600
done
if ! attrs "$work.zip" | grep -q "$sha256"; then
  echo "freedoom: $url is not the release it should be (its SHA-256 is not $sha256)"
  rm "$work.zip"
  exit 1
fi
unzip -o -d "$work" "$work.zip" > /dev/null || exit 1
for wad in freedoom1.wad freedoom2.wad; do
  # One someone uploaded under the same name is theirs to keep.
  if [ ! -e "$wads/$wad" ]; then
    mv "$work/freedoom-$release/$wad" "$wads/$wad"
  fi
done
rm -r "$work" "$work.zip"
echo "$url" > "$marker"
echo "freedoom: $release put in $wads"
