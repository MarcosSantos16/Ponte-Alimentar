//Lógica do Painel do Usuário
'use strict';

const Dashboard = (() => {
  const $ = (id) => document.getElementById(id);
  let _usuario = null;
  let _doacoes = [];
  let _filtroStatus = 'todos';

  // ── Navegação entre seções 
  const irParaSecao = (sectionId) => {
    document.querySelectorAll('.dash-section').forEach((s) => {
      s.classList.toggle('active', s.id === `sec${capitalize(sectionId)}`);
      s.classList.toggle('hidden', s.id !== `sec${capitalize(sectionId)}`);
    });
    document.querySelectorAll('.dash-nav__item').forEach((a) => {
      a.classList.toggle('active', a.dataset.section === sectionId);
    });
  };

  const capitalize = (s) => s.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join('');

  // ── Renderiza informações do usuário ─────────────────────
  const renderUsuario = (u) => {
    const el = $('dashUser');
    if (!el || !u) return;
    const inicial = (u.nome || 'U')[0].toUpperCase();
    el.innerHTML = `
      <div class="dash-user__avatar">${Utils.sanitize(inicial)}</div>
      <div>
        <div class="dash-user__name">${Utils.sanitize(u.nome || 'Usuário')}</div>
        <div class="dash-user__papel">${Utils.fmt.papel(u.papel)}</div>
      </div>
    `;

    // Saudação
    const hora = new Date().getHours();
    const saud = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite';
    const greet = $('dashGreeting');
    if (greet) greet.textContent = `${saud}, ${u.nome?.split(' ')[0]}! Aqui está seu resumo.`;

    // Esconde "Nova Doação" para quem não é doador
    if (u.papel !== 'doador' && u.papel !== 'admin') {
      document.querySelectorAll('#btnNovaDoacaoSidebar, .dash-section__header .btn--primary').forEach((b) => b.classList.add('hidden'));
    }
  };

  // ── Renderiza cards de estatísticas 
  const renderStats = (u, doacoes) => {
    const el = $('statCards');
    if (!el) return;
    const disponivel = doacoes.filter((d) => d.status === 'disponivel').length;
    const reservado  = doacoes.filter((d) => d.status === 'reservado').length;
    const coletado   = doacoes.filter((d) => d.status === 'coletado').length;

    el.innerHTML = `
      <div class="stat-card anim-fade-up">
        <div class="stat-card__icon">🍽️</div>
        <div class="stat-card__val">${Utils.fmt.numero(u.totalDoacoes || doacoes.length)}</div>
        <div class="stat-card__label">Total de doações</div>
      </div>
      <div class="stat-card anim-fade-up anim-delay-1">
        <div class="stat-card__icon">✅</div>
        <div class="stat-card__val">${disponivel}</div>
        <div class="stat-card__label">Disponíveis agora</div>
      </div>
      <div class="stat-card anim-fade-up anim-delay-2">
        <div class="stat-card__icon">🔒</div>
        <div class="stat-card__val">${reservado}</div>
        <div class="stat-card__label">Reservadas</div>
      </div>
      <div class="stat-card anim-fade-up anim-delay-3">
        <div class="stat-card__icon">📦</div>
        <div class="stat-card__val">${coletado}</div>
        <div class="stat-card__label">Coletadas</div>
      </div>
    `;
  };

  // ── Renderiza atividade recente 
  const renderAtividade = (doacoes) => {
    const el = $('atividadeRecente');
    if (!el) return;

    if (!doacoes.length) {
      el.innerHTML = `<div class="empty-state" style="padding:var(--sp-10)">
        <div class="emo">🌱</div><h3>Comece doando!</h3>
        <p>Suas atividades aparecerão aqui.</p>
      </div>`;
      return;
    }

    const cores = { disponivel:'#16A34A', reservado:'#D97706', coletado:'#2563EB', expirado:'#6B7280', cancelado:'#DC2626' };

    el.innerHTML = doacoes.slice(0, 8).map((d) => `
      <div class="activity-item">
        <div class="activity-item__dot" style="background:${cores[d.status] || '#ccc'}"></div>
        <div class="activity-item__body">
          <div class="activity-item__text">
            <strong>${Utils.sanitize(d.titulo)}</strong>
            <span class="badge badge--${d.status === 'disponivel' ? 'success' : d.status === 'reservado' ? 'warn' : 'sand'}" style="margin-left:.5rem;vertical-align:middle">
              ${Utils.fmt.status(d.status)}
            </span>
          </div>
          <div class="activity-item__time">
            ${Utils.fmt.tipo(d.tipo)} · ${Utils.sanitize(d.localizacao?.cidade || '')} · ${Utils.fmt.relativo(d.createdAt)}
          </div>
        </div>
      </div>
    `).join('');
  };

  // Renderiza tabela de doações 
  const renderTabelaDoacoes = (doacoes) => {
    const el = $('listMinhasDoacoes');
    if (!el) return;

    const filtradas = _filtroStatus === 'todos'
      ? doacoes
      : doacoes.filter((d) => d.status === _filtroStatus);

    if (!filtradas.length) {
      el.innerHTML = `<div class="empty-state"><div class="emo">📭</div><h3>Nenhuma doação</h3><p>Tente outro filtro ou crie uma nova doação.</p></div>`;
      return;
    }

    el.innerHTML = `
      <div class="doacao-table">
        <div class="doacao-table-row doacao-table-row--header">
          <span>Doação</span>
          <span class="doacao-table-row__tipo">Tipo</span>
          <span class="doacao-table-row__data">Válida até</span>
          <span>Status</span>
        </div>
        ${filtradas.map((d) => `
          <div class="doacao-table-row">
            <div class="doacao-table-row__titulo">${Utils.sanitize(d.titulo)}</div>
            <div class="doacao-table-row__tipo">${Utils.fmt.tipo(d.tipo).split(' ')[0]}</div>
            <div class="doacao-table-row__data" style="font-size:.8rem;color:var(--c-muted)">${Utils.fmt.data(d.validoAte)}</div>
            <div class="doacao-table-row__actions">
              <span class="badge badge--${badgeStatus(d.status)}">${Utils.fmt.status(d.status)}</span>
              ${d.status === 'disponivel' ? `
                <button class="btn btn--danger btn--sm" data-id="${Utils.sanitize(d.id||d._id)}" data-action="cancelar">Cancelar</button>
              ` : ''}
            </div>
          </div>
        `).join('')}
      </div>
    `;

    // Botões de cancelar
    el.querySelectorAll('[data-action="cancelar"]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Tem certeza que deseja cancelar esta doação?')) return;
        try {
          await Utils.api.doacoes.cancelar(btn.dataset.id);
          Utils.toast.success('Doação cancelada.');
          await carregarDados();
        } catch (err) {
          Utils.toast.error(err.message);
        }
      });
    });
  };

  const badgeStatus = (s) => ({ disponivel:'success', reservado:'warn', coletado:'sand', expirado:'sand', cancelado:'danger' }[s] || 'sand');

  // ── Carrega dados do servidor
  const carregarDados = async () => {
    if (!_usuario) return;
    try {
      const res = await Utils.api.doacoes.listar({ limite: 50 });
      _doacoes = res.data || [];

      // Filtra apenas as do usuário atual no client (o server pode retornar todas)
      const minhas = _doacoes.filter((d) =>
        d.doadorId === _usuario.id || d.doadorId?._id === _usuario.id
      );

      renderStats(_usuario, minhas);
      renderAtividade(minhas);
      renderTabelaDoacoes(minhas);
    } catch (err) {
      Utils.toast.warning('Falha ao carregar dados. ' + err.message);
    }
  };

  // ── Init 
  const init = () => {
    // Aguarda autenticação
    document.addEventListener('authReady', async ({ detail }) => {
      const { usuario } = detail;
      if (!usuario) return; // init.js já redireciona para /auth.html

      _usuario = usuario;
      renderUsuario(usuario);
      await carregarDados();
    });

    // Navegação por tabs
    document.querySelectorAll('.dash-nav__item').forEach((item) => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        irParaSecao(item.dataset.section);
      });
    });
    document.querySelectorAll('.dash-card__link').forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        irParaSecao(link.dataset.section);
      });
    });

    // Filtros de status
    document.querySelectorAll('#filterStatus .chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#filterStatus .chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        _filtroStatus = chip.dataset.status;
        renderTabelaDoacoes(_doacoes.filter((d) =>
          d.doadorId === _usuario?.id || d.doadorId?._id === _usuario?.id
        ));
      });
    });
  };

  return { init };
})();

document.addEventListener('DOMContentLoaded', Dashboard.init);
