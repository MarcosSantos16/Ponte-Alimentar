// 
//  models/Doacao.js  —  Schema MongoDB para Doações
//
//  CONCEITO NOSQL — EMBEDDING vs REFERENCING:
//
//  Embedding (dados juntos no mesmo documento):
//  ✅ Usado para: itens, localização
//  → Dados sempre consultados com a doação → ficam DENTRO do doc
//
//  Referencing (como chave estrangeira no SQL):
//  ✅ Usado para: doadorId
//  → Usuário tem ciclo de vida independente → fica como referência

const mongoose = require('mongoose');

// ── Sub-schemas 
// Schemas reutilizáveis para partes do documento

const itemSchema = new mongoose.Schema(
  {
    nome: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    quantidade: {
      type: String,
      required: true,
      maxlength: 50,
    },
    unidade: {
      type: String,
      enum: ['kg', 'g', 'L', 'ml', 'unidade', 'porção', 'caixa'],
      required: true,
    },
  },
  { _id: false }  // Não gera _id para cada item
);

const localizacaoSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point',
    },
    coordinates: {
      type: [Number],   // [lng, lat] — padrão GeoJSON (lng vem primeiro!)
      required: true,
    },
    endereco: { type: String, required: true, maxlength: 200 },
    cidade:   { type: String, required: true, maxlength: 100 },
    estado:   { type: String, required: true, length: 2, uppercase: true },
    cep:      { type: String, required: true },
  },
  { _id: false }
);

// ── Schema Principal 
const doacaoSchema = new mongoose.Schema(
  {
    titulo: {
      type: String,
      required: [true, 'Título é obrigatório'],
      trim: true,
      minlength: 5,
      maxlength: 100,
    },

    descricao: {
      type: String,
      required: [true, 'Descrição é obrigatória'],
      trim: true,
      minlength: 10,
      maxlength: 1000,
    },

    // REFERÊNCIA — como FK do SQL
    // populate('doadorId') faz o "JOIN" quando necessário
    doadorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Usuario',
      required: true,
      index: true,
    },

    // EMBEDDING — dados do doador desnormalizados para exibição rápida
    // Evita populate em listagens (melhor performance)
    doadorSnapshot: {
      nome: String,
      organizacao: String,
      telefone: String,
    },

    // Array de sub-documentos (EMBEDDING)
    itens: {
      type: [itemSchema],
      required: true,
      validate: {
        validator: (v) => v.length >= 1 && v.length <= 20,
        message: 'Deve ter entre 1 e 20 itens',
      },
    },

    // Objeto de localização com índice geoespacial
    localizacao: {
      type: localizacaoSchema,
      required: true,
    },

    tipo: {
      type: String,
      enum: ['refeicao_pronta', 'alimento_nao_perecivel', 'fruta_legume', 'padaria', 'outro'],
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ['disponivel', 'reservado', 'coletado', 'expirado', 'cancelado'],
      default: 'disponivel',
      index: true,
    },

    // Data limite para retirada
    validoAte: {
      type: Date,
      required: true,
      index: true,
    },

    // Reserva — quem reservou esta doação
    reserva: {
      receptorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario',
        default: null,
      },
      reservadoEm: { type: Date, default: null },
      mensagem:    { type: String, maxlength: 300, default: null },
    },

    // Coleta — voluntário responsável
    coleta: {
      voluntarioId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Usuario',
        default: null,
      },
      coletadoEm: { type: Date, default: null },
    },

    observacoes: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    // Histórico de mudanças de status para auditoria
    historicoStatus: [
      {
        de:         { type: String },
        para:       { type: String },
        motivo:     { type: String, maxlength: 300 },
        alteradoPor: { type: mongoose.Schema.Types.ObjectId, ref: 'Usuario' },
        em:         { type: Date, default: Date.now },
        _id: false,
      },
    ],
  },
  {
    timestamps: true,
    versionKey: false,

    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        return ret;
      },
    },
  }
);

// ── Índices 
// Índice geoespacial 2dsphere — permite queries de "doações próximas"
doacaoSchema.index({ 'localizacao': '2dsphere' });

// Índice composto para a query mais comum: listar doações disponíveis
doacaoSchema.index({ status: 1, validoAte: 1 });

// Índice para busca por cidade + tipo
doacaoSchema.index({ 'localizacao.cidade': 1, tipo: 1 });

// Índice para listagem das doações de um doador
doacaoSchema.index({ doadorId: 1, createdAt: -1 });

// ── Métodos Estáticos 

// Busca doações disponíveis próximas a uma localização (raio em km)
doacaoSchema.statics.buscarProximas = function ({ lat, lng, raioKm = 10, pagina = 1, limite = 20, filtros = {} }) {
  const skip = (pagina - 1) * limite;

  return this.find({
    status: 'disponivel',
    validoAte: { $gt: new Date() },
    localizacao: {
      $near: {
        $geometry: { type: 'Point', coordinates: [lng, lat] },
        $maxDistance: raioKm * 1000,  // Converte km → metros
      },
    },
    ...filtros,
  })
    .limit(limite)
    .skip(skip)
    .sort({ validoAte: 1 })
    .lean();
};

// ── Hooks 

// Expira doações automaticamente ao buscar
// (solução simples; em produção, use um cron job ou TTL index)
doacaoSchema.pre(/^find/, function (next) {
  // Não filtra por status se já há um filtro específico
  if (!this.getFilter().status) {
    this.find({ validoAte: { $gt: new Date() } });
  }
  next();
});

// Registra histórico de mudança de status
doacaoSchema.pre('save', function (next) {
  if (this.isModified('status') && !this.isNew) {
    this.historicoStatus.push({
      de: this._originalStatus || 'desconhecido',
      para: this.status,
    });
  }
  next();
});

const Doacao = mongoose.model('Doacao', doacaoSchema);

module.exports = Doacao;
