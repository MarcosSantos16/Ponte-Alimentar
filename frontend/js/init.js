'use strict';

// ── Firebase Config 
// ⚠️ Substitua com as configurações do SEU projeto Firebase
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyBopFMNXLhmdQO4nSHPZQJQ5VykiioMaCQ",
  authDomain:        "ponte-alimentar.firebaseapp.com",
  databaseURL:       "https://ponte-alimentar-default-rtdb.firebaseio.com",
  projectId:         "ponte-alimentar",
  storageBucket:     "ponte-alimentar.firebasestorage.app",
  messagingSenderId: "802795099308",
  appId:             "1:802795099308:web:8228f7d177ee194e7cbb09"
};
// ── Rotas da aplicação 
const ROUTES = {
  home:      '/',
  mapa:      '/mapa.html',
  auth:      '/auth.html',
  dashboard: '/dashboard.html',
  doacao:    '/nova-doacao.html',
  perfil:    '/perfil.html',
};

// ── Páginas que exigem autenticação ──────────────────────────
const PROTECTED = ['/dashboard.html', '/nova-doacao.html', '/perfil.html'];

// ── Páginas que redirecionam se JÁ estiver logado ────────────
const AUTH_ONLY  = ['/auth.html'];

// ── Injeta a Navegação em todas as páginas ────────────────────
const injetarNav = () => {
  const pagePath = window.location.pathname;

  const nav = document.createElement('nav');
  nav.id = 'appNav';
  nav.setAttribute('role', 'navigation');
  nav.setAttribute('aria-label', 'Navegação principal');

  nav.innerHTML = `
    <div class="container nav-inner">
      <a href="/index.html" class="nav-logo">
        <span class="ico">🌱</span>
        Food<strong>Bridge</strong>
      </a>

      <div class="nav-links" id="navLinks">
        <a href="/index.html"       class="nav-link ${pagePath.endsWith('index.html') || pagePath === '/' ? 'active' : ''}">Início</a>
        <a href="/mapa.html"        class="nav-link ${pagePath.includes('mapa') ? 'active' : ''}">Mapa de Doações</a>
        <a href="/dashboard.html"   class="nav-link nav-link--auth hidden ${pagePath.includes('dashboard') ? 'active' : ''}">Painel</a>
        <a href="/nova-doacao.html" class="nav-link nav-link--doador hidden ${pagePath.includes('nova-doacao') ? 'active' : ''}">+ Doar</a>
      </div>

      <div class="nav-actions" id="navActions">
        <!-- Preenchido pelo JS após verificar auth -->
        <div class="skeleton" style="width:80px;height:36px;border-radius:8px;"></div>
      </div>

      <button class="nav-hamburger" id="navHamburger" aria-label="Abrir menu" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
    </div>

    <!-- Menu mobile -->
    <div class="nav-mobile" id="navMobile">
      <a href="/index.html"       class="nav-link">Início</a>
      <a href="/mapa.html"        class="nav-link">Mapa de Doações</a>
      <a href="/dashboard.html"   class="nav-link nav-link--auth hidden">Painel</a>
      <a href="/nova-doacao.html" class="nav-link nav-link--doador hidden">+ Doar</a>
      <div id="navMobileActions" style="margin-top:.5rem;display:flex;flex-direction:column;gap:.5rem;"></div>
    </div>
  `;

  document.body.prepend(nav);

  // Hamburger
  const hamburger = document.getElementById('navHamburger');
  const mobile    = document.getElementById('navMobile');
  hamburger?.addEventListener('click', () => {
    const open = mobile.classList.toggle('open');
    hamburger.setAttribute('aria-expanded', String(open));
  });

  // Sombra ao scroll
  window.addEventListener('scroll', () => {
    nav.classList.toggle('scrolled', window.scrollY > 10);
  }, { passive: true });
};

// ── Atualiza Nav com estado de auth ──────────────────────────
const atualizarNav = (usuario) => {
  const navActions       = document.getElementById('navActions');
  const navMobileActions = document.getElementById('navMobileActions');

  // Links que só aparecem logado
  document.querySelectorAll('.nav-link--auth').forEach((el) => {
    el.classList.toggle('hidden', !usuario);
  });
  // Links apenas para doadores/admins
  document.querySelectorAll('.nav-link--doador').forEach((el) => {
    const visivel = usuario && (usuario.papel === 'doador' || usuario.papel === 'admin');
    el.classList.toggle('hidden', !visivel);
  });

  if (!navActions) return;

  if (usuario) {
    const inicial = (usuario.nome || 'U')[0].toUpperCase();
    navActions.innerHTML = `
      <a href="/perfil.html" class="nav-avatar nav-avatar-btn" title="${sanitizeStr(usuario.nome)}" aria-label="Perfil">
        ${sanitizeStr(inicial)}
      </a>
      <button class="btn btn--ghost btn--sm" id="btnSairNav">Sair</button>
    `;
    if (navMobileActions) navMobileActions.innerHTML = `
      <a href="/perfil.html" class="btn btn--secondary btn--full">👤 Perfil</a>
      <button class="btn btn--ghost btn--full" id="btnSairNavMobile">Sair</button>
    `;

    const sair = async () => {
      const { auth, signOut } = window._fb || {};
      if (auth) await signOut(auth).catch(() => {});
      window.location.href = '/index.html';
    };

    document.getElementById('btnSairNav')?.addEventListener('click', sair);
    document.getElementById('btnSairNavMobile')?.addEventListener('click', sair);

  } else {
    navActions.innerHTML = `
      <a href="/auth.html?tab=login"    class="btn btn--ghost btn--sm">Entrar</a>
      <a href="/auth.html?tab=cadastro" class="btn btn--primary btn--sm">Cadastrar</a>
    `;
    if (navMobileActions) navMobileActions.innerHTML = `
      <a href="/auth.html?tab=login"    class="btn btn--secondary btn--full">Entrar</a>
      <a href="/auth.html?tab=cadastro" class="btn btn--primary btn--full">Cadastrar</a>
    `;
  }
};

// Helper seguro (sem import de utils ainda)
const sanitizeStr = (str = '') => {
  const map = {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#x27;'};
  return String(str).replace(/[&<>"']/g, (m) => map[m]);
};

// ── Bootstrap: carrega Firebase e inicializa nav ──────────────
const bootstrap = async () => {
  injetarNav();

  // Carrega módulos Firebase dinamicamente
  const { initializeApp }         = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-app.js');
  const { getAuth, onAuthStateChanged, signOut,
          signInWithEmailAndPassword, createUserWithEmailAndPassword,
          GoogleAuthProvider, signInWithPopup,
          sendPasswordResetEmail, sendEmailVerification }
    = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js');
  const { getDatabase } = await import('https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js');

  const app      = initializeApp(FIREBASE_CONFIG);
  const auth     = getAuth(app);
  const database = getDatabase(app);
  const provider = new GoogleAuthProvider();
  provider.addScope('email'); provider.addScope('profile');

  // Disponibiliza globalmente
  window._fb = {
    auth, database, provider,
    signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword,
    signInWithPopup, sendPasswordResetEmail, sendEmailVerification,
    onAuthStateChanged,
  };

  // Dispara evento para outros módulos
  document.dispatchEvent(new CustomEvent('firebaseReady'));

  // Observa estado de autenticação
  onAuthStateChanged(auth, async (firebaseUser) => {
    const pagePath = window.location.pathname;

    if (firebaseUser) {
      // Busca dados do MongoDB
      try {
        const res = await window._api?.auth?.sincronizar?.() || null;
        const usuario = res?.data || { nome: firebaseUser.displayName || 'Usuário', papel: 'receptor' };
        window._usuarioAtual = usuario;
        atualizarNav(usuario);

        // Redireciona se estava numa página só para não-logados
        if (AUTH_ONLY.some(p => pagePath.includes(p))) {
          window.location.href = '/dashboard.html';
        }
      } catch {
        atualizarNav(null);
      }
    } else {
      window._usuarioAtual = null;
      atualizarNav(null);

      // Redireciona páginas protegidas
      if (PROTECTED.some(p => pagePath.includes(p))) {
        window.location.href = `/auth.html?tab=login&redirect=${encodeURIComponent(pagePath)}`;
      }
    }

    // Esconde loading overlay se existir
    document.getElementById('pageLoading')?.classList.add('fade-out');
    setTimeout(() => document.getElementById('pageLoading')?.remove(), 400);

    // Avisa os módulos da página
    document.dispatchEvent(new CustomEvent('authReady', { detail: { user: firebaseUser, usuario: window._usuarioAtual } }));
  });
};

// Inicia assim que o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
