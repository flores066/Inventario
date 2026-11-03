document.addEventListener('DOMContentLoaded', () => {
  function makeToggle(btnId, inputId, iconId) {
    document.getElementById(btnId).addEventListener('click', function () {
      const inp = document.getElementById(inputId);
      const icon = document.getElementById(iconId);
      inp.type = inp.type === 'password' ? 'text' : 'password';
      icon.className = inp.type === 'text' ? 'bi bi-eye-slash' : 'bi bi-eye';
    });
  }

  makeToggle('togglePass', 'password', 'eyeIcon');
  makeToggle('togglePass2', 'passConfirm', 'eyeIcon2');

  document.getElementById('registerForm').addEventListener('submit', function (e) {
    e.preventDefault();
    let ok = true;

    const fields = {
      firstName: { el: document.getElementById('firstName'), err: document.getElementById('firstNameErr'), msg: 'Ingresa tu nombre.' },
      lastName: { el: document.getElementById('lastName'), err: document.getElementById('lastNameErr'), msg: 'Ingresa tu apellido.' },
      email: { el: document.getElementById('email'), err: document.getElementById('emailErr'), msg: 'Correo inválido.' },
      password: { el: document.getElementById('password'), err: document.getElementById('passErr'), msg: 'Mínimo 8 caracteres.' },
      passConfirm: { el: document.getElementById('passConfirm'), err: document.getElementById('confirmErr'), msg: 'Las contraseñas no coinciden.' },
    };

    Object.values(fields).forEach(f => {
      f.err.textContent = '';
      f.el.closest('.input-wrap').classList.remove('error');
    });
    document.getElementById('termsErr').textContent = '';

    if (!fields.firstName.el.value.trim()) { fields.firstName.err.textContent = fields.firstName.msg; fields.firstName.el.closest('.input-wrap').classList.add('error'); ok = false; }
    if (!fields.lastName.el.value.trim()) { fields.lastName.err.textContent = fields.lastName.msg; fields.lastName.el.closest('.input-wrap').classList.add('error'); ok = false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(fields.email.el.value)) { fields.email.err.textContent = fields.email.msg; fields.email.el.closest('.input-wrap').classList.add('error'); ok = false; }
    if (fields.password.el.value.length < 8) { fields.password.err.textContent = fields.password.msg; fields.password.el.closest('.input-wrap').classList.add('error'); ok = false; }
    if (fields.passConfirm.el.value !== fields.password.el.value) { fields.passConfirm.err.textContent = fields.passConfirm.msg; fields.passConfirm.el.closest('.input-wrap').classList.add('error'); ok = false; }
    if (!document.getElementById('terms').checked) { document.getElementById('termsErr').textContent = 'Debes aceptar los términos.'; ok = false; }

    if (ok) {
      const btn = document.getElementById('submitBtn');
      btn.classList.add('loading');
      btn.querySelector('.btn-text').textContent = 'Creando cuenta…';
      fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: fields.firstName.el.value.trim(),
          lastName: fields.lastName.el.value.trim(),
          email: fields.email.el.value.trim(),
          phone: document.getElementById('phone').value.trim(),
          password: fields.password.el.value,
          newsletter: document.getElementById('newsletter').checked
        })
      }).then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No fue posible crear la cuenta.');
        alert(data.message);
        window.location.href = 'login.html';
      }).catch(error => {
        fields.email.err.textContent = error.message;
        fields.email.el.closest('.input-wrap').classList.add('error');
      }).finally(() => {
        btn.classList.remove('loading');
        btn.querySelector('.btn-text').textContent = 'Crear mi cuenta';
      });
    }
  });

  document.querySelectorAll('.btn-social').forEach(btn => {
    btn.addEventListener('click', () => {
      alert('Registro social en desarrollo.');
    });
  });
});
