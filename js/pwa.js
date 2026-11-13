// Установка на главный экран работает независимо от авторизации в кабинете.
if (window.isSecureContext && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch((error) => console.warn('Не удалось подключить режим приложения', error));
  }, { once: true });
}
