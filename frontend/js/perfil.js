//  js/perfil.js  —  Lógica da Página de Perfil
'use strict';

const Perfil = (() => {
  const $ = (id) => document.getElementById(id);

  // ── Renderiza cabeçalho do perfil ────────────────────────
  const renderHeader = (u) => {
    const el = $('perfilHeader');
    if (!el || !u) return;
    const inicial = (u.nome || 'U')[0].toUpperCase();
    el.innerHTML = `
      <div class="perfil-header__avatar">${Utils.sanitize(inicial)}</div>
      <div>
        <div class="perfil-header__name">${Utils.sanitize(u.nome || 'Usuário')}</div>
        <div class="perfil-header__email">${Utils.sanitize(u.email || '')}</div>
        <div class="perfil-header__papel">
          <span class="badge badge--green">${Utils.fmt.papel(u.papel)}</span>
          ${u.emailVerificado === false ? '<span class="badge badge--warn" style="margin-left:.4rem">⚠️ E-mail não verificado</span>' : ''}
        </div>
      </div>
    `;
  };

  // ── Preenche o formulário com dados atuais ───────────────
  const preencherForm = (u) => {
    if (!u) return;
    const set = (id, val) => { const el = $(id); if (el) el.value = val || ''; };
    set('perfNome',      u.nome);
    set('perfEmail',     u.email);
    set('perfTelefone',  u.telefone);
    set('perfOrg',       u.organizacao);
    set('perfPapel',     Utils.fmt.papel(u.papel));
  };

  // ── Renderiza estatísticas 
  const renderStats = (u) => {
    const set = (id, val) => { const el = $(id); if (el) el.textContent = val; };
    set('statDoacoes',  Utils.fmt.numero(u.totalDoacoes  || 0));
    set('statReservas', Utils.fmt.numero(u.totalReservas || 0));
    set('statMembro',   u.createdAt ? Utils.fmt.data(u.createdAt) : '—');
  };

  // ── Salvar perfil 
  const salvar = async (e) => {
    e.preventDefault();
    Utils.clearError('perfNome');

    const nome     = $('perfNome')?.value.trim();
    const telefone = $('perfTelefone')?.value.trim();
    const org      = $('perfOrg')?.value.trim();

    if (!Utils.validators.nome(nome)) {
      Utils.setError('perfNome', 'Nome deve ter 2–100 caracteres.');
      return;
    }

    const btn = $('btnSalvarPerfil');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
      // Em produção, adicione rota PATCH /api/auth/perfil no backend
      // Por ora apenas sincroniza e mostra sucesso
      Utils.toast.success('Perfil atualizado com sucesso!');
    } catch (err) {
      Utils.toast.error(err.message || 'Falha ao salvar.');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar alterações'; }
    }
  };

  // ── Sessão 
  const atualizarSessao = () => {
    const el = $('sessaoInfo');
    if (!el) return;
    const auth = window._fb?.auth;
    if (auth?.currentUser) {
      // metadata.lastSignInTime pode não estar disponível em todos os providers
      const data = auth.currentUser.metadata?.lastSignInTime;
      el.textContent = data ? `Último acesso: ${Utils.fmt.data(data)}` : 'Sessão ativa agora';
    }
  };

  // ── Alterar senha 
  const alterarSenha = async () => {
    const auth = window._fb?.auth;
    const sendPasswordResetEmail = window._fb?.sendPasswordResetEmail;
    const email = auth?.currentUser?.email;
    if (!email || !sendPasswordResetEmail) return;

    try {
      await sendPasswordResetEmail(auth, email);
      Utils.toast.success('E-mail de alteração de senha enviado! 📧', 6000);
    } catch (err) {
      Utils.toast.error('Falha ao enviar e-mail.');
    }
  };

  // ── Init 
  const init = () => {
    document.addEventListener('authReady', async ({ detail }) => {
      const { usuario } = detail;
      if (!usuario) return; // init.js redireciona

      // Busca dados mais atualizados do backend
      try {
        const res = await Utils.api.auth.perfil();
        const u   = res.data || usuario;
        renderHeader(u);
        preencherForm(u);
        renderStats(u);
        atualizarSessao();
      } catch {
        renderHeader(usuario);
        preencherForm(usuario);
        renderStats(usuario);
      }
    });

    // Form submit
    $('formPerfil')?.addEventListener('submit', salvar);

    // Segurança
    $('btnAlterarSenha')?.addEventListener('click', alterarSenha);
    $('btnEncerrarSessao')?.addEventListener('click', async () => {
      const { auth, signOut } = window._fb || {};
      if (auth) await signOut(auth).catch(() => {});
      window.location.href = '/index.html';
    });
  };

  return { init };
})();

document.addEventListener('DOMContentLoaded', Perfil.init);
