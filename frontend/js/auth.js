
//Lógica da Página auth.html

'use strict';

const AuthPage = (() => {
  const $ = (id) => document.getElementById(id);
  let _loading = false;

  // ── Firebase erros → PT-BR 
  const erros = {
    'auth/email-already-in-use':    'Este e-mail já está cadastrado.',
    'auth/user-not-found':          'E-mail ou senha incorretos.',
    'auth/wrong-password':          'E-mail ou senha incorretos.',
    'auth/invalid-credential':      'E-mail ou senha incorretos.',
    'auth/invalid-email':           'E-mail inválido.',
    'auth/weak-password':           'Senha fraca. Mínimo 8 caracteres com letras e números.',
    'auth/too-many-requests':       'Muitas tentativas. Aguarde alguns minutos.',
    'auth/user-disabled':           'Conta suspensa. Entre em contato com o suporte.',
    'auth/network-request-failed':  'Erro de conexão. Verifique sua internet.',
    'auth/popup-blocked':           'Popup bloqueado. Permita popups neste site.',
    'auth/popup-closed-by-user':    'Login cancelado.',
    'auth/cancelled-popup-request': '',
  };
  const trad = (code) => erros[code] || 'Erro ao autenticar. Tente novamente.';

  // ── Tabs 
  const irPara = (aba) => {
    const loginEl = $('panelLogin');
    const cadEl   = $('panelCad');
    const tlEl    = $('tabLogin');
    const tcEl    = $('tabCadastro');

    if (aba === 'login') {
      loginEl?.classList.remove('hidden'); cadEl?.classList.add('hidden');
      tlEl?.setAttribute('aria-selected','true'); tcEl?.setAttribute('aria-selected','false');
    } else {
      cadEl?.classList.remove('hidden');   loginEl?.classList.add('hidden');
      tcEl?.setAttribute('aria-selected','true'); tlEl?.setAttribute('aria-selected','false');
    }
    esconderErro();
  };

  // ── Loading 
  const mostrarLoading = () => {
    _loading = true;
    $('authLoading')?.classList.remove('hidden');
  };
  const esconderLoading = () => {
    _loading = false;
    $('authLoading')?.classList.add('hidden');
  };
  const mostrarErro = (msg) => {
    esconderLoading();
    const el = $('authError');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('hidden');
  };
  const esconderErro = () => $('authError')?.classList.add('hidden');

  // ── Redireciona após login 
  const redirecionar = () => {
    const redirect = Utils.getParam('redirect');
    window.location.href = redirect || '/dashboard.html';
  };

  // ── Sincroniza com MongoDB 
  const sincronizar = async (firebaseUser, dadosCadastro = null) => {
    // Se é cadastro novo, registra no MongoDB
    if (dadosCadastro) {
      await Utils.api.auth.registrar(dadosCadastro);
    }
    const res = await Utils.api.auth.sincronizar();
    return res.data;
  };

  // ── Login com Google 
  const loginGoogle = async () => {
    if (_loading) return;
    const { auth, provider, signInWithPopup } = window._fb || {};
    if (!auth) return Utils.toast.error('Firebase não inicializado.');

    mostrarLoading();
    try {
      const { user } = await signInWithPopup(auth, provider);

      // Tenta sincronizar; se não existir, cria com papel padrão
      let mongoUser;
      try {
        mongoUser = await sincronizar(user);
      } catch (e) {
        if (e.status === 403 || e.status === 404) {
          mongoUser = await sincronizar(user, {
            firebaseUid: user.uid,
            nome:  user.displayName || 'Usuário',
            email: user.email,
            papel: Utils.getParam('papel') || 'receptor',
            idToken: await user.getIdToken(),
          });
        } else throw e;
      }

      window._usuarioAtual = mongoUser;
      Utils.toast.success(`Bem-vindo, ${mongoUser?.nome?.split(' ')[0]}! 👋`);
      redirecionar();
    } catch (err) {
      if (err.code === 'auth/cancelled-popup-request') { esconderLoading(); return; }
      mostrarErro(trad(err.code));
    }
  };

  // ── Login email/senha 
  const loginEmail = async (e) => {
    e.preventDefault();
    if (_loading) return;
    const emailEl = $('loginEmail'), senhaEl = $('loginSenha');
    Utils.clearError('loginEmail'); Utils.clearError('loginSenha'); esconderErro();

    let ok = true;
    if (!Utils.validators.email(emailEl?.value)) { Utils.setError('loginEmail','E-mail inválido.'); ok = false; }
    if (!Utils.validators.naoVazio(senhaEl?.value)) { Utils.setError('loginSenha','Informe sua senha.'); ok = false; }
    if (!ok) return;

    const { auth, signInWithEmailAndPassword } = window._fb || {};
    mostrarLoading();
    try {
      const { user } = await signInWithEmailAndPassword(auth, emailEl.value.trim(), senhaEl.value);
      const mongoUser = await sincronizar(user);
      window._usuarioAtual = mongoUser;
      Utils.toast.success('Login realizado com sucesso! 👋');
      redirecionar();
    } catch (err) {
      mostrarErro(trad(err.code) || err.message);
    } finally {
      if (senhaEl) senhaEl.value = '';
    }
  };

  // ── Cadastro email/senha 
  const cadastroEmail = async (e) => {
    e.preventDefault();
    if (_loading) return;

    const nomeEl  = $('cadNome'),  emailEl = $('cadEmail'),
          senhaEl = $('cadSenha'), papelEl = $('cadPapel');

    ['cadNome','cadEmail','cadSenha','cadPapel'].forEach(Utils.clearError);
    esconderErro();

    let ok = true;
    if (!Utils.validators.nome(nomeEl?.value))   { Utils.setError('cadNome', 'Nome deve ter 2–100 caracteres.'); ok = false; }
    if (!Utils.validators.email(emailEl?.value))  { Utils.setError('cadEmail','E-mail inválido.'); ok = false; }
    if (!Utils.validators.senha(senhaEl?.value))  { Utils.setError('cadSenha','Mín. 8 caracteres com letras e números.'); ok = false; }
    if (!papelEl?.value)                          { Utils.setError('cadPapel','Selecione um papel.'); ok = false; }
    if (!ok) return;

    const { auth, createUserWithEmailAndPassword, sendEmailVerification } = window._fb || {};
    mostrarLoading();

    let firebaseUser = null;
    try {
      const { user } = await createUserWithEmailAndPassword(auth, emailEl.value.trim(), senhaEl.value);
      firebaseUser = user;
      await sendEmailVerification(user);

      const mongoUser = await sincronizar(user, {
        firebaseUid: user.uid,
        nome:    nomeEl.value.trim(),
        email:   emailEl.value.trim(),
        papel:   papelEl.value,
        idToken: await user.getIdToken(),
      });

      window._usuarioAtual = mongoUser;
      Utils.toast.success('Conta criada! Verifique seu e-mail. 📧', 6000);
      redirecionar();
    } catch (err) {
      if (firebaseUser && err.status) {
        try { await firebaseUser.delete(); } catch(_) {}
      }
      const msg = err.message?.includes('já cadastrado') ? 'E-mail já cadastrado.' : (trad(err.code) || err.message);
      mostrarErro(msg);
    } finally {
      if (senhaEl) senhaEl.value = '';
    }
  };

  // ── Recuperar senha 
  const recuperarSenha = async () => {
    const email = $('loginEmail')?.value.trim();
    if (!email || !Utils.validators.email(email)) {
      Utils.toast.warning('Digite seu e-mail no campo acima primeiro.');
      return;
    }
    const { auth, sendPasswordResetEmail } = window._fb || {};
    try {
      await sendPasswordResetEmail(auth, email);
      Utils.toast.success('E-mail de recuperação enviado! 📧', 6000);
    } catch (err) {
      Utils.toast.error(trad(err.code));
    }
  };

  // ── Init 
  const init = () => {
    // Tabs
    $('tabLogin')?.addEventListener('click',    () => irPara('login'));
    $('tabCadastro')?.addEventListener('click', () => irPara('cadastro'));

    // Pré-seleciona aba pela URL ?tab=
    const tabParam = Utils.getParam('tab');
    if (tabParam === 'cadastro') irPara('cadastro');

    // Pré-seleciona papel pela URL ?papel=
    const papelParam = Utils.getParam('papel');
    const papelEl = $('cadPapel');
    if (papelParam && papelEl) papelEl.value = papelParam;

    // Google
    $('btnGoogle')?.addEventListener('click',    loginGoogle);
    $('btnGoogleCad')?.addEventListener('click', loginGoogle);

    // Forms
    $('formLogin')?.addEventListener('submit', loginEmail);
    $('formCad')?.addEventListener('submit',   cadastroEmail);

    // Recuperar senha
    $('btnEsqueci')?.addEventListener('click', recuperarSenha);

    // UX helpers
    Utils.initToggleSenha();
    Utils.initForcaSenha('cadSenha', 'senhaFill');

    // Contador animado na decoração
    document.addEventListener('authReady', () => {
      const el = $('decoKg');
      if (el) Utils.animarContador(el, 1240);
    });
  };

  return { init };
})();

document.addEventListener('firebaseReady', AuthPage.init);
