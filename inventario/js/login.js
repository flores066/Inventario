document.addEventListener('DOMContentLoaded', () => {
  const togglePass = document.getElementById('togglePass');
  const email = document.getElementById('email');
  const pass = document.getElementById('password');
  const emailErr = document.getElementById('emailErr');
  const passErr = document.getElementById('passErr');

  togglePass.addEventListener('click', () => {
    if (pass.type === 'password') {
      pass.type = 'text';
      document.getElementById('eyeIcon').className = 'bi bi-eye-slash';
    } else {
      pass.type = 'password';
      document.getElementById('eyeIcon').className = 'bi bi-eye';
    }
  });

  document.getElementById('loginForm').addEventListener('submit', function (e) {
    e.preventDefault();
    let ok = true;
    emailErr.textContent = '';
    passErr.textContent = '';

    if (!email.value || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
      emailErr.textContent = 'Ingresa un correo válido.';
      email.closest('.input-wrap').classList.add('error');
      ok = false;
    } else {
      email.closest('.input-wrap').classList.remove('error');
    }

    if (!pass.value || pass.value.length < 6) {
      passErr.textContent = 'La contraseña debe tener al menos 6 caracteres.';
      pass.closest('.input-wrap').classList.add('error');
      ok = false;
    } else {
      pass.closest('.input-wrap').classList.remove('error');
    }

    if (ok) {
      const btn = document.getElementById('submitBtn');
      btn.classList.add('loading');
      btn.querySelector('.btn-text').textContent = 'Verificando…';
      fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.value.trim(), password: pass.value })
      }).then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No fue posible iniciar sesión.');
        alert('Inicio de sesión exitoso.');
        window.location.href = '../index.html';
      }).catch(error => {
        passErr.textContent = error.message;
        pass.closest('.input-wrap').classList.add('error');
      }).finally(() => {
        btn.classList.remove('loading');
        btn.querySelector('.btn-text').textContent = 'Entrar';
      });
    }
  });

  document.querySelectorAll('.btn-social').forEach(btn => {
    btn.addEventListener('click', () => {
      alert('Inicio de sesión social en desarrollo.');
    });
  });
});
