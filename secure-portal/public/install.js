(() => {
  const section = document.querySelector('#app-install');
  if (!section) return;
  const dialog = document.querySelector('#install-guide');
  const status = document.querySelector('#install-status');
  const options = section.querySelector('[data-install-options]');
  const media = window.matchMedia('(display-mode: standalone)');
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const platform = ios ? 'ios' : /Android/.test(navigator.userAgent) ? 'android' : 'desktop';
  let deferredPrompt = null;
  let busy = false;
  let opener = null;
  const installed = () => media.matches || navigator.standalone === true;
  function syncInstalled() {
    options.hidden = installed();
    status.textContent = installed() ? '설치된 진설 포털 앱에서 사용 중입니다.' : '';
  }
  const guides = {
    desktop: {title: 'PC · Mac 설치', steps: ['PC에서 진설 포털을 Chrome 또는 Edge로 엽니다.', '주소창의 설치 아이콘 또는 브라우저 메뉴의 ‘앱 설치’를 선택합니다.', '설치를 완료한 뒤 바탕화면이나 앱 목록에서 진설 포털을 실행합니다.']},
    android: {title: '안드로이드 설치', steps: ['안드로이드 기기에서 진설 포털을 Chrome으로 엽니다.', '브라우저 메뉴 ⋮에서 ‘홈 화면에 추가’ 또는 ‘앱 설치’를 선택합니다.', '설치 확인을 마치면 홈 화면에 진설 포털 아이콘이 생깁니다.']},
    ios: {title: '아이폰 · 아이패드 설치', steps: ['아이폰 또는 아이패드에서 진설 포털을 Safari로 엽니다.', '공유 버튼을 누르고 ‘홈 화면에 추가’를 선택합니다.', '‘웹 앱으로 열기’가 보이면 켠 뒤 ‘추가’를 누릅니다.']}
  };
  function showGuide(target) {
    const guide = guides[target];
    document.querySelector('#install-guide-title').textContent = guide.title;
    document.querySelector('#install-steps').replaceChildren(...guide.steps.map(text => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));
    document.querySelector('#install-copy-status').textContent = '';
    document.querySelector('#install-address').value = location.origin + '/';
    if (!dialog.open) dialog.showModal();
  }
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredPrompt = event;
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    options.hidden = true;
    status.textContent = '진설 포털을 설치했습니다. 바탕화면이나 홈 화면에서 실행하세요.';
    if (dialog.open) dialog.close();
  });
  media.addEventListener('change', syncInstalled);
  syncInstalled();
  section.querySelectorAll('[data-install-platform]').forEach(button => {
    if (button.dataset.installPlatform === platform) button.dataset.current = 'true';
    button.addEventListener('click', async () => {
      if (busy || installed()) return;
      opener = button;
      const target = button.dataset.installPlatform;
      if (target !== platform || target === 'ios' || !deferredPrompt) {
        showGuide(target);
        return;
      }
      const prompt = deferredPrompt;
      deferredPrompt = null;
      busy = true;
      button.disabled = true;
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        status.textContent = choice.outcome === 'accepted' ? '설치 요청을 확인했습니다. 설치가 완료되면 아이콘으로 실행하세요.' : '설치를 취소했습니다. 버튼을 눌러 다시 설치 방법을 확인할 수 있습니다.';
      } catch {
        showGuide(target);
      } finally {
        busy = false;
        button.disabled = false;
      }
    });
  });
  dialog.querySelectorAll('[data-close-install]').forEach(button => button.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('close', () => opener?.focus());
  document.querySelector('#install-copy').addEventListener('click', async () => {
    const feedback = document.querySelector('#install-copy-status');
    try {
      await navigator.clipboard.writeText(location.origin + '/');
      feedback.textContent = '사이트 주소를 복사했습니다.';
    } catch {
      const address = document.querySelector('#install-address');
      address.focus();
      address.select();
      feedback.textContent = '위 주소를 길게 누르거나 Ctrl+C로 복사해 주세요.';
    }
  });
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js', {scope: '/', updateViaCache: 'none'}).catch(() => {
      if (!installed()) status.textContent = '자동 설치를 준비하지 못했습니다. 기기별 버튼에서 설치 방법을 확인해 주세요.';
    });
  }
})();
