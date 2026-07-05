/**
 * 模块 1：一键内联逻辑
 * 处理文件夹上传、版本脚本加载、配置导出
 */
(function() {
  const versionSelect = document.getElementById('versionSelect');
  const imageModeSelect = document.getElementById('imageModeSelect');
  const imageBaseInput = document.getElementById('imageBaseInput');
  const uploadApiInput = document.getElementById('uploadApiInput');
  const htmlSelect = document.getElementById('htmlSelect');
  const folderInput = document.getElementById('folderInput');
  
  let currentScript = null;

  function loadScript(src) {
    if (currentScript) {
      currentScript.remove();
    }
    const script = document.createElement('script');
    script.src = src;
    script.id = 'dynamic-version-script';
    document.body.appendChild(script);
    currentScript = script;
  }

  // 填充 HTML 选择下拉框
  folderInput.addEventListener('change', function() {
    const htmlFiles = Array.from(folderInput.files)
      .filter(f => f.name.toLowerCase().endsWith('.html'));
    
    htmlSelect.innerHTML = '';
    htmlFiles.forEach(f => {
      const path = f.webkitRelativePath || f.name;
      const opt = document.createElement('option');
      opt.value = path;
      opt.textContent = path;
      htmlSelect.appendChild(opt);
    });
  });

  // 版本切换
  versionSelect.addEventListener('change', function() {
    loadScript(this.value);
  });

  // 默认加载
  loadScript(versionSelect.value);

  // 挂载全局工具方法供 main-*.js 调用
  window.getSelectedHtmlFile = () => htmlSelect.value;
  window.getImageProcessConfig = () => ({
    mode: imageModeSelect.value,
    baseUrl: imageBaseInput.value,
    uploadApi: uploadApiInput.value
  });
})();
