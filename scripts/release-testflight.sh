#!/bin/bash
set -euo pipefail

if [[ ( $# != 5 && $# != 6 ) || ( "$1" != check && "$1" != upload ) ]]; then
  printf 'Usage: bash scripts/release-testflight.sh check|upload VERSION BUILD COMMIT TEAM [off|demo|live]\n' >&2
  exit 1
fi
action=$1
export MARKETING_VERSION=$2 BUILD_NUMBER=$3 EXPECTED_COMMIT=$4 EXPECTED_APPLE_TEAM_ID=$5
export NOOKGRID_ADS=${6-off}
export APPLE_TEAM_ID=$EXPECTED_APPLE_TEAM_ID
export GH_TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-}}" GH_HOST=github.com GH_PROMPT_DISABLED=1
if [[ -z "$GH_TOKEN" ]]; then
  printf 'Provide command-scoped personal GH_TOKEN access; the saved GitHub login is not used.\n' >&2
  exit 1
fi
cd "$(dirname "$0")/.."
node scripts/check-testflight-inputs.mjs
node scripts/check-release.mjs

repository=AlexJubs/nookgrid
environment="repos/$repository/environments/ios-testflight"
gh api "$environment" --silent
team=$(gh api "$environment/variables/APPLE_TEAM_ID" --jq '.value')
if [[ "$team" != "$EXPECTED_APPLE_TEAM_ID" ]]; then
  printf 'The ios-testflight environment does not match the reviewed Apple team.\n' >&2
  exit 1
fi
secret_names=$(gh api "$environment/secrets?per_page=100" --paginate --jq '.secrets[].name')
for name in IOS_CERTIFICATE_BASE64 IOS_CERTIFICATE_PASSWORD IOS_PROFILE_BASE64 KEYCHAIN_PASSWORD ASC_KEY_ID ASC_ISSUER_ID ASC_PRIVATE_KEY; do
  if ! printf '%s\n' "$secret_names" | grep -Fxq "$name"; then
    printf 'Missing ios-testflight secret: %s\n' "$name" >&2
    exit 1
  fi
done
printf 'Source, CI and release setting names verified. Apple authentication is checked during upload.\n'
if [[ "$action" == check ]]; then exit 0; fi

gh workflow run release-testflight.yml --repo "$repository" --ref main \
  -f "version=$MARKETING_VERSION" -f "build_number=$BUILD_NUMBER" \
  -f "expected_commit=$EXPECTED_COMMIT" -f "expected_team_id=$EXPECTED_APPLE_TEAM_ID" -f "ad_mode=$NOOKGRID_ADS"
printf 'Upload workflow requested: https://github.com/%s/actions/workflows/release-testflight.yml\n' "$repository"
printf 'Verify its result, Apple processing and TestFlight availability. App Review is a separate step.\n'
