
//  middleware/errorHandler.js  —  Tratamento Centralizado de Erros
//
//  IMPORTANTE: Nunca vaza detalhes internos para o cliente.
//  Stack traces e mensagens técnicas ficam apenas no log.
// 

const logger = require('../utils/logger');

// ── Erros Operacionais (esperados) 
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = statusCode >= 400 && statusCode < 500 ? 'erro' : 'falha';
    this.isOperational = true;  // Distingue de erros de programação
    Error.captureStackTrace(this, this.constructor);
  }
}

// ── Handlers para Erros Específicos 
const handleMongooseCastError = (err) => {
  const message = `ID inválido: ${err.value}`;
  return new AppError(message, 400);
};

const handleMongooseDuplicateKey = (err) => {
  const campo = Object.keys(err.keyValue)[0];
  const message = `${campo} já está em uso. Escolha outro valor.`;
  return new AppError(message, 409);
};

const handleMongooseValidation = (err) => {
  const errors = Object.values(err.errors).map((e) => e.message);
  const message = `Dados inválidos: ${errors.join('. ')}`;
  return new AppError(message, 400);
};

const handleJWTError = () =>
  new AppError('Token inválido. Faça login novamente.', 401);

const handleJWTExpired = () =>
  new AppError('Token expirado. Faça login novamente.', 401);

// ── Resposta em Desenvolvimento (mais detalhes) 
const sendDevError = (err, res) => {
  res.status(err.statusCode || 500).json({
    status: err.status || 'falha',
    message: err.message,
    stack: err.stack,
    error: err,
  });
};

// ── Resposta em Produção (mensagem genérica) 
const sendProdError = (err, res) => {
  if (err.isOperational) {
    // Erro esperado: pode mostrar a mensagem
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  } else {
    // Erro de programação: não vaza detalhes
    logger.error('ERRO NÃO OPERACIONAL:', { error: err.message, stack: err.stack });
    res.status(500).json({
      status: 'falha',
      message: 'Algo deu errado. Tente novamente mais tarde.',
    });
  }
};

// ── Middleware Principal 
const errorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'falha';

  // Sempre loga o erro com contexto da requisição
  logger.error(`${err.statusCode} - ${err.message}`, {
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.user?.id || 'anônimo',
    requestId: req.id,
    stack: err.stack,
  });

  if (process.env.NODE_ENV === 'development') {
    sendDevError(err, res);
  } else {
    let error = { ...err, message: err.message };

    // Transforma erros do Mongoose em AppErrors legíveis
    if (err.name === 'CastError') error = handleMongooseCastError(err);
    if (err.code === 11000) error = handleMongooseDuplicateKey(err);
    if (err.name === 'ValidationError') error = handleMongooseValidation(err);
    if (err.name === 'JsonWebTokenError') error = handleJWTError();
    if (err.name === 'TokenExpiredError') error = handleJWTExpired();

    sendProdError(error, res);
  }
};

// Handler para rotas não encontradas
const notFound = (req, res, next) => {
  logger.warn('ROUTE_NOT_FOUND', {
    ip: req.ip,
    path: req.path,
    method: req.method,
  });

  next(new AppError(`Rota não encontrada: ${req.method} ${req.originalUrl}`, 404));
};

module.exports = { errorHandler, notFound, AppError };
