# Architecture and Operations

## Request Flow

1. The browser calls `GET /api/capacity` before enabling PDF upload.
2. `POST /api/jobs` atomically reserves one of the active-task slots in D1.
3. After the reservation succeeds, the Pages Worker stores the PDF in R2 and sends one Queue message.
4. The Queue Worker processes one report at a time and calls Gemini in seven serial rounds.
5. Each round is written to D1 immediately. The browser polls the job endpoint with adaptive intervals.
6. On completion or terminal failure, the temporary R2 object is deleted.

## Persistence

- `jobs`: queue state, progress, interaction ID, seven report outputs, errors, and TTL.
- `service_state`: site-wide daily-quota and billing-pause flags.
- R2: temporary PDF objects under `jobs/<uuid>.pdf`.

Do not use browser state as the source of truth for capacity or report completion.

## Gemini Session Shape

The first round uploads and reads the PDF. Later rounds reuse the Gemini interaction ID so the model can continue within the same context without resending the PDF. Keep the order:

1. Overview
2. Career Phase 1
3. Career Phase 2
4. Career Phase 3
5. Career Phase 4
6. Love
7. Life guidance

## Capacity and Concurrency

- The template reserves at most five `queued` or `processing` rows.
- Queue consumer `max_concurrency` is one.
- The database reservation must remain atomic to prevent simultaneous uploads from exceeding capacity.
- Frontend disabling is user feedback, not a security or capacity boundary.

## Quota States

### Daily quota

When Gemini reports a daily quota error:

- Persist the Pacific-time reset epoch.
- Keep the job queued, its PDF in R2, and all completed rounds in D1.
- Delay the Queue message until reset.
- Close intake and explain that progress will resume automatically.

### Prepaid balance

When Gemini reports depleted prepaid credits:

- Set `gemini_billing_paused=1` in `service_state`.
- Close intake before the browser reads or uploads a PDF.
- Keep queued task progress and retry conservatively.
- After the owner restores credit or switches to the free tier, remove the pause explicitly:

```sql
DELETE FROM service_state WHERE key = 'gemini_billing_paused';
```

## Deployment Checklist

1. Scan for secrets and personal data.
2. Confirm source and `dist/` are synchronized.
3. Run JavaScript syntax checks and `wrangler deploy --dry-run` for the Queue Worker.
4. Apply D1 migrations before deploying code that queries new tables.
5. Deploy the Queue Worker, then Pages.
6. Verify `/api/capacity`, upload rejection states, Queue consumer bindings, and active D1 counts.
7. Purge a production Queue only after the user explicitly approves the irreversible deletion.

