
//  middleware/validate.js  —  Validação e Sanitização de Input
//
//  Usa Joi para definir schemas rígidos.
//  Qualquer dado fora do schema é REJEITADO antes de chegar
//  nas rotas, models ou banco de dados.

const Joi = require('joi');
const logger = require('../utils/logger');

// ── Função Helper ────────────────────────────────────────────
// Recebe um schema Joi e retorna um middleware de validação
const validate = (schema, source = 'body') => {
  return (req, res, next) => {
    const data = source === 'body' ? req.body
                : source === 'query' ? req.query
                : source === 'params' ? req.params
                : req.body;

    const { error, value } = schema.validate(data, {
      abortEarly: false,        // Retorna TODOS os erros, não apenas o primeiro
      stripUnknown: true,       // Remove campos não declarados no schema (segurança!)
      convert: true,            // Converte tipos quando possível (ex: string → número)
    });

    if (error) {
      const erros = error.details.map((d) => ({
        campo: d.path.join('.'),
        mensagem: d.message.replace(/['"]/g, ''),
      }));

      logger.warn('VALIDATION_ERROR', {
        ip: req.ip,
        path: req.path,
        erros,
      });

      return res.status(400).json({
        status: 'erro',
        message: 'Dados inválidos.',
        erros,
      });
    }

    // Substitui req[source] pelos dados já validados e sanitizados
    if (source === 'body') req.body = value;
    else if (source === 'query') req.query = value;
    else if (source === 'params') req.params = value;

    next();
  };
};

// ── Schemas de Validação 

// Regex seguros
const REGEX = {
  NOME: /^[\p{L}\s'-]{2,100}$/u,   // Letras unicode, espaços, hífens, apóstrofos
  TELEFONE: /^\+?[\d\s\-().]{8,20}$/,
  CEP: /^\d{5}-?\d{3}$/,
  LATITUDE: /^-?([1-8]?\d(\.\d+)?|90(\.0+)?)$/,
  LONGITUDE: /^-?(180(\.0+)?|((1[0-7]\d)|([1-9]?\d))(\.\d+)?)$/,
};

// Cadastro de usuário
const schemaRegistro = Joi.object({
  nome: Joi.string().min(2).max(100).required(),
  email: Joi.string().email({ tlds: { allow: false } }).max(254).required(),
  firebaseUid: Joi.string().min(10).max(128).required(),
  papel: Joi.string().valid('doador', 'receptor', 'voluntario').required(),
  telefone: Joi.string().optional().allow('', null),
  organizacao: Joi.string().max(150).optional().allow('', null),
  idToken: Joi.string().optional().allow(''),  // enviado pelo front, ignorado no back
});

// Login (apenas para registrar tentativa — a autenticação real é no Firebase)
const schemaLogin = Joi.object({
  email: Joi.string().email({ tlds: { allow: false } }).max(254).required(),
  // Nunca validamos a senha aqui — isso é feito pelo Firebase no front-end
  idToken: Joi.string().max(4096).required(),
});

// Criação de doação
const schemaCriarDoacao = Joi.object({
  titulo: Joi.string().min(5).max(100).required(),
  descricao: Joi.string().min(10).max(1000).required(),
  itens: Joi.array().items(
    Joi.object({
      nome: Joi.string().max(100).required(),
      quantidade: Joi.string().max(50).required(),
      unidade: Joi.string().valid('kg', 'g', 'L', 'ml', 'unidade', 'porção', 'caixa').required(),
    })
  ).min(1).max(20).required(),
  localizacao: Joi.object({
    endereco: Joi.string().max(200).required(),
    cidade: Joi.string().max(100).required(),
    estado: Joi.string().length(2).uppercase().required(),
    cep: Joi.string().pattern(REGEX.CEP).required(),
    lat: Joi.number().min(-90).max(90).required(),
    lng: Joi.number().min(-180).max(180).required(),
  }).required(),
  validoAte: Joi.date().iso().min('now').max(
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)  // Máximo 7 dias
  ).required(),
  tipo: Joi.string().valid('refeicao_pronta', 'alimento_nao_perecivel', 'fruta_legume', 'padaria', 'outro').required(),
  observacoes: Joi.string().max(500).optional().allow(''),
});

// Atualização de status da doação
const schemaAtualizarStatus = Joi.object({
  status: Joi.string().valid('disponivel', 'reservado', 'coletado', 'expirado', 'cancelado').required(),
  motivo: Joi.string().max(300).optional(),
});

// Reserva de doação
const schemaReserva = Joi.object({
  doacaoId: Joi.string().alphanum().length(24).required(),
  mensagem: Joi.string().max(300).optional().allow(''),
});

// ID em params
const schemaId = Joi.object({
  id: Joi.string().alphanum().length(24).required()
    .messages({ 'string.length': 'ID inválido.' }),
});

// Query de busca de doações
const schemaBuscaDoacao = Joi.object({
  cidade: Joi.string().max(100).optional(),
  tipo: Joi.string().valid('refeicao_pronta', 'alimento_nao_perecivel', 'fruta_legume', 'padaria', 'outro').optional(),
  lat: Joi.number().min(-90).max(90).optional(),
  lng: Joi.number().min(-180).max(180).optional(),
  raio: Joi.number().min(1).max(100).default(10).optional(),  // km
  pagina: Joi.number().integer().min(1).default(1).optional(),
  limite: Joi.number().integer().min(1).max(100).default(20).optional(),
});

module.exports = {
  validate,
  schemas: {
    registro: schemaRegistro,
    login: schemaLogin,
    criarDoacao: schemaCriarDoacao,
    atualizarStatus: schemaAtualizarStatus,
    reserva: schemaReserva,
    id: schemaId,
    buscaDoacao: schemaBuscaDoacao,
  },
};
