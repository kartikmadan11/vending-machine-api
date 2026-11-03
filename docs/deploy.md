# Deploying

The web client is a static site on Vercel.
The API runs as one long-running process on a host that keeps it up, and Vercel forwards `/api/*` to it.

```text
browser -> https://<site>/             -> Vercel CDN: web/dist
browser -> https://<site>/api/machine  -> Vercel route -> ${VENDING_API_URL}/machine -> uvicorn, one process
```

## Why the API is not a Vercel Function

The machine is deliberately one process: the coin supply, the sealed cash box, the rate limiter and the purchase lock all live in its memory.
Vercel runs a FastAPI app as a Vercel Function on Fluid compute, which starts another instance whenever no running one has spare capacity, and there is no setting that caps the number of instances.
Every instance would be a separate machine with its own ten of each coin, its own cash box and its own limiter.
At low traffic, requests usually reuse one warm instance, so it looks right in a quick test and then goes wrong:

- **The panel jumps.**
  The page polls `GET /machine` every two seconds, and a poll that lands on another instance shows coins coming back and the cash box going down.
- **The machine refills on its own.**
  A new instance starts full, which happens on scale-out, when an idle instance is shut down, and on every deploy.
- **The rate limit stops being exact.**
  Each instance counts attempts on its own, so four attempts in five seconds can all be let through, and the README's "at most three in any five seconds" no longer holds.
- **The 409 demo is not repeatable.**
  The second £20 purchase of Mints, which should be refused because the first left too little change in the tubes, sells when it reaches a fresh instance.

Moving the state to a shared store such as Redis or Postgres would fix all of this, but it rewrites the machine and the limiter around that store and adds a network round trip and a vendor to every purchase.
It is the right move if the API ever needs more than one process, as the README's trade-offs say, and not before.

## How the pieces fit

- **`web/vercel.json`** builds the client with the Vite preset and sends `/api/<path>` to `${VENDING_API_URL}/<path>`, dropping the `/api` prefix as the Vite dev proxy does.
  The variable is expanded on each request, so the API host is set in the Vercel project, not in the repository.
- **`respectOriginCacheControl: false`** on that route means Vercel never caches an API answer, even if a `Cache-Control` header is added to the API later.
  The machine state is live, so a cached `GET /machine` would be wrong.
- **`web/scripts/check-api-url.mjs`** runs before the build on Vercel and fails it if `VENDING_API_URL` is missing or malformed, for example not https or ending with a slash.
  An unset variable would otherwise leave the route pointing at the literal text `${VENDING_API_URL}`, and every API call would 404.
- **The "API docs" link** in the page goes straight to `${VENDING_API_URL}/docs`, because Swagger UI loads `/openapi.json` from the root of the host that serves it.
  The API host is therefore public as well as the site.
- **There is no CORS.**
  The browser only talks to the Vercel site, and Vercel talks to the API.
- **Local development is unchanged.**
  `vercel.json` and the check only run on Vercel, and `npm run dev` still proxies to `http://127.0.0.1:8000`.

## The API host

Any host that runs one long-lived Python process works.
What matters is that there is exactly one machine:

- one process, with one uvicorn worker, which is the default, so never `--workers`;
- one instance or replica, with autoscaling off;
- ideally no sleeping or scale to zero, since a cold start is a restart and a restart refills the machine.

Sleeping is the one rule a demo can bend.
A host that sleeps still runs a single machine, and waking it only refills it, as a deploy does.
What must never happen is a second instance, because two machines at once give wrong answers rather than a fresh start.

The commands, from the repository root:

```sh
uv sync --frozen --no-dev                                                  # build
uv run --frozen --no-dev uvicorn vending.api:app --host 0.0.0.0 --port $PORT  # start
```

`$PORT` is the port the host gives the service.
`GET /machine` makes a good health check, because it answers without changing anything.

Settings that matter on the common hosts:

- **Render.**
  Keep the instance count at one.
  Render adds uv when it finds `uv.lock` in the root directory.
  A free web service spins down after 15 minutes without traffic and takes about a minute to wake on the next request, and a paid instance type stays up.
- **Railway.**
  Keep the default of one replica and leave Serverless off.
- **Fly.io.**
  `fly launch` creates two Machines that stop when idle, which would be two machines that each refill.
  Launch with `--ha=false`, or run `fly scale count 1`, and set `auto_stop_machines = "off"` and `min_machines_running = 1` in `fly.toml`.

A deploy of the API restarts it, which refills the machine.
Restarting the service is also the way to refill it on purpose.

## Setting up the Vercel project

Importing the repository in the dashboard needs no CLI:

1. In the Vercel dashboard, choose **Add New**, then **Project**, and import the GitHub repository.
2. Set **Root Directory** to `web`.
   The framework preset reads **Vite**, and `vercel.json` supplies the install and build commands.
3. Under **Environment Variables**, add `VENDING_API_URL` with the API's https origin and no trailing slash, for example `https://vending-api.example.com`, for **Production** and **Preview**.
4. Deploy.

Vercel then deploys every push to `main` to production and every other branch to a preview.
Changing `VENDING_API_URL` takes effect on the next deployment, so redeploy after changing it.

To check a deployment:

```sh
curl -s https://<your-site>/api/machine
```

It should return the API's `{"coins": [...], "cash_box": ...}`, and the page should show **API connected**.

### With the CLI instead

The same steps with Vercel CLI, run from the repository root rather than from `web/`.
They fetch the CLI from npm, which the dashboard route above avoids.

```sh
npx vercel@latest login
npx vercel@latest link                                # create the project; give web as the code directory
npx vercel@latest env add VENDING_API_URL production
npx vercel@latest env add VENDING_API_URL preview
npx vercel@latest deploy --prod
```

If `link` does not ask for the code directory, set **Root Directory** to `web` in the project settings before deploying.

## The live deployment

- **The site** is <https://vending-machine-lime.vercel.app>, a Vercel project named `vending-machine` with `VENDING_API_URL` set for Production and Preview.
- **The API** is <https://vending-machine-api-licw.onrender.com>, a free Render web service with one instance and the build and start commands above.
  Render deploys every push to its branch, which restarts the API and refills the machine.
- **The site was deployed through Vercel's REST API** by uploading the files in `web/`, so the project is not linked to the repository and a push does not redeploy it.
  To deploy changes on push, connect the repository in the project's settings and set **Root Directory** to `web`, or deploy by hand with the CLI steps above.
- **The API sleeps** after 15 minutes without a request, and Render says starting it again takes up to a minute.
  The first visit after that says **Connecting** until the API answers, or **API offline** with a note that it may be waking up if the proxy gives up first, and the machine it finds is refilled.
  An open page polls every two seconds, so the API stays awake for as long as anyone has the page open.

## Things to know

- **Every visitor shares one machine.**
  On a public site, anyone can empty the coin supply, and it stays empty until the API restarts.
  The limiter keys on the `customer_id` in the request body, so it shapes the demo rather than stopping abuse.
  The README's demo assumes a full machine, so restart the API before showing it.
- **Previews share production's machine** when Preview uses the same `VENDING_API_URL`.
  Point Preview at a second API instance to keep them apart.
- **Deployment Protection covers the site, not the API.**
  Depending on the team's default, previews can sit behind Vercel Authentication, while the API host stays public.
- **When the API is down or asleep**, Vercel answers `/api/*` with a 502 or 504, and the page shows **API offline**, says the API may be waking up, and disables **Buy**.
  It keeps polling, one request at a time, and reconnects by itself when the API answers.
- **To accept only traffic from Vercel**, a route transform can add a secret header to every forwarded request, as in Vercel's guide to restricting an origin.
  The API would then need a check for that header, with `/docs` and `/openapi.json` exempt or the docs link moved behind the proxy.
  That is a code change to the API and is not done here.
