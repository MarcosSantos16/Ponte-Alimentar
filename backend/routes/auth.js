// 
// Rotas de Autenticação

const express = require('express');
const router = express.Router();
const Usuario = require('../models/Usuario');
const { verificarToken, autenticar } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const { authLimiter } = require('../middleware/security');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// ── POST /api/auth/registrar 
// Cria o usuário no MongoDB após ser criado no Firebase
// Usa verificarToken (não exige usuário no MongoDB ainda)
router.post(
  '/registrar',
  authLimiter,
  verificarToken,        // ← só verifica o token Firebase
  validate(schemas.registro),
  async (req, res, next) => {
    try {
      const { nome, email, firebaseUid, papel, telefone, organizacao } = req.body;

      // Segurança: firebaseUid do body deve bater com o do token
      if (firebaseUid !== req.user.firebaseUid) {
        logger.security('AUTH_UID_MISMATCH', { ip: req.ip, tokenUid: req.user.firebaseUid, bodyUid: firebaseUid });
        return next(new AppError('Operação não autorizada.', 403));
      }

      // Verifica se já existe
      const existente = await Usuario.findOne({
        $or: [{ firebaseUid }, { email: email.toLowerCase() }],
      });

      if (existente) {
        // Se já existe, apenas retorna os dados (idempotente)
        return res.status(200).json({
          status: 'sucesso',
          message: 'Usuário já cadastrado.',
          data: {
            id:    existente._id,
            nome:  existente.nome,
            email: existente.email,
            papel: existente.papel,
          },
        });
      }

      const novoUsuario = await Usuario.create({
        firebaseUid,
        nome,
        email,
        papel,
        telefone:     telefone || null,
        organizacao:  organizacao || null,
      });

      logger.audit('USER_REGISTERED', novoUsuario._id.toString(), { email, papel, ip: req.ip });

      res.status(201).json({
        status: 'sucesso',
        message: 'Usuário cadastrado com sucesso.',
        data: {
          id:    novoUsuario._id,
          nome:  novoUsuario.nome,
          email: novoUsuario.email,
          papel: novoUsuario.papel,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// ── POST /api/auth/sincronizar 
// Sincroniza último acesso após login
// Usa verificarToken pois o usuário pode não estar no MongoDB ainda (login Google)
router.post('/sincronizar', verificarToken, async (req, res, next) => {
  try {
    const usuario = await Usuario.findOne({ firebaseUid: req.user.firebaseUid });

    if (!usuario) {
      return res.status(403).json({
        status: 'erro',
        message: 'Usuário não encontrado. Complete o cadastro.',
      });
    }

    usuario.ultimoAcesso = new Date();
    await usuario.save({ validateBeforeSave: false });

    res.json({
      status: 'sucesso',
      data: {
        id:            usuario._id,
        nome:          usuario.nome,
        email:         usuario.email,
        papel:         usuario.papel,
        totalDoacoes:  usuario.totalDoacoes,
        totalReservas: usuario.totalReservas,
        createdAt:     usuario.createdAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/auth/perfil 
router.get('/perfil', autenticar, async (req, res, next) => {
  try {
    const usuario = await Usuario.findById(req.user.id);
    if (!usuario) return next(new AppError('Usuário não encontrado.', 404));
    res.json({ status: 'sucesso', data: usuario });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
