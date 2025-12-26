#!/bin/bash
# Common color definitions

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[0;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Helper functions
info() {
    echo -e "${BLUE}-> $1${NC}"
}

success() {
    echo -e "${GREEN}-> $1${NC}"
}

warn() {
    echo -e "${YELLOW}-> $1${NC}"
}

error() {
    echo -e "${RED}-> $1${NC}"
}

section() {
    echo -e "${GREEN}=== $1 ===${NC}"
}
