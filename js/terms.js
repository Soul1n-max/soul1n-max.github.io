// Страница соглашения: та же тема, что выбрана в планере (spm2_theme), иначе — как в системе
try { const t = localStorage.getItem('spm2_theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (_) {}
