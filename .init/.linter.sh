#!/bin/bash
cd /home/kavia/workspace/code-generation/gadget-store-with-real-time-delivery-tracking-207745-207754/shop_backend
npm run lint
LINT_EXIT_CODE=$?
if [ $LINT_EXIT_CODE -ne 0 ]; then
  exit 1
fi

