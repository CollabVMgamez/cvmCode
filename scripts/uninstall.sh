#!/usr/bin/env sh
set -eu

INSTALL_ROOT=${INSTALL_ROOT:-"$HOME/.local/share/cvmCode"}
BIN_DIR=${BIN_DIR:-"$HOME/.local/bin"}

step() {
  printf '==> %s\n' "$1"
}

step "Removing installed runtime"
rm -rf "$INSTALL_ROOT"

step "Removing command shims"
rm -f "$BIN_DIR/cvmcode" "$BIN_DIR/cvmCode"

printf '\ncvmCode uninstalled.\n'
printf 'Removed install root: %s\n' "$INSTALL_ROOT"
printf 'Removed shims from:  %s\n' "$BIN_DIR"
