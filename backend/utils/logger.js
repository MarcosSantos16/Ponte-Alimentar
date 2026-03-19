// ============================================================
//  utils/logger.js  —  Logger centralizado com Winston
//  Registra TUDO: erros, acessos, eventos de segurança
// ============================================================

const { createLogger, format, transports } = require('winston');
const path = require('path');

const { combine, timestamp, printf, colorize, errors } = format;

// Formato legível para desenvolvimento
const devFormat = combine(
  colorize(),
  timestamp({ format: 'DD/MM/YYYY HH:mm:ss' }),
  errors({ stack: true }),
  printf(({ level, message, timestamp, stack, ...meta }) => {
    let log = `[${timestamp}] ${level}: ${message}`;
    if (Object.keys(meta).length) log += ` | ${JSON.stringify(meta)}`;
    if (stack) log += `\n${stack}`;
    return log;
  })
);

// Formato JSON para produção (para ingestão em ferramentas como Datadog, Sentry)
const prodFormat = combine(
  timestamp(),
  errors({ stack: true }),
  format.json()
);

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: process.env.NODE_ENV === 'production' ? prodFormat : devFormat,
  transports: [
    // Console sempre ativo
    new transports.Console(),

    // Arquivo de erros — apenas nível error
    new transports.File({
      filename: path.join(__dirname, '../logs/error.log'),
      level: 'error',
      maxsize: 5 * 1024 * 1024, // 5MB
      maxFiles: 10,
      tailable: true,
    }),

    // Arquivo combinado — todos os níveis
    new transports.File({
      filename: path.join(__dirname, '../logs/combined.log'),
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 20,
      tailable: true,
    }),

    // Arquivo dedicado para eventos de segurança
    new transports.File({
      filename: path.join(__dirname, '../logs/security.log'),
      level: 'warn',
      maxsize: 5 * 1024 * 1024,
      maxFiles: 30,
      tailable: true,
    }),
  ],
  // Não deixa erros não capturados derrubar o processo
  exceptionHandlers: [
    new transports.File({ filename: path.join(__dirname, '../logs/exceptions.log') }),
  ],
  rejectionHandlers: [
    new transports.File({ filename: path.join(__dirname, '../logs/rejections.log') }),
  ],
});

// ── Helper para eventos de segurança ────────────────────────
logger.security = (event, data) => {
  logger.warn(`[SECURITY] ${event}`, {
    event,
    timestamp: new Date().toISOString(),
    ...data,
  });
};

// ── Helper para audit trail (ações de usuários) ──────────────
logger.audit = (action, userId, data) => {
  logger.info(`[AUDIT] ${action}`, {
    action,
    userId,
    timestamp: new Date().toISOString(),
    ...data,
  });
};

module.exports = logger;
