document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('loginForm');
  const button = document.getElementById('submitBtn');
  const feedback = document.getElementById('loginFeedback');
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  const resendButton = document.getElementById('resendLoginCode');
  const params = new URLSearchParams(window.location.search);
  let googleCsrfToken = '';

  document.getElementById('togglePass').addEventListener('click', () => {
    password.type = password.type === 'password' ? 'text' : 'password';
    document.getElementById('eyeIcon').className = password.type === 'text' ? 'bi bi-eye-slash' : 'bi bi-eye';
  });

  function setFeedback(message, type = '') {
    feedback.textContent = message;
    feedback.className = `auth-feedback visible ${type}`;
  }

  function redirectTarget(role) {
    if (role === 'admin') return '../admin.html';
    if (role === 'supplier') return '../supplier.html';
    return params.get('redirect') === 'checkout' ? '../checkout.html' : '../account.html';
  }

  function completeSignIn(data) {
    setFeedback('Inicio de sesión exitoso. Redirigiendo…', 'success');
    window.setTimeout(() => { window.location.href = redirectTarget(data.role); }, 800);
  }

  async function submitGoogleCredential(credential) {
    const response = await fetch('/api/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credential, csrfToken: googleCsrfToken })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No fue posible iniciar sesión con Google.');
    if (data.needsRegistration) {
      const registrationUrl = new URL('register.html?google=1', window.location.href);
      if (params.get('redirect') === 'checkout') registrationUrl.searchParams.set('redirect', 'checkout');
      window.location.href = registrationUrl.href;
      return;
    }
    completeSignIn(data);
  }

  async function setupGoogleButton() {
    const container = document.getElementById('googleButton');
    try {
      const response = await fetch('/api/auth/google/config');
      const config = await response.json();
      if (!response.ok) throw new Error(config.error || 'Google no está configurado.');
      googleCsrfToken = config.csrfToken;
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        window.google.accounts.id.initialize({
          client_id: config.clientId,
          callback: result => submitGoogleCredential(result.credential).catch(error => setFeedback(error.message, 'error'))
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

  form.addEventListener('submit', async event => {
    event.preventDefault();
    document.getElementById('emailErr').textContent = '';
    document.getElementById('passErr').textContent = '';
    const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
    if (!validEmail) document.getElementById('emailErr').textContent = 'Ingresa un correo válido.';
    if (!password.value) document.getElementById('passErr').textContent = 'Ingresa tu contraseña.';
    if (!validEmail || !password.value) return;

    button.disabled = true;
    button.classList.add('loading');
    button.querySelector('.btn-text').textContent = 'Iniciando sesión…';
    setFeedback('Verificando tus datos…');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.value.trim(), password: password.value })
      });
      const data = await response.json();
      if (response.status === 404 && data.registrationRequired) {
        const registrationUrl = new URL('register.html', window.location.href);
        registrationUrl.searchParams.set('email', email.value.trim());
        if (params.get('redirect') === 'checkout') registrationUrl.searchParams.set('redirect', 'checkout');
        window.location.href = registrationUrl.href;
        return;
      }
      if (!response.ok) throw new Error(data.error || 'No fue posible iniciar sesión.');
      completeSignIn(data);
    } catch (error) {
      setFeedback(error.message, 'error');
      resendButton.hidden = error.message !== 'Verifica tu correo antes de iniciar sesión.';
    } finally {
      button.disabled = false;
      button.classList.remove('loading');
      button.querySelector('.btn-text').textContent = 'Entrar';
    }
  });

  resendButton.addEventListener('click', async () => {
    resendButton.disabled = true;
    try {
      const response = await fetch('/api/auth/resend-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.value.trim() })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'No fue posible reenviar el código.');
      setFeedback(data.message, 'success');
    } catch (error) {
      setFeedback(error.message, 'error');
    } finally {
      resendButton.disabled = false;
    }
  });

  const registerLink = document.querySelector('.form-sub a');
  if (params.get('redirect') === 'checkout') registerLink.href = 'register.html?redirect=checkout';
  fetch('/api/auth/session')
    .then(response => response.ok ? response.json() : null)
    .then(session => {
      if (session?.authenticated) window.location.replace(redirectTarget(session.role));
    })
    .catch(error => console.error('Existing session check failed:', error.message));
  setupGoogleButton();
});
