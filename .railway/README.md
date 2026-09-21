# Railway IaC

New Railway services do not read `railway.toml`. This file is the host graph.

```bash
railway login
railway link
railway config apply
```

`DATABASE_URL` is auto-injected into `complyline` by the linked `postgres` resource above - no manual config needed. Set `ASSEMBLYAI_API_KEY` in Railway after apply. Do not add an HTTP healthcheck on `/v1/boot-status`; Express binds `PORT` before the 12-session warm, so TCP on `PORT` is the ready signal.
