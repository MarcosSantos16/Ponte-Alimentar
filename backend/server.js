//  server.js  —  Ponto de Entrada da API FoodBridge
//  ORDEM DAS CAMADAS DE SEGURANÇA:
//  1. Request ID          → rastreabilidade
//  2. Detecção de padrões → bloqueia ataques óbvios
//  3. Helmet              → headers seguros
//  4. CORS                → apenas origens autorizadas
//  5. Slow Down           → penaliza excesso de requests
//  6. Rate Limiter        → bloqueia após limite
//  7. Body Parser         → limita tamanho do payload
//  8. Mongo Sanitize      → remove operadores NoSQL do body
//  9. XSS Clean           → escapa HTML malicioso
// 10. HPP                 → deduplication de query params
// 11. Rotas               → lógica da aplicação
// 12. Error Handler       → captura todos os erros


require('dotenv').config();

const express = require('express');
const compression = require('compression');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');

const connectMongoDB = require('./config/mongodb');
const { initFirebase } = require('./config/firebase-admin');
const logger = require('./utils/logger');

const {
  helmetConfig,
  corsConfig,
  globalLimiter,
  speedLimiter,
  requestId,
  detectSuspicious,
  mongoSanitize,
  xssClean,
  hppProtection,
} = require('./middleware/security');

const { errorHandler, notFound } = require('./middleware/errorHandler');

// ── Rotas 
const authRoutes    = require('./routes/auth');
const doacoesRoutes = require('./routes/doacoes');

// ── Inicializações 
const app = express();

// ── Confiança em Proxy (Nginx, Heroku, Railway...) 
// Necessário para req.ip retornar o IP real do cliente
app.set('trust proxy', 1);

// Desabilita header que revela tecnologia usada
app.disable('x-powered-by');

// ── Middleware de Log (apenas em desenvolvimento) 
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  // Em produção, loga apenas erros 4xx e 5xx
  app.use(
    morgan('combined', {
      stream: { write: (msg) => logger.info(msg.trim()) },
      skip: (req, res) => res.statusCode < 400,
    })
  );
}


  //CAMADAS DE SEGURANÇA (na ordem correta)
 

// 1. ID único por request
app.use(requestId);

// 2. Detecção de padrões de ataque em URLs e headers
app.use(detectSuspicious);

// 3. Headers de segurança HTTP (Helmet)
app.use(helmetConfig);

// 4. CORS
app.use(corsConfig);

// 5. Compressão de resposta
app.use(compression());

// 6. Rate limiting progressivo
app.use(speedLimiter);

// 7. Rate limiting por IP
app.use('/api/', globalLimiter);

// 8. Body parser com limite de tamanho (anti DoS por payload)
app.use(express.json({
  limit: '10kb',  // Máximo 10KB por request
  strict: true,   // Apenas arrays e objetos JSON válidos
}));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(cookieParser());

// 9. Remove operadores MongoDB ($where, $ne, etc.) do body/query/params
//    Impede NoSQL Injection
app.use(mongoSanitize);

// 10. Limpa input HTML/JavaScript malicioso
//     Impede XSS via dados persistidos
app.use(xssClean);

// 11. Remove parâmetros duplicados da query string
//     Impede HTTP Parameter Pollution
app.use(hppProtection);


//  ROTAS

// Health check — não autentica, apenas verifica se a API está no ar
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV,
  });
});

// Rotas da API
app.use('/api/auth',    authRoutes);
app.use('/api/doacoes', doacoesRoutes);

// ── Rotas não encontradas 
app.use(notFound);

// ── Handler de erros centralizado (DEVE SER O ÚLTIMO) 
app.use(errorHandler);

//  INICIALIZAÇÃO

const iniciar = async () => {
  try {
    // 1. Conecta ao MongoDB
    await connectMongoDB();

    // 2. Inicializa Firebase Admin
    initFirebase();

    // 3. Sobe o servidor
    const PORT = process.env.PORT || 5000;
    const server = app.listen(PORT, () => {
      logger.info(`✅ Servidor FoodBridge rodando na porta ${PORT} [${process.env.NODE_ENV}]`);
    });

    // ── Graceful Shutdown 
    // Permite que requisições em andamento terminem antes de encerrar
    const gracefulShutdown = (signal) => {
      logger.info(`${signal} recebido — encerrando servidor...`);
      server.close(async () => {
        logger.info('Servidor HTTP encerrado.');
        const mongoose = require('mongoose');
        await mongoose.connection.close();
        logger.info('Conexão MongoDB encerrada.');
        process.exit(0);
      });

      // Força encerramento após 10s se não terminar
      setTimeout(() => {
        logger.error('Encerramento forçado após timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

    // Captura erros não tratados
    process.on('unhandledRejection', (err) => {
      logger.error('UNHANDLED REJECTION — encerrando:', { error: err.message, stack: err.stack });
      server.close(() => process.exit(1));
    });

    process.on('uncaughtException', (err) => {
      logger.error('UNCAUGHT EXCEPTION — encerrando:', { error: err.message, stack: err.stack });
      process.exit(1);
    });

  } catch (error) {
    logger.error('Falha na inicialização:', { error: error.message });
    process.exit(1);
  }
};

// Em produção (Vercel) exporta o app; localmente inicia o servidor
if (process.env.NODE_ENV !== 'production') {
  iniciar();
} else {
  connectMongoDB();
  initFirebase();
}

module.exports = app; 
