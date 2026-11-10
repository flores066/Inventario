document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('registerForm');
  const feedback = document.getElementById('registerFeedback');
  const params = new URLSearchParams(window.location.search);
  let googleCsrfToken = '';
  let googleOnly = false;
  let captchaToken = '';
  let captchaWidgetId = null;

  function setFeedback(element, message, type = '') {
    element.textContent = message;
    element.className = `auth-feedback visible ${type}`;
  }

  async function readApiResponse(response) {
    const body = await response.text();
    try {
      return body ? JSON.parse(body) : {};
    } catch {
      throw new Error(`El servidor devolvió una respuesta inesperada (HTTP ${response.status}). Abre la tienda desde http://localhost:3000.`);
    }
  }

  function redirectTarget() {
    return params.get('redirect') === 'checkout' ? '../checkout.html' : '../account.html';
  }

  function makeToggle(buttonId, inputId, iconId) {
    const button = document.getElementById(buttonId);
    button.addEventListener('click', () => {
      const input = document.getElementById(inputId);
      input.type = input.type === 'password' ? 'text' : 'password';
      document.getElementById(iconId).className = input.type === 'text' ? 'bi bi-eye-slash' : 'bi bi-eye';
    });
  }

  function loadTurnstile(siteKey, testMode) {
    const container = document.getElementById('captchaContainer');
    if (testMode) document.getElementById('captchaModeNote').hidden = false;
    const render = () => {
      if (!window.turnstile) {
        setFeedback(feedback, 'No se pudo cargar Cloudflare Turnstile. Revisa tu conexión a Internet.', 'error');
        return;
      }
      captchaWidgetId = window.turnstile.render(container, {
        sitekey: siteKey,
        callback: token => {
          captchaToken = token;
          document.getElementById('captchaErr').textContent = '';
        },
        'expired-callback': () => {
          captchaToken = '';
          document.getElementById('captchaErr').textContent = 'La verificación venció. Complétala otra vez.';
        },
        'error-callback': () => {
          captchaToken = '';
          document.getElementById('captchaErr').textContent = 'No fue posible verificar el CAPTCHA. Intenta de nuevo.';
        }
      });
    };
    if (window.turnstile) {
      render();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = render;
    script.onerror = () => setFeedback(feedback, 'No se pudo cargar Cloudflare Turnstile.', 'error');
    document.head.appendChild(script);
  }

  async function setupCaptcha() {
    try {
      const response = await fetch('/api/auth/captcha/config');
      const config = await readApiResponse(response);
      if (!response.ok) throw new Error(config.error || 'CAPTCHA no configurado.');
      loadTurnstile(config.siteKey, config.testMode);
    } catch (error) {
      document.getElementById('captchaErr').textContent = error.message;
      document.getElementById('submitBtn').disabled = true;
    }
  }

  makeToggle('togglePass', 'password', 'eyeIcon');
  makeToggle('togglePass2', 'passConfirm', 'eyeIcon2');

  async function submitGoogleCredential(credential) {
    const response = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential, csrfToken: googleCsrfToken })
    });
    const data = await readApiResponse(response);
    if (!response.ok) throw new Error(data.error || 'No fue posible iniciar sesión con Google.');
    if (data.needsRegistration) {
      const target = new URL('register.html?google=1', window.location.href);
      if (params.get('redirect') === 'checkout') target.searchParams.set('redirect', 'checkout');
      window.location.href = target.href;
      return;
    }
    setFeedback(feedback, 'Inicio de sesión exitoso. Redirigiendo…', 'success');
    window.setTimeout(() => { window.location.href = redirectTarget(); }, 800);
  }

  async function setupGoogleButton() {
    const container = document.getElementById('googleButton');
    try {
      const response = await fetch('/api/auth/google/config');
      const config = await readApiResponse(response);
      if (!response.ok) throw new Error(config.error || 'Google no está configurado.');
      googleCsrfToken = config.csrfToken;
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        window.google.accounts.id.initialize({
          client_id: config.clientId,
          callback: result => submitGoogleCredential(result.credential).catch(error => setFeedback(feedback, error.message, 'error'))
        });
        window.google.accounts.id.renderButton(container, { theme: 'filled_black', size: 'large', text: 'continue_with', width: 320 });
      };
      script.onerror = () => { container.textContent = 'No fue posible cargar Google.'; };
      document.head.appendChild(script);
    } catch (error) {
      container.textContent = error.message;
      container.classList.add('google-unavailable');
    }
  }

  async function initializeGoogleRegistration() {
    if (params.get('google') !== '1') return;
    const response = await fetch('/api/auth/google/pending');
    const pending = await readApiResponse(response);
    if (!pending.pending) {
      setFeedback(feedback, 'La verificación de Google venció. Inicia de nuevo.', 'error');
      return;
    }
    googleOnly = true;
    document.getElementById('firstName').value = pending.firstName || '';
    document.getElementById('lastName').value = pending.lastName || '';
    document.getElementById('email').value = pending.email;
    document.getElementById('email').readOnly = true;
    document.getElementById('passwordGroup').hidden = true;
    document.getElementById('confirmGroup').hidden = true;
    document.querySelector('.form-label').textContent = 'Un paso más';
    setFeedback(feedback, 'Completa el CAPTCHA y confirma tus datos para crear tu cuenta con Google.');
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    setFeedback(feedback, '');
    document.getElementById('captchaErr').textContent = '';
    const firstName = document.getElementById('firstName');
    const lastName = document.getElementById('lastName');
    const email = document.getElementById('email');
    const password = document.getElementById('password');
    const confirmation = document.getElementById('passConfirm');
    const errors = {
      firstName: document.getElementById('firstNameErr'),
      lastName: document.getElementById('lastNameErr'),
      email: document.getElementById('emailErr'),
      password: document.getElementById('passErr'),
      confirmation: document.getElementById('confirmErr'),
      terms: document.getElementById('termsErr')
    };
    Object.values(errors).forEach(error => { error.textContent = ''; });

    let valid = true;
    if (!firstName.value.trim()) { errors.firstName.textContent = 'Ingresa tu nombre.'; valid = false; }
    if (!lastName.value.trim()) { errors.lastName.textContent = 'Ingresa tu apellido.'; valid = false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) { errors.email.textContent = 'Correo inválido.'; valid = false; }
    if (!googleOnly && password.value.length < 8) { errors.password.textContent = 'Mínimo 8 caracteres.'; valid = false; }
    if (!googleOnly && confirmation.value !== password.value) { errors.confirmation.textContent = 'Las contraseñas no coinciden.'; valid = false; }
    if (!document.getElementById('terms').checked) { errors.terms.textContent = 'Debes aceptar los términos.'; valid = false; }
    if (!captchaToken) {
      document.getElementById('captchaErr').textContent = 'Completa la verificación CAPTCHA.';
      valid = false;
    }
    if (!valid) return;

    const button = document.getElementById('submitBtn');
    button.disabled = true;
    button.classList.add('loading');
    button.querySelector('.btn-text').textContent = 'Creando cuenta…';
    setFeedback(feedback, 'Registrando tu cuenta…');
    try {
      const response = await fetch(googleOnly ? '/api/auth/google/register' : '/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.value.trim(),
          lastName: lastName.value.trim(),
          email: email.value.trim(),
          phone: document.getElementById('phone').value.trim(),
          password: password.value,
          newsletter: document.getElementById('newsletter').checked,
          captchaToken
        })
      });
      const data = await readApiResponse(response);
      if (!response.ok) throw new Error(data.error || 'No fue posible crear la cuenta.');
      setFeedback(feedback, 'Cuenta creada e inicio de sesión exitoso. Redirigiendo…', 'success');
      window.setTimeout(() => { window.location.href = redirectTarget(); }, 900);
    } catch (error) {
      setFeedback(feedback, error.message, 'error');
      captchaToken = '';
      if (window.turnstile && captchaWidgetId !== null) window.turnstile.reset(captchaWidgetId);
    } finally {
      button.disabled = false;
      button.classList.remove('loading');
      button.querySelector('.btn-text').textContent = 'Crear mi cuenta';
    }
  });

  document.getElementById('password').addEventListener('input', event => {
    const value = event.currentTarget.value;
    const bar = document.getElementById('strengthBar');
    const levels = [
      { color: '#c0574a', text: 'Muy débil' },
      { color: '#d4884a', text: 'Débil' },
      { color: '#c8aa44', text: 'Regular' },
      { color: '#6baa6e', text: 'Fuerte' }
    ];
    const score = [value.length >= 8, /[A-Z]/.test(value), /[0-9]/.test(value), /[^A-Za-z0-9]/.test(value)]
      .filter(Boolean).length;
    const level = levels[Math.max(score - 1, 0)];
    bar.style.opacity = value ? '1' : '0';
    document.getElementById('strengthFill').style.width = `${[20, 40, 65, 100][Math.max(score - 1, 0)]}%`;
    document.getElementById('strengthFill').style.background = level.color;
    document.getElementById('strengthLabel').textContent = value ? level.text : '';
    document.getElementById('strengthLabel').style.color = level.color;
  });

  const loginLink = document.querySelector('.form-sub a');
  if (params.get('redirect') === 'checkout') loginLink.href = 'login.html?redirect=checkout';
  if (params.get('email') && params.get('google') !== '1') {
    document.getElementById('email').value = params.get('email');
  }
  initializeGoogleRegistration().catch(error => setFeedback(feedback, error.message, 'error'));
  setupCaptcha();
  setupGoogleButton();
});
