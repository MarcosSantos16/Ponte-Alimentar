//  middleware/security.js  —  Camada de Segurança Principal
//
//  PROTEÇÕES IMPLEMENTADAS:
//  1. Helmet         → Headers HTTP seguros (XSS, Clickjacking, MIME)
//  2. CORS           → Apenas origens autorizadas
//  3. Rate Limiting  → Bloqueia força bruta / DDoS
//  4. Slow Down      → Penaliza requisições excessivas
//  5. HPP            → HTTP Parameter Pollution
//  6. Mongo Sanitize → Injção NoSQL
//  7. XSS Clean      → Cross-Site Scripting
//  8. Body Limit     → Payloads gigantes (DoS)
//  9. Request ID     → Rastreabilidade


const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// ── 1. HELMET — Headers de Segurança HTTP 
// Configura mais de 14 headers diferentes automaticamente
const helmetConfig = helmet({
  // Content Security Policy — define de onde recursos podem ser carregados
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        'https://www.gstatic.com',         // Firebase SDK
        'https://apis.google.com',          // Google APIs
        'https://unpkg.com',                // CDN para Leaflet
        'https://cdn.jsdelivr.net',
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",                  // Leaflet precisa de inline styles
        'https://unpkg.com',
        'https://fonts.googleapis.com',
      ],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      connectSrc: [
        "'self'",
        `https://*.firebaseio.com`,         // Firebase Realtime DB
        `https://firestore.googleapis.com`,
        `https://identitytoolkit.googleapis.com`,
        'https://api.mapbox.com',
      ],
      frameSrc: ["'none'"],                 // Bloqueia iframes — anti-clickjacking
      objectSrc: ["'none'"],
      upgradeInsecureRequests: [],
    },
  },

  // HSTS — força HTTPS por 1 ano
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },

  // Esconde que o servidor usa Express/Node
  hidePoweredBy: true,

  // Impede MIME sniffing
  noSniff: true,

  // Impede que a página seja carregada em iframe (Clickjacking)
  frameguard: { action: 'deny' },

  // Activa filtro XSS do browser
  xssFilter: true,
});

// ── 2. CORS — Controle de Origem 
const allowedOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
  : ['http://localhost:3000'];

const corsConfig = cors({
  origin: (origin, callback) => {
    // Permite requisições sem origin (ex: Postman em dev) apenas em desenvolvimento
    if (!origin && process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      logger.security('CORS_BLOCKED', { origin, allowedOrigins });
      callback(new Error(`Origem não autorizada: ${origin}`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  exposedHeaders: ['X-Request-ID', 'X-RateLimit-Remaining'],
  credentials: true,           // Permite cookies cross-origin
  maxAge: 86400,               // Cache do preflight por 24h
});

// ── 3. RATE LIMITER — Anti Força Bruta / DDoS 
// Limita requisições por IP em uma janela de tempo

// Rate limit global (todas as rotas)
const globalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 min
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,   // Retorna headers RateLimit-*
  legacyHeaders: false,
  message: {
    status: 429,
    error: 'Muitas requisições. Aguarde antes de tentar novamente.',
  },
  handler: (req, res, next, options) => {
    logger.security('RATE_LIMIT_EXCEEDED', {
      ip: req.ip,
      path: req.path,
      method: req.method,
    });
    res.status(429).json(options.message);
  },
  // Identifica o cliente pelo IP real (mesmo atrás de proxy/nginx)
  keyGenerator: (req) => {
    return req.headers['x-forwarded-for']?.split(',')[0] || req.ip;
  },
  skip: (req) => {
    // Nunca pula — aplica em todos
    return false;
  },
});

// Rate limit restrito para rotas de autenticação (anti brute-force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,   // 15 minutos
  max: 10,                      // Apenas 10 tentativas de login por janela
  message: {
    status: 429,
    error: 'Muitas tentativas de login. Tente novamente em 15 minutos.',
  },
  handler: (req, res, next, options) => {
    logger.security('AUTH_RATE_LIMIT', {
      ip: req.ip,
      email: req.body?.email || 'desconhecido',
      path: req.path,
    });
    res.status(429).json(options.message);
  },
});

// Rate limit para criação de doações (anti spam)
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,   // 1 hora
  max: 20,                      // 20 doações criadas por hora
  message: {
    status: 429,
    error: 'Limite de criação atingido. Tente novamente mais tarde.',
  },
});

// ── 4. SLOW DOWN — Penalização Progressiva 
// Em vez de bloquear, desacelera requisições suspeitas
const speedLimiter = slowDown({
  windowMs: 15 * 60 * 1000,
  delayAfter: 50,           // Começa a atrasar após 50 requisições
  delayMs: () => 500,       // Adiciona 500ms de delay por requisição extra
  maxDelayMs: 5000,         // Máximo de 5 segundos de delay
});

// ── 5. REQUEST ID — Rastreabilidade 
// Cada request recebe um ID único para rastrear logs
const requestId = (req, res, next) => {
  const id = req.headers['x-request-id'] || uuidv4();
  req.id = id;
  res.setHeader('X-Request-ID', id);
  next();
};

// ── 6. DETECT SUSPICIOUS PATTERNS 
// Bloqueia padrões de ataque conhecidos nas URLs e headers
const detectSuspicious = (req, res, next) => {
  const suspiciousPatterns = [
    /(\.\.\/)|(\.\.\\)/,                    // Path traversal
    /<script[\s\S]*?>/i,                    // XSS em URL
    /(union|select|insert|update|delete|drop|create|alter)\s/i, // SQL Injection
    /\$where|\$ne|\$gt|\$lt|\$regex/i,      // NoSQL Injection
    /etc\/passwd|etc\/shadow/i,             // LFI
    /cmd=|exec\(|system\(|passthru\(/i,    // RCE
  ];

  const checkStr = `${req.url} ${JSON.stringify(req.headers)} ${JSON.stringify(req.query)}`;

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(checkStr)) {
      logger.security('SUSPICIOUS_REQUEST_BLOCKED', {
        ip: req.ip,
        url: req.url,
        method: req.method,
        pattern: pattern.toString(),
        userAgent: req.headers['user-agent'],
      });

      return res.status(400).json({
        status: 'erro',
        message: 'Requisição inválida.',
      });
    }
  }

  next();
};

// ── EXPORTAÇÕES 
module.exports = {
  helmetConfig,
  corsConfig,
  globalLimiter,
  authLimiter,
  createLimiter,
  speedLimiter,
  requestId,
  detectSuspicious,
  mongoSanitize: mongoSanitize({ replaceWith: '_' }),  // Remove $ e . dos campos
  xssClean: xss(),
  hppProtection: hpp({
    whitelist: ['status', 'tipo'],  // Permite múltiplos valores para esses campos
  }),
};
