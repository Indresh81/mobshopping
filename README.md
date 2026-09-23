# Karina Kapoor Mobiles

A small mobile phone store built as a dependency-free Node.js application. It includes:

- Password-protected registration and login
- Server-side password hashing with Node's `crypto.scrypt`
- HTTP-only session cookies
- A product catalogue with shared product data
- Product-aware checkout and quantity totals
- Server-side order validation and JSON persistence
- Order confirmation pages tied to a real order ID
- Responsive, accessible frontend styling

## Requirements

- Node.js 18 or newer

No npm packages are required.

## Run locally

```bash
npm start
```

Then open [http://localhost:3000](http://localhost:3000).

For development with Node's built-in file watcher:

```bash
npm run dev
```

The server binds to `0.0.0.0` so it can also be used in a container or a hosted preview. Set a different port with `PORT=4000 npm start`.

## Main routes

| Route | Purpose |
| --- | --- |
| `/` or `/index.html` | Sign in |
| `/registration.html` | Create an account |
| `/phone.html` | Product catalogue |
| `/Booking.html` | Checkout |
| `/finalpage.html?order=...` | Order confirmation |

The previous filenames remain available as redirects where practical, including `registeration form.html`, `products.html`, `checkout.html`, and `confirmation.html`.

## Data and security notes

- User accounts and orders are stored in `.data/db.json`, which is ignored by Git.
- Sessions are held in server memory and expire after seven days. Restarting the server signs users out.
- Passwords are never stored as plain text; only a scrypt hash and unique salt are persisted.
- This is a small demo application. For production, use a real database, HTTPS everywhere, a managed session store, email verification, rate limiting, structured logging, backups, and a payment provider.

## Checks

```bash
npm run check
```

This checks the server and browser JavaScript syntax. The application intentionally has no third-party runtime dependencies.
