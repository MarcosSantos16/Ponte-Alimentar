//  middleware/auth.js  —  Autenticação e Autorização

const { admin } = require('../config/firebase-admin');
const Usuario = require('../models/Usuario');
const logger = require('../utils/logger');

const traduzirErro = (code) => {
  const map = {
    'auth/id-token-expired':  'Token expirado. Faça login novamente.',
    'auth/id-token-revoked':  'Token revogado. Faça login novamente.',
    'auth/invalid-id-token':  'Token inválido.',
    'auth/argument-error':    'Token malformado.',
  };
  return map[code] || 'Falha na autenticação.';
};

// ── Verifica token Firebase SEM buscar no MongoDB 
// Use em rotas onde o usuário ainda não existe no banco (ex: /registrar)
const verificarToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ status: 'erro', message: 'Token não fornecido.' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken, true);
    } catch (err) {
      return res.status(401).json({ status: 'erro', message: traduzirErro(err.code) });
    }

    req.user = {
      firebaseUid:     decoded.uid,
      email:           decoded.email,
      emailVerificado: decoded.email_verified,
    };

    next();
  } catch (error) {
    logger.error('Erro em verificarToken:', { error: error.message });
    return res.status(500).json({ status: 'erro', message: 'Erro interno.' });
  }
};

// ── Verifica token + busca usuário no MongoDB 
// Use em rotas que exigem usuário já cadastrado
const autenticar = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      logger.security('AUTH_MISSING_TOKEN', { ip: req.ip, path: req.path });
      return res.status(401).json({ status: 'erro', message: 'Token não fornecido.' });
    }

    const idToken = authHeader.split('Bearer ')[1];
    let decoded;
    try {
      decoded = await admin.auth().verifyIdToken(idToken, true);
    } catch (err) {
      logger.security('AUTH_TOKEN_INVALID', { ip: req.ip, code: err.code });
      return res.status(401).json({ status: 'erro', message: traduzirErro(err.code) });
    }

    const usuario = await Usuario.findOne({ firebaseUid: decoded.uid, ativo: true }).lean();

    if (!usuario) {
      return res.status(403).json({
        status: 'erro',
        message: 'Usuário não encontrado. Complete o cadastro.',
      });
    }

    req.user = {
      id:              usuario._id.toString(),
      firebaseUid:     decoded.uid,
      email:           decoded.email,
      nome:            usuario.nome,
      papel:           usuario.papel,
      emailVerificado: decoded.email_verified,
    };

    logger.audit('REQUEST_AUTHENTICATED', req.user.id, { path: req.path, ip: req.ip });
    next();
  } catch (error) {
    logger.error('Erro em autenticar:', { error: error.message });
    return res.status(500).json({ status: 'erro', message: 'Erro interno.' });
  }
};

const exigirEmailVerificado = (req, res, next) => {
  if (!req.user?.emailVerificado) {
    return res.status(403).json({ status: 'erro', message: 'Verifique seu e-mail antes de continuar.' });
  }
  next();
};

const autorizarPapeis = (...papeis) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ status: 'erro', message: 'Não autenticado.' });
  if (!papeis.includes(req.user.papel)) {
    logger.security('AUTH_UNAUTHORIZED_ROLE', { ip: req.ip, userId: req.user.id });
    return res.status(403).json({ status: 'erro', message: 'Permissão negada.' });
  }
  next();
};

const verificarPropriedade = (campoId = 'doadorId') => (req, res, next) => {
  if (req.user.papel === 'admin') return next();
  const recursoId = req.body[campoId] || req.params.userId;
  if (recursoId && recursoId.toString() !== req.user.id) {
    logger.security('AUTH_OWNERSHIP_VIOLATION', { ip: req.ip, userId: req.user.id });
    return res.status(403).json({ status: 'erro', message: 'Você não tem permissão para modificar este recurso.' });
  }
  next();
};

module.exports = { verificarToken, autenticar, exigirEmailVerificado, autorizarPapeis, verificarPropriedade };
