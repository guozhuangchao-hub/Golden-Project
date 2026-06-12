#!/bin/bash
source /opt/golden-project/.env
exec node /opt/golden-project/gp-agent.js "$@"
