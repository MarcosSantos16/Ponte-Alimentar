//  config/firebase-admin.js  —  Firebase Admin SDK
//  Usado no back-end para VERIFICAR tokens do front-end


const admin = require('firebase-admin');
const logger = require('../utils/logger');

const initFirebase = () => {
  try {
    // Lê credenciais das variáveis de ambiente — NUNCA do arquivo direto
    const serviceAccount = {
      type: 'service_account',
      project_id: process.env.FIREBASE_PROJECT_ID,
      private_key: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      client_email: process.env.FIREBASE_CLIENT_EMAIL,
    };

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}-default-rtdb.firebaseio.com`,
    });

    logger.info('Firebase Admin SDK inicializado com sucesso');
  } catch (error) {
    logger.error('Falha ao inicializar Firebase Admin:', { error: error.message });
    process.exit(1);
  }
};

module.exports = { initFirebase, admin };
