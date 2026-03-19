//  config/mongodb.js  —  Conexão segura com MongoDB Atlas

const mongoose = require('mongoose');
const logger = require('../utils/logger');

const mongoOptions = {
  maxPoolSize: 10,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  family: 4,
};

const connectMongoDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGODB_URI, mongoOptions);

    logger.info(`MongoDB conectado: ${conn.connection.host}`);

    mongoose.connection.on('error', (err) => {
      logger.error('Erro MongoDB:', { error: err.message });
    });

    mongoose.connection.on('disconnected', () => {
      logger.warn('MongoDB desconectado — tentando reconectar...');
    });

    mongoose.connection.on('reconnected', () => {
      logger.info('MongoDB reconectado com sucesso');
    });

    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      logger.info('Conexão MongoDB encerrada (SIGINT)');
      process.exit(0);
    });

  } catch (error) {
    logger.error('Falha ao conectar com MongoDB:', { error: error.message });
    process.exit(1);
  }
};

module.exports = connectMongoDB;