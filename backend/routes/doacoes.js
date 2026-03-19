
//  Rotas de Doações

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Doacao = require('../models/Doacao');
const Usuario = require('../models/Usuario');
const { autenticar, autorizarPapeis, verificarPropriedade } = require('../middleware/auth');
const { validate, schemas } = require('../middleware/validate');
const { createLimiter } = require('../middleware/security');
const { AppError } = require('../middleware/errorHandler');
const logger = require('../utils/logger');

// ── GET /api/doacoes 
// Lista doações disponíveis com filtros e paginação
// Rota PÚBLICA (não precisa de autenticação para visualizar)
router.get('/', validate(schemas.buscaDoacao, 'query'), async (req, res, next) => {
  try {
    const { cidade, tipo, lat, lng, raio, pagina, limite } = req.query;

    let query = {
      status: 'disponivel',
      validoAte: { $gt: new Date() },
    };

    let doacoes;

    // Busca geoespacial se coordenadas fornecidas
    if (lat && lng) {
      doacoes = await Doacao.buscarProximas({
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        raioKm: parseFloat(raio) || 10,
        pagina: parseInt(pagina) || 1,
        limite: Math.min(parseInt(limite) || 20, 50),
        filtros: tipo ? { tipo } : {},
      });
    } else {
      // Busca textual por cidade
      if (cidade) query['localizacao.cidade'] = new RegExp(`^${escapeRegex(cidade)}$`, 'i');
      if (tipo)   query.tipo = tipo;

      const skip = ((parseInt(pagina) || 1) - 1) * (parseInt(limite) || 20);

      doacoes = await Doacao.find(query)
        .sort({ validoAte: 1 })
        .skip(skip)
        .limit(Math.min(parseInt(limite) || 20, 50))
        .lean();
    }

    res.json({
      status: 'sucesso',
      resultados: doacoes.length,
      data: doacoes,
    });
  } catch (error) {
    next(error);
  }
});

// ── GET /api/doacoes/:id 
// Busca uma doação específica (PÚBLICA)
router.get('/:id', validate(schemas.id, 'params'), async (req, res, next) => {
  try {
    const doacao = await Doacao.findById(req.params.id)
      .populate('doadorId', 'nome organizacao') // "JOIN" controlado — só nome e organização
      .lean();

    if (!doacao) {
      return next(new AppError('Doação não encontrada.', 404));
    }

    res.json({ status: 'sucesso', data: doacao });
  } catch (error) {
    next(error);
  }
});

// ── POST /api/doacoes 
// Cria uma nova doação (apenas doadores e admins)
router.post(
  '/',
  autenticar,
  autorizarPapeis('doador', 'admin'),
  createLimiter,
  validate(schemas.criarDoacao),
  async (req, res, next) => {
    try {
      const { titulo, descricao, itens, localizacao, validoAte, tipo, observacoes } = req.body;

      // Busca snapshot do doador para desnormalização
      const doador = await Usuario.findById(req.user.id).lean();

      const novaDoacao = await Doacao.create({
        titulo,
        descricao,
        doadorId: req.user.id,
        doadorSnapshot: {
          nome: doador.nome,
          organizacao: doador.organizacao,
          telefone: doador.telefone,
        },
        itens,
        localizacao: {
          type: 'Point',
          coordinates: [localizacao.lng, localizacao.lat],  // GeoJSON: [lng, lat]
          endereco: localizacao.endereco,
          cidade: localizacao.cidade,
          estado: localizacao.estado,
          cep: localizacao.cep,
        },
        validoAte: new Date(validoAte),
        tipo,
        observacoes,
        historicoStatus: [{
          de: null,
          para: 'disponivel',
          motivo: 'Doação criada',
          alteradoPor: req.user.id,
        }],
      });

      // Incrementa contador de doações do usuário
      await Usuario.findByIdAndUpdate(req.user.id, {
        $inc: { totalDoacoes: 1 },
      });

      logger.audit('DOACAO_CRIADA', req.user.id, {
        doacaoId: novaDoacao._id.toString(),
        tipo,
        cidade: localizacao.cidade,
      });

      res.status(201).json({
        status: 'sucesso',
        message: 'Doação criada com sucesso.',
        data: novaDoacao,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ── PATCH /api/doacoes/:id/status ────────────────────────────
// Atualiza status da doação (apenas dono ou admin)
router.patch(
  '/:id/status',
  autenticar,
  validate(schemas.id, 'params'),
  validate(schemas.atualizarStatus),
  async (req, res, next) => {
    try {
      const doacao = await Doacao.findById(req.params.id);

      if (!doacao) {
        return next(new AppError('Doação não encontrada.', 404));
      }

      // Verifica propriedade
      if (
        doacao.doadorId.toString() !== req.user.id &&
        req.user.papel !== 'admin'
      ) {
        logger.security('DOACAO_UNAUTHORIZED_UPDATE', {
          ip: req.ip,
          userId: req.user.id,
          doacaoId: req.params.id,
        });
        return next(new AppError('Você não pode alterar esta doação.', 403));
      }

      const statusAntigo = doacao.status;
      doacao._originalStatus = statusAntigo;
      doacao.status = req.body.status;

      doacao.historicoStatus.push({
        de: statusAntigo,
        para: req.body.status,
        motivo: req.body.motivo || null,
        alteradoPor: req.user.id,
      });

      await doacao.save();

      logger.audit('DOACAO_STATUS_ATUALIZADO', req.user.id, {
        doacaoId: doacao._id.toString(),
        de: statusAntigo,
        para: req.body.status,
      });

      res.json({
        status: 'sucesso',
        message: `Status alterado para "${req.body.status}".`,
        data: doacao,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ── POST /api/doacoes/:id/reservar ───────────────────────────
// Reserva uma doação (apenas receptores)
router.post(
  '/:id/reservar',
  autenticar,
  autorizarPapeis('receptor', 'admin'),
  validate(schemas.id, 'params'),
  async (req, res, next) => {
    // Usa sessão do Mongoose para garantir atomicidade (evitar race condition)
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const doacao = await Doacao.findById(req.params.id).session(session);

      if (!doacao) {
        await session.abortTransaction();
        return next(new AppError('Doação não encontrada.', 404));
      }

      if (doacao.status !== 'disponivel') {
        await session.abortTransaction();
        return next(new AppError(`Esta doação não está disponível (status: ${doacao.status}).`, 400));
      }

      if (doacao.validoAte < new Date()) {
        await session.abortTransaction();
        return next(new AppError('Esta doação expirou.', 400));
      }

      // Não permite que o próprio doador reserve
      if (doacao.doadorId.toString() === req.user.id) {
        await session.abortTransaction();
        return next(new AppError('Você não pode reservar sua própria doação.', 400));
      }

      doacao.status = 'reservado';
      doacao.reserva = {
        receptorId: req.user.id,
        reservadoEm: new Date(),
        mensagem: req.body.mensagem || null,
      };

      doacao.historicoStatus.push({
        de: 'disponivel',
        para: 'reservado',
        alteradoPor: req.user.id,
      });

      await doacao.save({ session });

      await Usuario.findByIdAndUpdate(
        req.user.id,
        { $inc: { totalReservas: 1 } },
        { session }
      );

      await session.commitTransaction();

      logger.audit('DOACAO_RESERVADA', req.user.id, {
        doacaoId: doacao._id.toString(),
      });

      res.json({
        status: 'sucesso',
        message: 'Doação reservada com sucesso! Entre em contato com o doador.',
        data: {
          doacaoId: doacao._id,
          titulo: doacao.titulo,
          doadorSnapshot: doacao.doadorSnapshot,
          localizacao: doacao.localizacao,
          validoAte: doacao.validoAte,
        },
      });
    } catch (error) {
      await session.abortTransaction();
      next(error);
    } finally {
      session.endSession();
    }
  }
);

// ── DELETE /api/doacoes/:id 
// Cancela/remove uma doação (apenas dono ou admin)
router.delete(
  '/:id',
  autenticar,
  validate(schemas.id, 'params'),
  async (req, res, next) => {
    try {
      const doacao = await Doacao.findById(req.params.id);

      if (!doacao) return next(new AppError('Doação não encontrada.', 404));

      if (
        doacao.doadorId.toString() !== req.user.id &&
        req.user.papel !== 'admin'
      ) {
        return next(new AppError('Permissão negada.', 403));
      }

      // Soft delete — muda status para cancelado (preserva histórico)
      doacao.status = 'cancelado';
      doacao.historicoStatus.push({
        de: doacao.status,
        para: 'cancelado',
        motivo: 'Cancelado pelo usuário',
        alteradoPor: req.user.id,
      });
      await doacao.save();

      logger.audit('DOACAO_CANCELADA', req.user.id, {
        doacaoId: doacao._id.toString(),
      });

      res.json({ status: 'sucesso', message: 'Doação cancelada.' });
    } catch (error) {
      next(error);
    }
  }
);

// Escapa caracteres especiais de RegExp para evitar ReDoS
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = router;
