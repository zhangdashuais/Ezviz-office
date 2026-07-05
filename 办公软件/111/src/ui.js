/**
 * UI 核心逻辑：Tab 切换与页面标题更新
 */
(function() {
  const navItems = document.querySelectorAll('.nav-item');
  const tabContents = document.querySelectorAll('.tab-content');
  const pageTitle = document.getElementById('pageTitle');
  const navLabels = document.querySelectorAll('.nav-label');

  // 处理分组展开/折叠
  navLabels.forEach(label => {
    label.addEventListener('click', () => {
      const group = label.parentElement;
      group.classList.toggle('collapsed');
    });
  });

  navItems.forEach(item => {
    item.addEventListener('click', () => {
      // 切换导航状态
      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');

      // 切换内容区域
      const target = item.getAttribute('data-target');
      tabContents.forEach(c => c.classList.remove('active'));
      const activeContent = document.getElementById(target);
      if (activeContent) activeContent.classList.add('active');

      // 更新标题
      if (pageTitle) {
        pageTitle.textContent = item.textContent.trim();
      }
    });
  });
})();
