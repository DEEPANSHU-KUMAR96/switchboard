# Decisions

## Built
- Webhook, inbox data, claim, reply queue with retries, login, WebSocket replay.

## Cut / not done
- React frontend, encrypted notes, search, tests, billing bonus.

## Assumptions
- Message order = occurred_at, then message_id.
- Sessions live in Redis for 8 hours.

## Known problems (fill in honestly after running the check)
- WebSocket seq can arrive slightly out of order when two copies emit at the same instant.
