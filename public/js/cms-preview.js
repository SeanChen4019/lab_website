(function () {
  'use strict';

  const labelMap = {
    banner: '轮播图',
    team: '团队成员',
    news: '新闻文章',
    notice: '通知公告',
    'research-area': '研究方向',
    project: '科研项目',
    download: '下载资源',
    'page-content': '页面文案'
  };

  function notifyParent(payload) {
    if (window.parent === window) return;
    window.parent.postMessage(Object.assign({
      source: 'nuaa-cms-preview'
    }, payload), window.location.origin);
  }

  function keepCmsMode(url) {
    try {
      const next = new URL(url, window.location.href);
      if (next.origin !== window.location.origin) return null;
      if (next.pathname.startsWith('/admin') || next.pathname.startsWith('/api')) return null;
      next.searchParams.set('cms', '1');
      return next.pathname + next.search + next.hash;
    } catch (error) {
      return null;
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-cms-type][data-cms-id]').forEach(function (element) {
      element.setAttribute('tabindex', '0');
      element.setAttribute('role', 'button');
      element.setAttribute('aria-label', '编辑' + (labelMap[element.dataset.cmsType] || '内容'));

      function openEditor(event) {
        event.preventDefault();
        event.stopPropagation();
        notifyParent({
          action: 'edit',
          type: element.dataset.cmsType,
          id: element.dataset.cmsId,
          label: element.dataset.cmsLabel || '',
          content: element.dataset.cmsType === 'page-content' ? element.innerHTML : ''
        });
      }

      element.addEventListener('click', openEditor);
      element.addEventListener('keydown', function (event) {
        if (event.key === 'Enter' || event.key === ' ') openEditor(event);
      });
    });

    document.querySelectorAll('a[href]').forEach(function (link) {
      if (link.dataset.cmsType || link.getAttribute('href').startsWith('javascript:')) return;
      const cmsUrl = keepCmsMode(link.href);
      if (!cmsUrl) return;
      link.removeAttribute('target');
      link.href = cmsUrl;
    });

    notifyParent({
      action: 'ready',
      path: window.location.pathname,
      title: document.title.replace(/\s*-\s*电磁频谱认知智能通信实验室\s*$/, '')
    });
  });
})();
