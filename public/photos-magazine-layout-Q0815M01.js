(() => {
  if (window.__PE_PHOTOS_MAGAZINE_LAYOUT_Q0815M01__) return;
  window.__PE_PHOTOS_MAGAZINE_LAYOUT_Q0815M01__ = true;

  let scheduled = false;
  const cleanText = (node) => (node?.textContent || '').replace(/\s+/g, ' ').trim();
  const setHidden = (node, hidden) => {
    if (node && node.hidden !== hidden) node.hidden = hidden;
  };

  const applyLayout = () => {
    scheduled = false;
    const photosHeading = [...document.querySelectorAll('h1')]
      .find((node) => cleanText(node) === 'PHOTOS');
    if (!photosHeading) return;

    const root = photosHeading.closest('main') || document.getElementById('root');
    if (!root) return;
    const tabs = [...root.querySelectorAll('button')]
      .filter((button) => ['精选', '找照片', '杂志'].includes(cleanText(button)));
    const activeTab = tabs.find((button) => button.getAttribute('aria-pressed') === 'true');
    const activeSection = cleanText(activeTab);
    if (!activeSection) return;

    // 新版组件已经在 React 内完成了同一布局；桥接脚本只兼容正在评审的旧线上 chunk。
    const nativeCompactSection = root.querySelector('[aria-label="杂志收录"]');
    if (nativeCompactSection && nativeCompactSection.parentElement?.dataset.peMagazineCompact !== '1') return;

    const connectionTitle = [...root.querySelectorAll('strong')].find((node) => {
      const value = cleanText(node);
      return value === '照片源尚未连接' || value === '杂志收录' || /^(手机相册|网页选择)已连接/.test(value);
    });
    const connectionSection = connectionTitle?.closest('section');
    const connectionWrapper = connectionSection?.parentElement;
    const content = connectionWrapper?.parentElement;
    if (!connectionSection || !connectionWrapper || !content) return;
    if (!connectionWrapper.dataset.peHasLibrary) {
      connectionWrapper.dataset.peHasLibrary = /已连接/.test(cleanText(connectionTitle)) ? '1' : '0';
    }
    const hasLibrary = connectionWrapper.dataset.peHasLibrary === '1';

    if (activeSection === '杂志') {
      setHidden(connectionWrapper, true);

      const statusLine = [...content.querySelectorAll('div')]
        .find((node) => /^本批已收录\s*\d+\s*张/.test(cleanText(node)));
      setHidden(statusLine, true);

      const metricGrid = [...content.querySelectorAll('div')].find((node) => {
        const value = cleanText(node);
        return value.includes('本批收录') && value.includes('带 GPS') && value.includes('已到地球')
          && node.children.length === 3;
      });
      setHidden(metricGrid?.parentElement, true);

      const hiddenRecordNotice = [...content.querySelectorAll('div')]
        .find((node) => /条已确认记录因原片缺失或相册权限撤回而隐藏/.test(cleanText(node)));
      setHidden(hiddenRecordNotice, true);
      return;
    }

    if (activeSection !== '精选') {
      setHidden(connectionWrapper, true);
      return;
    }

    setHidden(connectionWrapper, false);
    if (content.lastElementChild !== connectionWrapper) content.append(connectionWrapper);

    if (connectionWrapper.dataset.peMagazineCompact !== '1') {
      connectionWrapper.dataset.peMagazineCompact = '1';
      connectionWrapper.style.borderBottom = '0';
      connectionWrapper.style.paddingTop = '0.75rem';
      connectionWrapper.style.paddingBottom = '2rem';
      connectionSection.setAttribute('aria-label', '杂志收录');
      connectionSection.style.display = 'flex';
      connectionSection.style.alignItems = 'center';
      connectionSection.style.gap = '0.5rem';
      connectionSection.style.padding = '0.75rem';

      const header = connectionSection.firstElementChild;
      const body = header?.nextElementSibling;
      if (header) {
        header.style.flex = '1 1 auto';
        header.style.minWidth = '0';
        header.style.borderBottom = '0';
        header.style.padding = '0';
        const badge = header.lastElementChild;
        if (badge && badge !== header.firstElementChild) badge.hidden = true;
        const subtitle = header.querySelector('span.min-w-0 span');
        const match = cleanText(subtitle).match(/已确认\s*(\d+)\s*张/);
        if (connectionTitle) connectionTitle.textContent = '杂志收录';
        if (subtitle) subtitle.textContent = `进入杂志 · ${match?.[1] || 0} 张`;
      }
      if (body) {
        body.style.flex = '0 0 auto';
        body.style.padding = '0';
        const paragraph = body.querySelector('p');
        if (paragraph) paragraph.hidden = true;
        const button = body.querySelector('button');
        if (button) {
          button.textContent = hasLibrary ? '刷新照片' : '选择照片';
          button.style.marginTop = '0';
          button.style.minHeight = '2rem';
          button.style.width = 'auto';
          button.style.padding = '0.375rem 0.625rem';
          button.style.boxShadow = 'none';
        }
      }
    }
  };

  const schedule = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(applyLayout);
  };

  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['aria-pressed'],
  });
  schedule();
})();
