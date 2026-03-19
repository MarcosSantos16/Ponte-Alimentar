//  models/Usuario.js  —  Schema do MongoDB para Usuários
//
//  CONCEITO NOSQL:
//  Ao contrário do SQL, não há uma tabela rígida.
//  O Schema do Mongoose é uma "camada de validação" em cima
//  do MongoDB, garantindo consistência mesmo sem tabelas fixas.

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// ── Schema 
// Pense no Schema como o "formato" que cada documento vai ter
// na collection "usuarios" do MongoDB
const usuarioSchema = new mongoose.Schema(
  {
    // ID do Firebase Auth — vincula o MongoDB ao Firebase
    firebaseUid: {
      type: String,
      required: [true, 'Firebase UID é obrigatório'],
      unique: true,
      immutable: true,  // Não pode ser alterado após criação
      index: true,
    },

    nome: {
      type: String,
      required: [true, 'Nome é obrigatório'],
      trim: true,
      minlength: [2, 'Nome deve ter pelo menos 2 caracteres'],
      maxlength: [100, 'Nome deve ter no máximo 100 caracteres'],
    },

    email: {
      type: String,
      required: [true, 'Email é obrigatório'],
      unique: true,
      lowercase: true,  // Sempre salva em minúsculas
      trim: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email inválido'],
    },

    papel: {
      type: String,
      enum: {
        values: ['doador', 'receptor', 'voluntario', 'admin'],
        message: 'Papel inválido: {VALUE}',
      },
      required: [true, 'Papel é obrigatório'],
    },

    telefone: {
      type: String,
      trim: true,
      default: null,
    },

    organizacao: {
      type: String,
      trim: true,
      maxlength: 150,
      default: null,
    },

    // Localização — opcional, só salva se o usuário informar
    // Localização — adicionada apenas quando o usuário informar no perfil
localizacao: {
  type: { type: String },
  coordinates: { type: [Number], default: undefined },
},

    // Controle de acesso
    ativo: {
      type: Boolean,
      default: true,
    },

    // Timestamps de atividade
    ultimoAcesso: {
      type: Date,
      default: null,
    },

    // Estatísticas
    totalDoacoes: { type: Number, default: 0, min: 0 },
    totalReservas: { type: Number, default: 0, min: 0 },

    // Segurança: rastreia IPs de acesso para detectar anomalias
    ipsConhecidos: {
      type: [String],
      default: [],
      select: false,  // Não retorna por padrão nas queries (privacidade)
    },
  },
  {
    // ── Opções do Schema 
    timestamps: true,      // Adiciona automaticamente createdAt e updatedAt
    versionKey: false,     // Remove o campo __v (controle de versão do Mongoose)

    // Transforma o documento ao converter para JSON
    toJSON: {
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.ipsConhecidos;  // Nunca retorna IPs no JSON
        return ret;
      },
    },
  }
);

// ── Índices 
// Índices aceleram queries frequentes (equivalente a INDEX no SQL)
usuarioSchema.index({ email: 1 });
usuarioSchema.index({ firebaseUid: 1 });
usuarioSchema.index({ papel: 1 });
// índice geoespacial removido — localização é opcional

// ── Métodos de Instância 
// Métodos disponíveis em cada documento usuário

// Registra IP de acesso (para auditoria de segurança)
usuarioSchema.methods.registrarIP = async function (ip) {
  if (!this.ipsConhecidos.includes(ip)) {
    // Mantém apenas os últimos 10 IPs
    if (this.ipsConhecidos.length >= 10) {
      this.ipsConhecidos.shift();
    }
    this.ipsConhecidos.push(ip);
    await this.save();
  }
};

// ── Métodos Estáticos 
// Métodos disponíveis na classe Usuario (não em instâncias)

// Busca por Firebase UID (mais comum)
usuarioSchema.statics.encontrarPorFirebaseUid = function (uid) {
  return this.findOne({ firebaseUid: uid, ativo: true });
};

// ── Middleware do Mongoose (Hooks) 
// Executado ANTES de salvar — normaliza dados
usuarioSchema.pre('save', function (next) {
  if (this.email) {
    this.email = this.email.toLowerCase().trim();
  }
  if (this.nome) {
    // Capitaliza primeira letra de cada palavra
    this.nome = this.nome
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .trim();
  }
  next();
});

const Usuario = mongoose.model('Usuario', usuarioSchema);

module.exports = Usuario;
