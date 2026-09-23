const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT) || 3000;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, '.data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const MAX_BODY_SIZE = 1024 * 1024;

const PRODUCTS = [
  {
    id: 'nokia-1100',
    name: 'Nokia 1100',
    price: 999,
    emoji: '☎️',
    accent: 'sunset',
    description: 'A dependable classic for calls, texts, and everyday simplicity.'
  },
  {
    id: 'devuda-devuda',
    name: 'Devuda Devuda',
    price: 99999,
    emoji: '✨',
    accent: 'violet',
    description: 'A playful flagship concept with a bold personality.'
  },
  {
    id: 'iphone',
    name: 'iPhone',
    price: 85000,
    emoji: '',
    accent: 'graphite',
    description: 'Premium performance, a polished design, and an excellent camera.'
  },
  {
    id: 'landline',
    name: 'Landline',
    price: 999,
    emoji: '☎',
    accent: 'ocean',
    description: 'A familiar home phone for clear, reliable calling.'
  },
  {
    id: 'pco',
    name: 'PCO Phone',
    price: 8999,
    emoji: '📞',
    accent: 'mint',
    description: 'A practical communication device with a retro feel.'
  },
  {
    id: 'walkie-talkie',
    name: 'Walkie Talkie',
    price: 5999,
    emoji: '📻',
    accent: 'lime',
    description: 'Stay connected on short-range adventures and team activities.'
  },
  {
    id: 'samsung-s25-ultra',
    name: 'Samsung S25 Ultra',
    price: 111999,
    emoji: '◈',
    accent: 'blue',
    description: 'A powerful Android flagship for work, photos, and entertainment.'
  },
  {
    id: 'redmi-note-14-pro-plus',
    name: 'Redmi Note 14 Pro+',
    price: 48999,
    emoji: '⚡',
    accent: 'orange',
    description: 'Strong everyday performance with a bright, spacious display.'
  },
  {
    id: 'vivo-v50',
    name: 'Vivo V50',
    price: 79999,
    emoji: '◉',
    accent: 'rose',
    description: 'A stylish phone with a camera-first experience.'
  }
];

const sessions = new Map();
let database = loadDatabase();

function loadDatabase() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      orders: Array.isArray(parsed.orders) ? parsed.orders : []
    };
  } catch {
    return { users: [], orders: [] };
  }
}

function saveDatabase() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const temporaryFile = `${DB_FILE}.tmp`;
  fs.writeFileSync(temporaryFile, JSON.stringify(database, null, 2));
  fs.renameSync(temporaryFile, DB_FILE);
}

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extraHeaders
  });
  response.end(body);
}

function sendError(response, statusCode, message, fields) {
  sendJson(response, statusCode, {
    error: message,
    ...(fields ? { fields } : {})
  });
}

function setSecurityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; base-uri 'self'; form-action 'self'; object-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'"
  );
}

function parseCookies(request) {
  const header = request.headers.cookie || '';
  return header.split(';').reduce((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator === -1) return cookies;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    cookies[key] = decodeURIComponent(value);
    return cookies;
  }, {});
}

function cookieHeader(name, value, maxAge = 60 * 60 * 24 * 7, request) {
  const forwardedProtocol = request.headers['x-forwarded-proto'];
  const secure = forwardedProtocol === 'https' || request.socket.encrypted;
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function currentSession(request) {
  const sessionId = parseCookies(request).sid;
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(sessionId);
    return null;
  }
  session.expiresAt = Date.now() + 1000 * 60 * 60 * 24 * 7;
  return { id: sessionId, ...session };
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email
  };
}

function createSession(userId) {
  const sessionId = crypto.randomBytes(32).toString('hex');
  sessions.set(sessionId, {
    userId,
    expiresAt: Date.now() + 1000 * 60 * 60 * 24 * 7
  });
  return sessionId;
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, user) {
  const candidate = crypto.scryptSync(password, user.passwordSalt, 64);
  const stored = Buffer.from(user.passwordHash, 'hex');
  return stored.length === candidate.length && crypto.timingSafeEqual(stored, candidate);
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function stringValue(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function validateRegistration(body) {
  const username = stringValue(body.username);
  const email = normalizeEmail(body.email);
  const password = typeof body.password === 'string' ? body.password : '';
  const fields = {};

  if (username.length < 2 || username.length > 50) fields.username = 'Use a name between 2 and 50 characters.';
  if (!isValidEmail(email)) fields.email = 'Enter a valid email address.';
  if (password.length < 8 || password.length > 128) fields.password = 'Use a password between 8 and 128 characters.';

  return { username, email, password, fields };
}

function validateOrder(body, user) {
  const productId = stringValue(body.productId);
  const quantity = Number(body.quantity);
  const customerName = stringValue(body.customerName);
  const email = normalizeEmail(body.email || user.email);
  const phone = stringValue(body.phone).replace(/[\s()-]/g, '');
  const address = stringValue(body.address);
  const fields = {};

  if (!PRODUCTS.some((product) => product.id === productId)) fields.productId = 'Choose a valid product.';
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) fields.quantity = 'Quantity must be a whole number from 1 to 10.';
  if (customerName.length < 2 || customerName.length > 80) fields.customerName = 'Enter your full name.';
  if (!isValidEmail(email)) fields.email = 'Enter a valid email address.';
  if (!/^\+?[0-9]{10,15}$/.test(phone)) fields.phone = 'Enter a valid phone number.';
  if (address.length < 10 || address.length > 300) fields.address = 'Enter a complete shipping address.';

  return { productId, quantity, customerName, email, phone, address, fields };
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let data = '';
    request.on('data', (chunk) => {
      data += chunk;
      if (Buffer.byteLength(data) > MAX_BODY_SIZE) {
        reject(new Error('Request body is too large.'));
        request.destroy();
      }
    });
    request.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });
    request.on('error', reject);
  });
}

function requireUser(request, response) {
  const session = currentSession(request);
  if (!session) {
    sendError(response, 401, 'Please sign in to continue.');
    return null;
  }
  const user = database.users.find((candidate) => candidate.id === session.userId);
  if (!user) {
    sendError(response, 401, 'Your session is no longer valid.');
    return null;
  }
  return user;
}

async function handleApi(request, response, requestUrl) {
  const method = request.method || 'GET';
  const pathname = requestUrl.pathname;
  const session = currentSession(request);

  if (method === 'GET' && pathname === '/api/products') {
    return sendJson(response, 200, { products: PRODUCTS });
  }

  if (method === 'GET' && pathname === '/api/session') {
    const user = session && database.users.find((candidate) => candidate.id === session.userId);
    return sendJson(response, 200, { user: user ? publicUser(user) : null });
  }

  if (method === 'POST' && pathname === '/api/register') {
    let body;
    try {
      body = await readJson(request);
    } catch (error) {
      return sendError(response, 400, error.message);
    }

    const registration = validateRegistration(body);
    if (Object.keys(registration.fields).length) {
      return sendError(response, 422, 'Please correct the highlighted fields.', registration.fields);
    }
    if (database.users.some((user) => user.email === registration.email)) {
      return sendError(response, 409, 'An account with that email already exists.', { email: 'Use another email or sign in.' });
    }

    const { salt, hash } = hashPassword(registration.password);
    const user = {
      id: `usr_${crypto.randomBytes(10).toString('hex')}`,
      username: registration.username,
      email: registration.email,
      passwordSalt: salt,
      passwordHash: hash,
      createdAt: new Date().toISOString()
    };
    database.users.push(user);
    saveDatabase();

    const sessionId = createSession(user.id);
    return sendJson(response, 201, { user: publicUser(user) }, {
      'Set-Cookie': cookieHeader('sid', sessionId, undefined, request)
    });
  }

  if (method === 'POST' && pathname === '/api/login') {
    let body;
    try {
      body = await readJson(request);
    } catch (error) {
      return sendError(response, 400, error.message);
    }

    const email = normalizeEmail(body.email);
    const password = typeof body.password === 'string' ? body.password : '';
    const user = database.users.find((candidate) => candidate.email === email);
    if (!user || !password || !verifyPassword(password, user)) {
      return sendError(response, 401, 'Email or password is incorrect.');
    }

    const sessionId = createSession(user.id);
    return sendJson(response, 200, { user: publicUser(user) }, {
      'Set-Cookie': cookieHeader('sid', sessionId, undefined, request)
    });
  }

  if (method === 'POST' && pathname === '/api/logout') {
    const sessionId = parseCookies(request).sid;
    if (sessionId) sessions.delete(sessionId);
    return sendJson(response, 200, { ok: true }, {
      'Set-Cookie': cookieHeader('sid', '', 0, request)
    });
  }

  if (method === 'POST' && pathname === '/api/orders') {
    const user = requireUser(request, response);
    if (!user) return;

    let body;
    try {
      body = await readJson(request);
    } catch (error) {
      return sendError(response, 400, error.message);
    }

    const orderInput = validateOrder(body, user);
    if (Object.keys(orderInput.fields).length) {
      return sendError(response, 422, 'Please correct the highlighted fields.', orderInput.fields);
    }

    const product = PRODUCTS.find((candidate) => candidate.id === orderInput.productId);
    const order = {
      id: `ORD-${new Date().getFullYear()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
      userId: user.id,
      product: {
        id: product.id,
        name: product.name,
        unitPrice: product.price
      },
      quantity: orderInput.quantity,
      total: product.price * orderInput.quantity,
      customer: {
        name: orderInput.customerName,
        email: orderInput.email,
        phone: orderInput.phone,
        address: orderInput.address
      },
      status: 'confirmed',
      createdAt: new Date().toISOString()
    };
    database.orders.push(order);
    saveDatabase();
    return sendJson(response, 201, { order });
  }

  const orderMatch = pathname.match(/^\/api\/orders\/([^/]+)$/);
  if (method === 'GET' && orderMatch) {
    const user = requireUser(request, response);
    if (!user) return;
    const order = database.orders.find((candidate) => candidate.id === decodeURIComponent(orderMatch[1]) && candidate.userId === user.id);
    if (!order) return sendError(response, 404, 'Order not found.');
    return sendJson(response, 200, { order });
  }

  return sendError(response, 404, 'API route not found.');
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon'
};

function serveStatic(request, response, requestUrl) {
  let pathname = decodeURIComponent(requestUrl.pathname);
  if (pathname === '/') pathname = '/index.html';
  const resolvedPath = path.resolve(ROOT, `.${pathname}`);
  if (!resolvedPath.startsWith(ROOT + path.sep) && resolvedPath !== ROOT) {
    return sendError(response, 403, 'Forbidden.');
  }

  fs.stat(resolvedPath, (statError, stats) => {
    if (!statError && stats.isDirectory()) {
      return serveStatic(request, response, new URL('/index.html', 'http://localhost'));
    }
    fs.readFile(resolvedPath, (error, content) => {
      if (error) return sendError(response, 404, 'Page not found.');
      const extension = path.extname(resolvedPath).toLowerCase();
      setSecurityHeaders(response);
      response.writeHead(200, {
        'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
        'Cache-Control': extension === '.html' ? 'no-cache' : 'public, max-age=3600',
        'X-Content-Type-Options': 'nosniff'
      });
      response.end(content);
    });
  });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
  try {
    if (requestUrl.pathname.startsWith('/api/')) {
      await handleApi(request, response, requestUrl);
    } else if (request.method === 'GET' || request.method === 'HEAD') {
      serveStatic(request, response, requestUrl);
    } else {
      sendError(response, 405, 'Method not allowed.');
    }
  } catch (error) {
    console.error(error);
    if (!response.headersSent) sendError(response, 500, 'Something went wrong on the server.');
    else response.end();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Karina Kapoor Mobiles is running at http://${HOST}:${PORT}`);
});
