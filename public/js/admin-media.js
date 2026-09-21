// 后台媒体字段小工具：图片上传 + 封面图预览 / 清除
// 供论文、专利、项目三个管理页共用，避免同一段逻辑抄三遍。
(function () {
  const adminMedia = {
    // 上传图片到 /api/upload，把返回地址写入隐藏字段，可选同步预览图
    async uploadToField(input, fieldId, previewId) {
      if (!input.files || !input.files[0]) return;
      const form = new FormData();
      form.append('file', input.files[0]);
      try {
        const response = await fetch('/api/upload', {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + (localStorage.getItem('token') || '') },
          body: form
        });
        const data = await response.json();
        if (!data.success) {
          alert(data.message || '上传失败');
          return;
        }
        const field = document.getElementById(fieldId);
        if (field) field.value = data.url;
        if (previewId) adminMedia.setCover(previewId, data.url);
      } catch (error) {
        alert('上传失败');
      } finally {
        input.value = '';
      }
    },

    setCover(previewId, url) {
      const preview = document.getElementById(previewId);
      if (!preview) return;
      if (url) {
        preview.src = url;
        preview.style.display = 'inline-block';
      } else {
        preview.removeAttribute('src');
        preview.style.display = 'none';
      }
    },

    clearCover(valueId, previewId) {
      const field = document.getElementById(valueId);
      if (field) field.value = '';
      adminMedia.setCover(previewId, '');
    },

    // 表格里显示「已填写 / 待补充」状态
    introBadge(hasContent) {
      return hasContent
        ? '<span style="color:#2e7d32;">已填写</span>'
        : '<span style="color:#b26a00;">待补充</span>';
    },

    escapeHtml(value) {
      return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
      });
    }
  };

  window.adminMedia = adminMedia;
})();
