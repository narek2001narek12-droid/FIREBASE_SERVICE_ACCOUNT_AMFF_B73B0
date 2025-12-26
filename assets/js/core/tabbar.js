import { qsa } from './dom.js';

export function initTabbarActive(activeKey) {
  const links = qsa('.tabbar a[data-tab]');
  links.forEach(a => {
    const on = a.getAttribute('data-tab') === activeKey;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}
