# WedPlan Server

Express and MongoDB API for **WedPlan**, a wedding planning platform where couples find wedding services and send booking requests, vendors publish and manage their services, and admins keep the platform clean.

- **Live API:** https://wedplan-server-plum.vercel.app
- **Live website:** https://wedplan-red-nine.vercel.app
- **Client repository:** [dev-ahsan7/WedPlan](https://github.com/dev-ahsan7/WedPlan)
- **Server repository:** [dev-ahsan7/wedplan-server](https://github.com/dev-ahsan7/wedplan-server)

## Features

- JWT check on every private route. Tokens come from Better Auth on the client and are verified with `jose` against the client's JWKS endpoint. Invalid or expired tokens get `401`.
- The user is loaded from the database on every request, so role, blocked status and plan are always fresh and never taken from the request body.
- Role middleware for `admin`, `vendor` and `customer`. The wrong role gets `403`.
- Ownership checks before every update or delete.
- Services: search across name, category, location and description, filters, price sorting, and the free plan limit of 3 active services.
- Booking requests with no duplicates for the same service and date. Only pending requests can be accepted, rejected or cancelled.
- Admin tools: users with search, role filter and blocking (blocked users are signed out everywhere), service review, and read-only transactions.
- Stripe Checkout for the Premium plan ($9.99/month). Premium is turned on only by a verified Stripe webhook, never by the success page. Vendors can cancel at the end of the billing month.

## Tech stack

Node.js, Express 5, MongoDB (official driver), jose, Stripe, dotenv, cors.

## API routes

| Method | Route | Access | What it does |
|---|---|---|---|
| GET | `/services` | Public | Approved and active services. `?search=`, `?category=`, `?location=`, `?sort=price_asc\|price_desc`, `?limit=` |
| GET | `/services/locations` | Public | Locations for the filter |
| GET | `/services/:id` | Signed in | One service (pending ones only for the owner and admins) |
| POST | `/services` | Vendor | Add a service (starts as pending) |
| PATCH | `/services/:id` | Vendor, owner | Edit a service (goes back to pending) |
| PATCH | `/services/:id/availability` | Vendor, owner | Show or hide a service |
| DELETE | `/services/:id` | Vendor owner or admin | Delete a service and cancel its pending bookings |
| GET | `/vendor/services` | Vendor | The vendor's own services |
| POST | `/bookings` | Customer | Send a booking request |
| GET | `/bookings/my` | Customer | The customer's requests |
| PATCH | `/bookings/:id/cancel` | Customer, owner | Cancel a pending request |
| GET | `/vendor/bookings` | Vendor | Requests for the vendor's services |
| PATCH | `/vendor/bookings/:id` | Vendor, owner | Accept or reject a pending request |
| POST | `/subscriptions/checkout` | Vendor | Start Stripe Checkout for Premium |
| GET | `/subscriptions/session/:sessionId` | Vendor | Payment status for the success page |
| GET | `/subscriptions/me` | Vendor | Current plan |
| POST | `/subscriptions/cancel` | Vendor | Cancel Premium at the end of the month |
| POST | `/webhooks/stripe` | Stripe | Signed webhook that turns Premium on and off |
| GET | `/admin/overview` | Admin | Dashboard numbers |
| GET | `/admin/users` | Admin | Users, `?search=` and `?role=` |
| GET | `/admin/users/:id` | Admin | One user with counts |
| PATCH | `/admin/users/:id/block` | Admin | Block or unblock a user |
| GET | `/admin/services` | Admin | All services, `?search=` and `?status=` |
| PATCH | `/admin/services/:id/status` | Admin | Approve, reject or set back to pending |
| GET | `/admin/transactions` | Admin | Subscription payments (read only) |
| GET | `/users/me` | Signed in | The signed-in user as the server sees them |

## Run locally

1. Install the packages:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the values:

   | Variable | Value |
   |---|---|
   | `MONGODB_URI` | MongoDB connection string (the same database as the client) |
   | `CLIENT_URL` | URL of the client, used for CORS and the JWKS address |
   | `PORT` | Port for local development, for example `8100` |
   | `STRIPE_SECRET_KEY` | Stripe secret key (test mode) |
   | `STRIPE_WEBHOOK_SECRET` | Webhook signing secret from Stripe |

3. Start the server:

   ```bash
   npm run dev
   ```

4. To test payments locally, forward Stripe webhooks with the Stripe CLI and use its `whsec_...` value as `STRIPE_WEBHOOK_SECRET`:

   ```bash
   stripe listen --forward-to localhost:8100/webhooks/stripe
   ```

## Deploy on Vercel

1. Import this repository as a Vercel project. `vercel.json` sends every request to `index.js`.
2. Add the environment variables from the table above, with `CLIENT_URL` set to the live client address.
3. Also add `NODEJS_HELPERS=0`. It stops Vercel from reading the request body first, so the Stripe webhook can check its signature on the raw body.
4. In the Stripe dashboard, add a webhook endpoint at `<server URL>/webhooks/stripe` for the events `checkout.session.completed`, `checkout.session.expired`, `customer.subscription.updated` and `customer.subscription.deleted`, and use its signing secret as `STRIPE_WEBHOOK_SECRET`.

## Scripts

- `npm run make-admin -- someone@example.com` gives an existing account the admin role. Admins can't sign up from the website.
- `npm run seed-demo` adds demo vendors and services. Demo vendors have no password, so nobody can sign in as them.
