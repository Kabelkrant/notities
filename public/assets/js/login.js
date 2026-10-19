import { api } from './api.js';

const dlg = document.getElementById('loginDialog'), form = document.getElementById('loginForm'), box = document.getElementById('loginError');
dlg.addEventListener('cancel', (e) => e.preventDefault()); // Escape sluit het inlogscherm niet
dlg.showModal();
form.password.focus();

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  box.hidden = true;
  try {
    await api({ action: 'login', password: form.password.value });
    location.reload();
  } catch (err) {
    box.textContent = err.message; box.hidden = false;
    form.password.value = ''; form.password.focus();
  }
});
