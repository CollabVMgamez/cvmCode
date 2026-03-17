#!/usr/bin/env sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$SCRIPT_DIR
INSTALL_ROOT=${INSTALL_ROOT:-"$HOME/.local/share/cvmCode"}
BIN_DIR=${BIN_DIR:-"$HOME/.local/bin"}
SKIP_PATH_UPDATE=${SKIP_PATH_UPDATE:-0}

step() {
  printf '==> %s\n' "$1"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    printf 'Required command not found: %s\n' "$1" >&2
    exit 1
  fi
}

append_path_hint() {
  case ":${PATH}:" in
    *":${BIN_DIR}:"*)
      ;;
    *)
      printf '\nAdd this to your shell profile if needed:\n'
      printf '  export PATH="%s:$PATH"\n' "$BIN_DIR"
      ;;
  esac
}

step "Checking prerequisites"
require_command node

PACKAGE_MANAGER=""
if command -v pnpm >/dev/null 2>&1; then
  PACKAGE_MANAGER="pnpm"
elif command -v npm >/dev/null 2>&1; then
  PACKAGE_MANAGER="npm"
else
  printf 'Neither pnpm nor npm is available.\n' >&2
  exit 1
fi

cd "$REPO_ROOT"

if [ ! -d "node_modules" ]; then
  step "Installing repository dependencies"
  if [ "$PACKAGE_MANAGER" = "pnpm" ]; then
    pnpm install
  else
    npm install
  fi
fi

step "Building cvmCode"
if [ "$PACKAGE_MANAGER" = "pnpm" ]; then
  pnpm build
else
  npm run build
fi

step "Preparing install directory"
rm -rf "$INSTALL_ROOT"
mkdir -p "$INSTALL_ROOT"
cp "$REPO_ROOT/package.json" "$INSTALL_ROOT/package.json"
cp "$REPO_ROOT/README.md" "$INSTALL_ROOT/README.md"
cp -R "$REPO_ROOT/dist" "$INSTALL_ROOT/dist"

step "Installing runtime dependencies"
cd "$INSTALL_ROOT"
npm install --omit=dev --ignore-scripts

step "Creating command shims"
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/cvmcode" <<EOF
#!/usr/bin/env sh
node "$INSTALL_ROOT/dist/cli/index.js" "\$@"
EOF
cat > "$BIN_DIR/cvmCode" <<EOF
#!/usr/bin/env sh
node "$INSTALL_ROOT/dist/cli/index.js" "\$@"
EOF
chmod +x "$BIN_DIR/cvmcode" "$BIN_DIR/cvmCode"

printf '\ncvmCode installed.\n'
printf 'Install root: %s\n' "$INSTALL_ROOT"
printf 'Bin dir:      %s\n' "$BIN_DIR"

if [ "$SKIP_PATH_UPDATE" != "1" ]; then
  append_path_hint
fi

printf '\nOpen a new terminal, then run:\n'
printf '  cvmCode\n'
