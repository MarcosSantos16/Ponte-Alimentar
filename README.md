# 🌱 FoodBridge — Plataforma de Redistribuição de Alimentos

## 📁 Estrutura

```
foodbridge/
├── backend/
│   ├── config/          mongodb.js · firebase-admin.js
│   ├── middleware/       security.js · auth.js · validate.js · errorHandler.js
│   ├── models/          Usuario.js · Doacao.js
│   ├── routes/          auth.js · doacoes.js
│   ├── utils/           logger.js
│   ├── .env.example
│   └── server.js
│
└── frontend/
    ├── css/             global.css · index.css · auth.css · mapa.css
    │                    dashboard.css · nova-doacao.css · perfil.css
    ├── js/              init.js · utils.js · auth.js · mapa.js
    │                    dashboard.js · nova-doacao.js · perfil.js
    ├── index.html        Landing page (público)
    ├── auth.html         Login / Cadastro
    ├── mapa.html         Mapa em tempo real (público)
    ├── dashboard.html    Painel (🔒 protegida)
    ├── nova-doacao.html  Criar doação 4 passos (🔒 protegida)
    └── perfil.html       Perfil e segurança (🔒 protegida)
```

## 🚀 Como rodar

```bash
# Backend
cd backend && cp .env.example .env && npm install && npm run dev

# Frontend (qualquer servidor local)
npx serve frontend -l 3000
```

Configure `FIREBASE_CONFIG` em `frontend/js/init.js` e as variáveis em `backend/.env`.

> Nunca commite o `.env` no Git!
